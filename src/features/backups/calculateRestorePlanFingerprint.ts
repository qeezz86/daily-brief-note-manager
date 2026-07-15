import { calculateBackupChecksum } from './calculateBackupChecksum'
import type { RestorePlan } from './restorePlan.types'

export function restorePlanFingerprintInput(plan: Omit<RestorePlan, 'fingerprint'> | RestorePlan) {
  return {
    planVersion: plan.planVersion,
    backup: plan.backup,
    analysisFingerprint: plan.analysis.fingerprint,
    databaseLookupStatus: plan.analysis.databaseLookupStatus,
    policies: plan.policies,
    categoryMappings: plan.categoryMappings,
    recordActions: plan.recordActions,
    idMap: plan.idMap,
    executionStages: plan.executionStages,
    summary: plan.summary,
    issues: plan.issues,
  }
}

export async function calculateRestorePlanFingerprint(
  plan: Omit<RestorePlan, 'fingerprint'> | RestorePlan,
  cryptoApi?: Crypto,
) {
  return calculateBackupChecksum(restorePlanFingerprintInput(plan), cryptoApi)
}

