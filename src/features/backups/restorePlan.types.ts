import type { BackupProfile } from './backup.types'
import type { ValidatedBackupBundle } from './backupRestore.types'
import type { ExistingRestoreRecord, BackupCategoryManifestEntry, BackupConflictLookupResult } from './backupRestore.types'

export type RestorePlanStatus = 'ready' | 'warning' | 'blocked'
export type RestoreRecordAction = 'create' | 'preserve_id' | 'remap_id' | 'reuse_existing' | 'skip' | 'block'
export type RestorePlanIssueSeverity = 'error' | 'warning' | 'info'

export interface RestorePolicies {
  idConflict: 'remap' | 'block'
  identicalData: 'reuse' | 'skip'
  operationalHistory: 'include' | 'exclude'
  inactiveCategory: 'allow' | 'block'
  patternDifference: 'use_current' | 'block'
  timestamps: 'preserve' | 'database_default'
  recordOverrides: Record<string, Extract<RestoreRecordAction, 'remap_id' | 'reuse_existing' | 'skip' | 'block'>>
}

export interface RestoreCategoryMapping {
  sourceCategoryId: string
  targetCategoryId: string | null
  status: 'compatible' | 'warning' | 'blocked'
  warnings: string[]
}

export interface RestoreRecordPlan {
  section: string
  sourceId: string
  targetId: string | null
  action: RestoreRecordAction
  conflictType: 'safe_new' | 'exact_same' | 'id_conflict' | 'key_conflict' | 'relation_conflict' | 'missing_reference' | 'policy_excluded'
  reasonCode: string
  dependencies: string[]
  warnings: string[]
  safeDisplay: string
  details?: Record<string, string | number | boolean | null>
}

export interface RestoreIdMapEntry {
  action: Extract<RestoreRecordAction, 'preserve_id' | 'remap_id' | 'reuse_existing' | 'skip' | 'block'>
  targetId: string | null
}

export type RestoreIdMap = Record<string, Record<string, RestoreIdMapEntry>>

export interface RestoreExecutionStage {
  order: number
  name: string
  operation: 'insert' | 'insert_without_previous' | 'link' | 'counter_max'
  recordKeys: string[]
  dependsOn: string[]
}

export interface RestorePlanSummary {
  totalRecords: number
  actionCounts: Record<RestoreRecordAction, number>
  sectionCounts: Record<string, number>
  expectedCreateRows: number
  expectedReuseRows: number
  expectedSkippedRows: number
  blockedRows: number
  categoryWarningCount: number
  operationalHistory: 'included' | 'excluded' | 'not_present'
}

export interface RestorePlanIssue {
  code: string
  severity: RestorePlanIssueSeverity
  message: string
  section: string
  recordKey?: string
}

export interface RestorePlan {
  format: 'daily-brief-note-restore-plan'
  schemaVersion: 1
  planVersion: 1
  status: RestorePlanStatus
  createdAt: string
  backup: {
    format: 'daily-brief-note-backup'
    schemaVersion: 1
    profile: BackupProfile
    checksum: string
    exportedAt: string
  }
  analysis: {
    fingerprint: string
    createdAt: string
    databaseLookupStatus: BackupConflictLookupResult['databaseCheck']
    recheckRequiredBeforeExecution: true
  }
  policies: RestorePolicies
  categoryMappings: RestoreCategoryMapping[]
  recordActions: RestoreRecordPlan[]
  idMap: RestoreIdMap
  executionStages: RestoreExecutionStage[]
  summary: RestorePlanSummary
  issues: RestorePlanIssue[]
  fingerprint: { algorithm: 'SHA-256'; value: string }
}

export interface RestoreTargetCollision { section: string; id: string }

export interface BuildRestorePlanInput {
  bundle: ValidatedBackupBundle
  currentCategories: BackupCategoryManifestEntry[]
  lookup: BackupConflictLookupResult
  policies: RestorePolicies
  targetCollisions?: RestoreTargetCollision[]
  now?: Date
  cryptoApi?: Crypto
}

export interface RestoreCandidate {
  section: string
  sourceId: string
  entityId?: string
  reference: string
  categoryId?: string
  keys: string[]
  signature: string
  dependencies: string[]
  row: Record<string, unknown>
}

export interface RestoreCandidateMatch {
  candidate: RestoreCandidate
  conflictType: RestoreRecordPlan['conflictType']
  existing?: ExistingRestoreRecord
}
