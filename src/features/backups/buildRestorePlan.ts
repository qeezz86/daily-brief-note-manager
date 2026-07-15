import { calculateBackupChecksum } from './calculateBackupChecksum'
import { calculateRestorePlanFingerprint } from './calculateRestorePlanFingerprint'
import { createDeterministicRestoreId } from './createDeterministicRestoreId'
import { buildRestoreExecutionGraph } from './buildRestoreExecutionGraph'
import { RESTORE_PLAN_CHECKSUM_ALGORITHM, RESTORE_PLAN_FORMAT, RESTORE_PLAN_SCHEMA_VERSION, RESTORE_PLAN_VERSION } from './restorePlan.constants'
import { buildRestoreCandidates, matchRestoreCandidate } from './restorePlanCandidates'
import { isSupportedRestoreOverride, restoreRecordKey } from './restorePolicies'
import type { BackupCategoryManifestEntry } from './backupRestore.types'
import type { BuildRestorePlanInput, RestoreCategoryMapping, RestoreIdMap, RestorePlan, RestorePlanIssue, RestoreRecordAction, RestoreRecordPlan } from './restorePlan.types'
import { restorePlanSchema } from './restorePlan.schema'
import { validateRestorePlanStructure } from './validateRestorePlan'

const operationalSections = new Set(['importJobs', 'importJobItems', 'importJobItemAttempts'])

function categoryIds(input: BuildRestorePlanInput) {
  const data = input.bundle.data
  return new Set([...data.posts.map((row) => row.categoryId), ...data.seriesCounters.map((row) => row.categoryId), ...data.newsTopics.map((row) => row.categoryId), ...data.generatedPrompts.map((row) => row.categoryId), ...(data.importJobItems ?? []).map((row) => row.categoryId)])
}

function buildCategoryMappings(input: BuildRestorePlanInput): { mappings: RestoreCategoryMapping[]; issues: RestorePlanIssue[] } {
  const current = new Map(input.currentCategories.map((category) => [category.id, category]))
  const referenced = categoryIds(input)
  const mappings: RestoreCategoryMapping[] = []
  const issues: RestorePlanIssue[] = []
  for (const source of input.bundle.manifest.categoryManifest as BackupCategoryManifestEntry[]) {
    if (!referenced.has(source.id)) continue
    const target = current.get(source.id)
    const warnings: string[] = []
    let blocked = false
    if (!target) blocked = true
    else {
      if (source.contentGroup !== target.contentGroup) blocked = true
      if (source.code !== target.code) blocked = true
      if (source.name !== target.name) warnings.push('name')
      if (source.wrapperClass !== target.wrapperClass) warnings.push('wrapperClass')
      if (source.displayIdPattern !== target.displayIdPattern) warnings.push('displayIdPattern')
      if (source.slugPattern !== target.slugPattern) warnings.push('slugPattern')
      if (!target.enabled) {
        warnings.push('inactive')
        if (input.policies.inactiveCategory === 'block') blocked = true
      }
      if (warnings.some((value) => ['wrapperClass', 'displayIdPattern', 'slugPattern'].includes(value)) && input.policies.patternDifference === 'block') blocked = true
    }
    const mapping: RestoreCategoryMapping = { sourceCategoryId: source.id, targetCategoryId: target?.id ?? null, status: blocked ? 'blocked' : warnings.length ? 'warning' : 'compatible', warnings }
    mappings.push(mapping)
    if (blocked) issues.push({ code: !target ? 'RESTORE_CATEGORY_MISSING' : source.contentGroup !== target.contentGroup ? 'RESTORE_CATEGORY_GROUP_MISMATCH' : source.code !== target.code ? 'RESTORE_CATEGORY_CODE_MISMATCH' : 'RESTORE_CATEGORY_POLICY_BLOCKED', severity: 'error', message: 'category mapping을 안전하게 확정할 수 없습니다.', section: 'categoryMappings', recordKey: `category:${source.id}` })
    else warnings.forEach((field) => issues.push({ code: `RESTORE_CATEGORY_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}_DIFFERENT`, severity: 'warning', message: field === 'inactive' ? '현재 category가 비활성 상태입니다.' : '현재 category 설정을 사용하며 백업 데이터를 자동 변환하지 않습니다.', section: 'categoryMappings', recordKey: `category:${source.id}` }))
  }
  for (const id of referenced) if (!mappings.some((mapping) => mapping.sourceCategoryId === id)) {
    mappings.push({ sourceCategoryId: id, targetCategoryId: null, status: 'blocked', warnings: [] })
    issues.push({ code: 'RESTORE_CATEGORY_MANIFEST_MISSING', severity: 'error', message: '백업 category manifest에 참조 category가 없습니다.', section: 'categoryMappings', recordKey: `category:${id}` })
  }
  return { mappings: mappings.sort((left, right) => left.sourceCategoryId.localeCompare(right.sourceCategoryId)), issues }
}

function safeDisplay(reference: string) { return reference.length > 100 ? `${reference.slice(0, 97)}...` : reference }

function resolveNonEntityTarget(section: string, row: Record<string, unknown>, idMap: RestoreIdMap) {
  const mapped = (entitySection: string, id: unknown) => typeof id === 'string' ? idMap[entitySection]?.[id]?.targetId ?? null : null
  if (['seoData', 'aiMetadata', 'infoDbMetadata', 'chineseMetadata'].includes(section)) return mapped('posts', row.postId)
  if (section === 'postTags') {
    const post = mapped('posts', row.postId); const tag = mapped('tags', row.tagId)
    return post && tag ? `${post}|${tag}` : null
  }
  if (section === 'seriesCounters') return typeof row.categoryId === 'string' ? row.categoryId : null
  return null
}

function reason(action: RestoreRecordAction, conflictType: RestoreRecordPlan['conflictType']) {
  if (action === 'preserve_id') return 'RESTORE_SAFE_NEW_PRESERVE_ID'
  if (action === 'remap_id') return 'RESTORE_ID_CONFLICT_REMAP'
  if (action === 'reuse_existing') return 'RESTORE_EXACT_DATA_REUSE'
  if (action === 'skip') return conflictType === 'policy_excluded' ? 'RESTORE_OPERATIONAL_HISTORY_EXCLUDED' : 'RESTORE_DUPLICATE_SKIP'
  if (action === 'block') return conflictType === 'key_conflict' ? 'RESTORE_UNIQUE_DATA_MISMATCH' : 'RESTORE_POLICY_BLOCKED'
  return 'RESTORE_CREATE'
}

function summary(actions: RestoreRecordPlan[], categoryMappings: RestoreCategoryMapping[], profile: 'core' | 'full', operational: 'include' | 'exclude') {
  const actionCounts = { create: 0, preserve_id: 0, remap_id: 0, reuse_existing: 0, skip: 0, block: 0 }
  const sectionCounts: Record<string, number> = {}
  actions.forEach((action) => { actionCounts[action.action] += 1; if (['create', 'preserve_id', 'remap_id'].includes(action.action)) sectionCounts[action.section] = (sectionCounts[action.section] ?? 0) + 1 })
  return { totalRecords: actions.length, actionCounts, sectionCounts, expectedCreateRows: actionCounts.create + actionCounts.preserve_id + actionCounts.remap_id, expectedReuseRows: actionCounts.reuse_existing, expectedSkippedRows: actionCounts.skip, blockedRows: actionCounts.block, categoryWarningCount: categoryMappings.filter((mapping) => mapping.status === 'warning').length, operationalHistory: profile === 'full' ? operational === 'include' ? 'included' as const : 'excluded' as const : 'not_present' as const }
}

export async function buildRestorePlan(input: BuildRestorePlanInput): Promise<RestorePlan> {
  const createdAt = (input.now ?? new Date()).toISOString()
  const category = buildCategoryMappings(input)
  const issues: RestorePlanIssue[] = [...category.issues]
  if (input.lookup.databaseCheck !== 'complete') issues.push({ code: 'RESTORE_DATABASE_LOOKUP_INCOMPLETE', severity: 'error', message: 'DB 충돌 조회가 완전하지 않아 계획을 확정할 수 없습니다.', section: 'analysis' })
  const analysisFingerprint = await calculateBackupChecksum({ backupChecksum: input.bundle.checksum.value, records: input.lookup.records, databaseCheck: input.lookup.databaseCheck, categories: input.currentCategories }, input.cryptoApi)
  const candidates = buildRestoreCandidates(input.bundle)
  const matches = candidates.map((candidate) => matchRestoreCandidate(candidate, input.lookup.records))
  const idMap: RestoreIdMap = {}
  const actions: RestoreRecordPlan[] = []
  const collisions = new Set((input.targetCollisions ?? []).map((collision) => `${collision.section}:${collision.id}`))

  for (const { candidate, conflictType } of matches.filter((match) => Boolean(match.candidate.entityId))) {
    const matched = matches.find((match) => match.candidate === candidate)!
    let action: RestoreRecordAction
    let targetId: string | null
    let type = conflictType
    if (operationalSections.has(candidate.section) && input.policies.operationalHistory === 'exclude') { action = 'skip'; targetId = null; type = 'policy_excluded' }
    else if (conflictType === 'safe_new') { action = 'preserve_id'; targetId = candidate.entityId! }
    else if (conflictType === 'exact_same') { action = input.policies.identicalData === 'reuse' ? 'reuse_existing' : 'skip'; targetId = matched.existing?.id ?? candidate.entityId! }
    else if (conflictType === 'id_conflict' && input.policies.idConflict === 'remap') { action = 'remap_id'; targetId = await createDeterministicRestoreId(input.bundle.checksum.value, candidate.section, candidate.entityId!, { cryptoApi: input.cryptoApi }) }
    else { action = 'block'; targetId = null }
    const key = restoreRecordKey(candidate.section, candidate.sourceId)
    const override = input.policies.recordOverrides[key]
    if (override) {
      if (!isSupportedRestoreOverride(conflictType, override)) { action = 'block'; targetId = null; issues.push({ code: 'RESTORE_OVERRIDE_UNSUPPORTED', severity: 'error', message: '이 conflict에는 선택한 record 예외 정책을 적용할 수 없습니다.', section: candidate.section, recordKey: key }) }
      else { action = override; targetId = override === 'remap_id' ? await createDeterministicRestoreId(input.bundle.checksum.value, candidate.section, candidate.entityId!, { cryptoApi: input.cryptoApi }) : override === 'reuse_existing' || override === 'skip' ? matched.existing?.id ?? candidate.entityId! : null }
    }
    if (action === 'remap_id' && targetId && collisions.has(`${candidate.section}:${targetId}`)) { action = 'block'; issues.push({ code: 'RESTORE_REMAP_TARGET_CONFLICT', severity: 'error', message: '결정적 remap UUID가 현재 DB에 이미 존재합니다.', section: candidate.section, recordKey: key }); targetId = null }
    if (action === 'block') issues.push({ code: conflictType === 'key_conflict' ? 'RESTORE_UNIQUE_DATA_MISMATCH' : 'RESTORE_RECORD_BLOCKED', severity: 'error', message: '자동 복원이 안전하지 않은 record입니다.', section: candidate.section, recordKey: key })
    const record: RestoreRecordPlan = { section: candidate.section, sourceId: candidate.sourceId, targetId, action, conflictType: type, reasonCode: reason(action, type), dependencies: candidate.dependencies, warnings: [], safeDisplay: safeDisplay(candidate.reference) }
    actions.push(record)
    idMap[candidate.section] ??= {}; idMap[candidate.section][candidate.entityId!] = { action: action as RestoreIdMap[string][string]['action'], targetId }
  }

  for (const matched of matches.filter((match) => !match.candidate.entityId)) {
    const { candidate } = matched
    let conflictType = matched.conflictType
    let action: RestoreRecordAction = 'create'
    let targetId = resolveNonEntityTarget(candidate.section, candidate.row, idMap)
    const parent = candidate.dependencies.find((dependency) => dependency.startsWith('posts:'))
    const parentAction = parent ? actions.find((item) => restoreRecordKey(item.section, item.sourceId) === parent) : undefined
    if (operationalSections.has(candidate.section) && input.policies.operationalHistory === 'exclude') { action = 'skip'; targetId = null; conflictType = 'policy_excluded' }
    else if (['seoData', 'aiMetadata', 'infoDbMetadata', 'chineseMetadata'].includes(candidate.section) && parentAction?.action === 'reuse_existing') action = 'skip'
    else if (matched.conflictType === 'exact_same' || matched.conflictType === 'relation_conflict') action = input.policies.identicalData === 'reuse' && matched.conflictType === 'exact_same' ? 'reuse_existing' : 'skip'
    else if (matched.conflictType === 'key_conflict') action = 'block'
    if (candidate.section === 'seriesCounters') {
      const current = typeof matched.existing?.currentValue === 'number' ? matched.existing.currentValue : null
      const backup = candidate.row.lastIssuedNo as number
      const planned = Math.max(current ?? 0, backup)
      targetId = candidate.sourceId
      action = current !== null && current >= backup ? 'skip' : 'create'
      candidate.row = { ...candidate.row, plannedLastIssuedNo: planned }
    }
    const key = restoreRecordKey(candidate.section, candidate.sourceId)
    const override = input.policies.recordOverrides[key]
    if (override) {
      if (!isSupportedRestoreOverride(matched.conflictType, override)) { action = 'block'; targetId = null; issues.push({ code: 'RESTORE_OVERRIDE_UNSUPPORTED', severity: 'error', message: '이 conflict에는 선택한 record 예외 정책을 적용할 수 없습니다.', section: candidate.section, recordKey: key }) }
      else action = override
    }
    if (action === 'block' || (!targetId && action === 'create')) { action = 'block'; issues.push({ code: matched.conflictType === 'key_conflict' ? 'RESTORE_UNIQUE_DATA_MISMATCH' : 'RESTORE_DEPENDENCY_TARGET_MISSING', severity: 'error', message: '관계 target을 안전하게 해석할 수 없습니다.', section: candidate.section, recordKey: key }) }
    actions.push({ section: candidate.section, sourceId: candidate.sourceId, targetId, action, conflictType, reasonCode: reason(action, conflictType), dependencies: candidate.dependencies, warnings: [], safeDisplay: safeDisplay(candidate.reference), ...(candidate.section === 'seriesCounters' ? { details: { plannedLastIssuedNo: candidate.row.plannedLastIssuedNo as number } } : {}) })
  }

  actions.sort((left, right) => restoreRecordKey(left.section, left.sourceId).localeCompare(restoreRecordKey(right.section, right.sourceId)))
  const graph = buildRestoreExecutionGraph(input.bundle, actions); issues.push(...graph.issues)
  const planBase = {
    format: RESTORE_PLAN_FORMAT, schemaVersion: RESTORE_PLAN_SCHEMA_VERSION, planVersion: RESTORE_PLAN_VERSION, status: 'ready' as const, createdAt,
    backup: { format: input.bundle.format, schemaVersion: input.bundle.schemaVersion, profile: input.bundle.profile, checksum: input.bundle.checksum.value, exportedAt: input.bundle.exportedAt },
    analysis: { fingerprint: analysisFingerprint, createdAt, databaseLookupStatus: input.lookup.databaseCheck, recheckRequiredBeforeExecution: true as const },
    policies: structuredClone(input.policies), categoryMappings: category.mappings, recordActions: actions, idMap, executionStages: graph.stages,
    summary: summary(actions, category.mappings, input.bundle.profile, input.policies.operationalHistory), issues: [] as RestorePlanIssue[],
  }
  const provisional = { ...planBase, fingerprint: { algorithm: RESTORE_PLAN_CHECKSUM_ALGORITHM, value: '0'.repeat(64) } } as RestorePlan
  issues.push(...validateRestorePlanStructure(provisional, input.bundle))
  if (!restorePlanSchema.safeParse(provisional).success) issues.push({ code: 'RESTORE_PLAN_SCHEMA_INVALID', severity: 'error', message: '복원 계획 schema version 1 형식이 올바르지 않습니다.', section: 'plan' })
  const deduped = new Map(issues.map((issue) => [`${issue.code}|${issue.section}|${issue.recordKey ?? ''}`, issue]))
  provisional.issues = [...deduped.values()].sort((left, right) => `${left.severity}|${left.code}|${left.recordKey ?? ''}`.localeCompare(`${right.severity}|${right.code}|${right.recordKey ?? ''}`))
  provisional.status = provisional.issues.some((issue) => issue.severity === 'error') || actions.some((action) => action.action === 'block') ? 'blocked' : provisional.issues.some((issue) => issue.severity === 'warning') ? 'warning' : 'ready'
  provisional.fingerprint.value = await calculateRestorePlanFingerprint(provisional, input.cryptoApi)
  return provisional
}
