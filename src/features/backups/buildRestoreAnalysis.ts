import type {
  BackupCategoryDifference,
  BackupConflictLookupResult,
  BackupRestoreAnalysis,
  BackupRestoreConflict,
  RestoreAnalysisSection,
  RestoreIdPolicyCounts,
  ValidatedBackupBundle,
} from './backupRestore.types'

export function buildRestoreAnalysis(input: {
  bundle: ValidatedBackupBundle
  differences: BackupCategoryDifference[]
  lookup: BackupConflictLookupResult
  conflicts: BackupRestoreConflict[]
  idPolicyCandidates: RestoreIdPolicyCounts
  sections: Record<string, RestoreAnalysisSection>
  relationshipValid: boolean
  secretsValid: boolean
  hasErrors: boolean
  hasWarnings: boolean
}): BackupRestoreAnalysis {
  const conflictCounts = { exact_same: 0, key_conflict: 0, id_conflict: 0, relation_conflict: 0, missing_reference: 0, safe_new: 0 }
  input.conflicts.forEach((conflict) => { conflictCounts[conflict.type] += 1 })
  return {
    validationVersion: 1,
    backupFingerprint: input.bundle.checksum.value,
    checksumValue: input.bundle.checksum.value,
    schemaVersion: input.bundle.schemaVersion,
    profile: input.bundle.profile,
    exportedAt: input.bundle.exportedAt,
    categoryCompatibility: {
      status: input.differences.some((item) => item.severity === 'error') ? 'incompatible' : input.differences.length ? 'warning' : 'compatible',
      differences: input.differences,
    },
    sectionCounts: input.bundle.manifest.sectionCounts,
    conflictCounts,
    conflicts: input.conflicts.filter((conflict) => conflict.type !== 'safe_new'),
    idPolicyCandidates: input.idPolicyCandidates,
    sections: input.sections,
    databaseLookupStatus: input.lookup.databaseCheck,
    relationshipValidation: input.relationshipValid ? 'passed' : 'failed',
    sensitiveDataScan: input.secretsValid ? 'passed' : 'failed',
    recommendedNextAction: input.hasErrors ? 'fix_backup' : input.hasWarnings ? 'review_warnings' : 'continue_to_restore_planning',
  }
}
