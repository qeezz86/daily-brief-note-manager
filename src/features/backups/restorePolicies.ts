import type { RestorePolicies, RestoreRecordAction } from './restorePlan.types'

export const DEFAULT_RESTORE_POLICIES: RestorePolicies = {
  idConflict: 'remap',
  identicalData: 'reuse',
  operationalHistory: 'exclude',
  inactiveCategory: 'block',
  patternDifference: 'use_current',
  timestamps: 'preserve',
  recordOverrides: {},
}

export function restoreRecordKey(section: string, sourceId: string) {
  return `${section}:${sourceId}`
}

export function isSupportedRestoreOverride(
  conflictType: string,
  action: RestoreRecordAction,
): boolean {
  if (conflictType === 'id_conflict') return action === 'remap_id' || action === 'block'
  if (conflictType === 'exact_same' || conflictType === 'relation_conflict') {
    return action === 'reuse_existing' || action === 'skip' || action === 'block'
  }
  return action === 'block'
}

