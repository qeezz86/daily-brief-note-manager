import type { DatabaseClient } from '../../shared/supabase/client'
import { getBackupConflictReferenceData, getBackupRestoreCategories, getBackupRestoreTargetCollisions } from './backupConflicts.repository'
import { buildRestorePlan } from './buildRestorePlan'
import { restorePlanSchema } from './restorePlan.schema'
import type { RestorePlan } from './restorePlan.types'
import { validateBackupForRestore } from './validateBackupForRestore'
import { validateRestorePlan } from './validateRestorePlan'

export interface RestoreExecutionValidation {
  valid: boolean
  issues: Array<{ code: string; message: string }>
  bundle: Awaited<ReturnType<typeof validateBackupForRestore>>['bundle']
  plan: RestorePlan | null
  categories: Awaited<ReturnType<typeof getBackupRestoreCategories>>
}

export async function validateRestoreExecution(client: DatabaseClient, backupValue: unknown, planValue: unknown): Promise<RestoreExecutionValidation> {
  const issues: RestoreExecutionValidation['issues'] = []
  const parsedPlan = restorePlanSchema.safeParse(planValue)
  if (!parsedPlan.success) return { valid: false, issues: [{ code: 'RESTORE_PLAN_SCHEMA_INVALID', message: '복원 계획 schema version 1 형식이 올바르지 않습니다.' }], bundle: null, plan: null, categories: [] }
  const plan = parsedPlan.data as RestorePlan
  const categories = await getBackupRestoreCategories(client)
  const local = await validateBackupForRestore(backupValue, { currentCategories: categories })
  if (!local.bundle || !local.canQueryDatabase) {
    local.result.issues.filter((issue) => issue.severity === 'error').forEach((issue) => issues.push({ code: issue.code, message: issue.message }))
    return { valid: false, issues, bundle: local.bundle, plan, categories }
  }
  const planValidation = await validateRestorePlan(plan, local.bundle)
  planValidation.issues.forEach((issue) => issues.push({ code: issue.code, message: issue.message }))
  if (plan.backup.checksum !== local.bundle.checksum.value) issues.push({ code: 'RESTORE_BACKUP_PLAN_CHECKSUM_MISMATCH', message: '계획이 선택한 백업 checksum과 연결되지 않습니다.' })
  if (plan.backup.profile !== local.bundle.profile || plan.backup.schemaVersion !== local.bundle.schemaVersion) issues.push({ code: 'RESTORE_BACKUP_PLAN_PROFILE_MISMATCH', message: '백업 profile 또는 schema version이 계획과 다릅니다.' })
  if (plan.status !== 'ready' || plan.issues.some((issue) => issue.severity !== 'info')) issues.push({ code: 'RESTORE_PLAN_NOT_READY', message: 'warning 또는 blocked issue가 없는 ready 계획만 실행할 수 있습니다.' })
  const operationalSections = ['importJobs', 'importJobItems', 'importJobItemAttempts'] as const
  if (plan.policies.operationalHistory === 'include') {
    if (local.bundle.profile !== 'full' || plan.summary.operationalHistory !== 'included') {
      issues.push({ code: 'RESTORE_OPERATIONAL_HISTORY_PROFILE_INVALID', message: '운영 이력 포함 실행에는 full backup과 included 계획이 필요합니다.' })
    }
    for (const section of local.bundle.profile === 'full' && local.bundle.data ? operationalSections : []) {
      const sourceIds = new Set((local.bundle.data[section] ?? []).map((row) => row.id))
      const actions = plan.recordActions.filter((action) => action.section === section)
      if (actions.length !== sourceIds.size || actions.some((action) => !sourceIds.has(action.sourceId) || action.action === 'block')) {
        issues.push({ code: 'RESTORE_OPERATIONAL_ACTION_MISSING', message: `${section}의 실행 action이 backup source와 일치하지 않습니다.` })
      }
      if (sourceIds.size > 0 && !plan.executionStages.some((stage) => stage.name === section)) {
        issues.push({ code: 'RESTORE_OPERATIONAL_STAGE_MISSING', message: `${section} 실행 stage가 없습니다.` })
      }
    }
  } else if (plan.summary.operationalHistory === 'included') {
    issues.push({ code: 'RESTORE_OPERATIONAL_HISTORY_BLOCKED', message: '운영 이력 제외 정책과 plan summary가 일치하지 않습니다.' })
  }

  const lookup = await getBackupConflictReferenceData(client, local.bundle)
  const final = await validateBackupForRestore(backupValue, { currentCategories: categories, lookup })
  if (lookup.databaseCheck !== 'complete' || final.result.databaseCheck !== 'complete') issues.push({ code: 'RESTORE_DATABASE_LOOKUP_INCOMPLETE', message: '실행 직전 DB 충돌 조회가 완전하지 않습니다.' })
  final.result.issues.filter((issue) => issue.severity === 'error').forEach((issue) => issues.push({ code: issue.code, message: issue.message }))
  const provisional = await buildRestorePlan({ bundle: local.bundle, currentCategories: categories, lookup, policies: structuredClone(plan.policies) })
  const remaps = provisional.recordActions.filter((action): action is typeof action & { targetId: string } => action.action === 'remap_id' && Boolean(action.targetId)).map((action) => ({ section: action.section, id: action.targetId }))
  const collisionResult = remaps.length ? await getBackupRestoreTargetCollisions(client, remaps) : { databaseCheck: lookup.databaseCheck, collisions: [] }
  const currentPlan = collisionResult.collisions.length || collisionResult.databaseCheck !== lookup.databaseCheck
    ? await buildRestorePlan({ bundle: local.bundle, currentCategories: categories, lookup: { ...lookup, databaseCheck: collisionResult.databaseCheck }, policies: structuredClone(plan.policies), targetCollisions: collisionResult.collisions })
    : provisional
  if (currentPlan.fingerprint.value !== plan.fingerprint.value) issues.push({ code: 'RESTORE_PLAN_STALE', message: '계획 생성 후 category 또는 DB 충돌 상태가 변경되었습니다. Dry Run과 계획을 다시 생성하세요.' })
  const unique = new Map(issues.map((issue) => [issue.code, issue]))
  return { valid: unique.size === 0, issues: [...unique.values()], bundle: local.bundle, plan, categories }
}
