import { calculateRestorePlanFingerprint } from './calculateRestorePlanFingerprint'
import { restoreRecordKey } from './restorePolicies'
import type { RestorePlan, RestorePlanIssue } from './restorePlan.types'
import type { ValidatedBackupBundle } from './backupRestore.types'
import { restorePlanSchema } from './restorePlan.schema'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const executable = new Set(['create', 'preserve_id', 'remap_id'])

export function validateRestorePlanStructure(plan: RestorePlan, bundle: ValidatedBackupBundle): RestorePlanIssue[] {
  const issues: RestorePlanIssue[] = []
  if (!restorePlanSchema.safeParse(plan).success) issues.push({ code: 'RESTORE_PLAN_SCHEMA_INVALID', severity: 'error', message: '복원 계획 schema version 1 형식이 올바르지 않습니다.', section: 'plan' })
  const actualRows = Object.entries(bundle.data).reduce((sum, [, rows]) => sum + (rows?.length ?? 0), 0)
  const keys = new Set<string>()
  for (const action of plan.recordActions) {
    const key = restoreRecordKey(action.section, action.sourceId)
    if (keys.has(key)) issues.push({ code: 'RESTORE_PLAN_ACTION_DUPLICATE', severity: 'error', message: '한 source row에 action이 중복 지정되었습니다.', section: action.section, recordKey: key })
    keys.add(key)
    if (action.action === 'block' && !plan.issues.some((issue) => issue.recordKey === key && issue.severity === 'error')) issues.push({ code: 'RESTORE_PLAN_BLOCK_ACTION', severity: 'error', message: '차단된 record가 계획에 있습니다.', section: action.section, recordKey: key })
    if (action.action === 'remap_id' && (!action.targetId || !UUID_PATTERN.test(action.targetId))) issues.push({ code: 'RESTORE_PLAN_REMAP_UUID_INVALID', severity: 'error', message: 'remap target은 UUID v5여야 합니다.', section: action.section, recordKey: key })
  }
  if (plan.recordActions.length !== actualRows) issues.push({ code: 'RESTORE_PLAN_ACTION_COUNT_MISMATCH', severity: 'error', message: '모든 source row에 action이 지정되지 않았습니다.', section: 'plan' })

  for (const [section, entries] of Object.entries(plan.idMap)) {
    const targets = new Set<string>()
    for (const [sourceId, entry] of Object.entries(entries)) {
      if (entry.targetId && targets.has(entry.targetId)) issues.push({ code: 'RESTORE_PLAN_TARGET_ID_DUPLICATE', severity: 'error', message: '같은 section에서 target ID가 중복됩니다.', section, recordKey: restoreRecordKey(section, sourceId) })
      if (entry.targetId) targets.add(entry.targetId)
    }
  }

  const actionsByKey = new Map(plan.recordActions.map((action) => [restoreRecordKey(action.section, action.sourceId), action]))
  for (const action of plan.recordActions) {
    if (!executable.has(action.action)) continue
    for (const dependency of action.dependencies) {
      if (dependency.startsWith('category:')) {
        const mapping = plan.categoryMappings.find((item) => item.sourceCategoryId === dependency.slice('category:'.length))
        if (!mapping || !mapping.targetCategoryId || mapping.status === 'blocked') issues.push({ code: 'RESTORE_PLAN_CATEGORY_MAPPING_MISSING', severity: 'error', message: '필수 category mapping을 해석할 수 없습니다.', section: action.section, recordKey: restoreRecordKey(action.section, action.sourceId) })
        continue
      }
      const target = actionsByKey.get(dependency)
      if (!target || target.action === 'block' || (target.action === 'skip' && target.targetId === null)) issues.push({ code: 'RESTORE_PLAN_DEPENDENCY_UNRESOLVED', severity: 'error', message: '필수 관계 target을 해석할 수 없습니다.', section: action.section, recordKey: restoreRecordKey(action.section, action.sourceId) })
    }
  }

  const stagedKeys = plan.executionStages.filter((stage) => stage.operation !== 'link').flatMap((stage) => stage.recordKeys)
  const staged = new Set(stagedKeys)
  plan.recordActions.filter((action) => executable.has(action.action)).forEach((action) => {
    const key = restoreRecordKey(action.section, action.sourceId)
    if (!staged.has(key)) issues.push({ code: 'RESTORE_PLAN_STAGE_RECORD_MISSING', severity: 'error', message: '실행 대상 record가 stage에 없습니다.', section: action.section, recordKey: key })
    if (stagedKeys.filter((item) => item === key).length !== 1) issues.push({ code: 'RESTORE_PLAN_STAGE_RECORD_DUPLICATE', severity: 'error', message: '실행 대상 record는 한 insert stage에 정확히 한 번 있어야 합니다.', section: action.section, recordKey: key })
  })
  const stageOrder = new Map(plan.executionStages.map((stage) => [stage.name, stage.order]))
  plan.executionStages.forEach((stage) => stage.dependsOn.forEach((dependency) => {
    if (!stageOrder.has(dependency) || (stageOrder.get(dependency) ?? 0) >= stage.order) issues.push({ code: 'RESTORE_PLAN_STAGE_DEPENDENCY_INVALID', severity: 'error', message: 'execution stage dependency 순서가 올바르지 않습니다.', section: 'executionStages', recordKey: stage.name })
  }))
  const actionCount = Object.values(plan.summary.actionCounts).reduce((sum, count) => sum + count, 0)
  if (actionCount !== plan.recordActions.length || plan.summary.totalRecords !== plan.recordActions.length) issues.push({ code: 'RESTORE_PLAN_SUMMARY_MISMATCH', severity: 'error', message: 'summary count가 record action 수와 다릅니다.', section: 'summary' })
  return issues
}

export async function validateRestorePlan(plan: RestorePlan, bundle: ValidatedBackupBundle, cryptoApi?: Crypto) {
  const issues = validateRestorePlanStructure(plan, bundle)
  const fingerprint = await calculateRestorePlanFingerprint(plan, cryptoApi)
  if (fingerprint !== plan.fingerprint.value) issues.push({ code: 'RESTORE_PLAN_FINGERPRINT_MISMATCH', severity: 'error', message: '계획 fingerprint가 내용과 일치하지 않습니다.', section: 'fingerprint' })
  return { valid: issues.length === 0, issues }
}
