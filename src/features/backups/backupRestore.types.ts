import type { BackupBundle, BackupData, BackupProfile } from './backup.types'
import type { ValidatedBackupData } from './backupRestore.schema'

export type ValidatedBackupBundle = Omit<BackupBundle, 'data'> & { data: ValidatedBackupData }

export type RestoreStatus = 'restorable' | 'warning' | 'not_restorable'
export type RestoreIssueSeverity = 'error' | 'warning' | 'info'
export type RestoreDatabaseCheck = 'not_run' | 'complete' | 'partial' | 'unavailable'
export type RestoreConflictType =
  | 'exact_same'
  | 'key_conflict'
  | 'id_conflict'
  | 'relation_conflict'
  | 'missing_reference'
  | 'safe_new'

export interface BackupRestoreIssue {
  code: string
  severity: RestoreIssueSeverity
  message: string
  path: string
  section: string
  recordId?: string
  detail?: string
}

export interface BackupCategoryManifestEntry {
  id: string
  contentGroup: string
  name: string
  code: string
  wrapperClass: string
  displayIdPattern: string | null
  slugPattern: string
  sortOrder: number
  enabled: boolean
}

export interface BackupCategoryDifference {
  categoryId: string
  field: keyof Omit<BackupCategoryManifestEntry, 'id'> | 'missing'
  backupValue: string | number | boolean | null
  currentValue: string | number | boolean | null
  severity: 'error' | 'warning'
  message: string
}

export interface BackupRestoreSectionResult {
  section: string
  count: number
  status: 'valid' | 'warning' | 'invalid'
  issueCount: number
}

export interface BackupRestoreConflict {
  section: string
  type: RestoreConflictType
  reference: string
  recordId?: string
  key?: string
  categoryId?: string
  message: string
}

export interface RestoreIdPolicyCounts {
  preserve: number
  remapRequired: number
  reuseCandidate: number
  conflict: number
}

export interface RestoreIdCandidate {
  reference: string
  policy: 'preserve' | 'remap_required' | 'reuse_candidate' | 'conflict'
  conflictType: RestoreConflictType
}

export interface RestoreAnalysisSection {
  total: number
  candidates: RestoreIdCandidate[]
}

export interface BackupRestoreAnalysis {
  validationVersion: 1
  backupFingerprint: string
  checksumValue: string
  schemaVersion: number
  profile: BackupProfile
  exportedAt: string
  categoryCompatibility: {
    status: 'compatible' | 'warning' | 'incompatible'
    differences: BackupCategoryDifference[]
  }
  sectionCounts: Record<string, number>
  conflictCounts: Record<RestoreConflictType, number>
  conflicts: BackupRestoreConflict[]
  idPolicyCandidates: RestoreIdPolicyCounts
  sections: Record<string, RestoreAnalysisSection>
  databaseLookupStatus: RestoreDatabaseCheck
  relationshipValidation: 'passed' | 'failed'
  sensitiveDataScan: 'passed' | 'failed'
  recommendedNextAction: 'continue_to_restore_planning' | 'review_warnings' | 'fix_backup'
}

export interface BackupRestoreResult {
  validationVersion: 1
  status: RestoreStatus
  checksumStatus: 'valid' | 'invalid' | 'unavailable'
  databaseCheck: RestoreDatabaseCheck
  compatibility: {
    schema: 'compatible' | 'incompatible'
    categories: 'compatible' | 'warning' | 'incompatible'
    profile: BackupProfile | null
  }
  summary: {
    totalRecords: number
    validSections: number
    warningCount: number
    errorCount: number
    exactConflicts: number
    idRemapCandidates: number
  }
  issues: BackupRestoreIssue[]
  sections: BackupRestoreSectionResult[]
  categoryDifferences: BackupCategoryDifference[]
  conflicts: BackupRestoreConflict[]
  restoreAnalysis: BackupRestoreAnalysis | null
}

export interface BackupRestoreParseResult {
  value: unknown | null
  issues: BackupRestoreIssue[]
  byteSize: number
}

export interface ExistingRestoreRecord {
  section: string
  id?: string
  key?: string
  categoryId?: string
  signature: string
  currentValue?: number
}

export interface BackupConflictLookupResult {
  databaseCheck: Exclude<RestoreDatabaseCheck, 'not_run'>
  records: ExistingRestoreRecord[]
}

export interface BackupRestoreValidationOutput {
  bundle: ValidatedBackupBundle | null
  data: BackupData | null
  canQueryDatabase: boolean
  result: BackupRestoreResult
}
