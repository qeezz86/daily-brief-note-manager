import type { Json } from '../../shared/supabase/database.types'

export type RestoreJobStatus = 'preparing' | 'ready' | 'running' | 'paused_with_errors' | 'completed' | 'cancelled' | 'failed'
export type RestoreJobRecordStatus = 'pending' | 'running' | 'applied' | 'reused' | 'skipped' | 'failed' | 'cancelled'

export interface PreparedRestoreRecord {
  section: string
  sourceId: string
  targetId: string | null
  action: 'create' | 'preserve_id' | 'remap_id' | 'reuse_existing' | 'skip'
  stageKey: string
  stageOrder: number
  sequenceNo: number
  payload: Json
  payloadFingerprint: string
  dependencies: string[]
  safeDisplay: string
}

export interface RestoreJobAggregate {
  id: string
  sourceName: string | null
  backupProfile: 'core' | 'full'
  backupChecksum: string
  planFingerprint: string
  status: RestoreJobStatus
  currentStageKey: string | null
  totalCount: number
  pendingCount: number
  runningCount: number
  appliedCount: number
  reusedCount: number
  skippedCount: number
  failedCount: number
  cancelledCount: number
  retryableFailureCount: number
  completedStageCount: number
  stageCount: number
  progressPercent: number
  stageProgressPercent: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt?: string | null
}

export interface RestoreJobDetail extends RestoreJobAggregate {
  backupFormat: string
  backupSchemaVersion: number
  planFormat: string
  planSchemaVersion: number
  planVersion: number
  analysisFingerprint: string
  policies: Json
  categoryMappings: Json
  executionStages: Json
}

export interface RestoreRecordAttempt {
  id: string
  attemptNo: number
  status: 'running' | 'applied' | 'reused' | 'skipped' | 'failed'
  safeErrorCode: string | null
  safeErrorMessage: string | null
  retryable: boolean | null
  startedAt: string
  completedAt: string | null
}

export interface RestoreJobRecord {
  id: string
  section: string
  sourceId: string
  targetId: string | null
  action: PreparedRestoreRecord['action']
  stageKey: string
  stageOrder: number
  sequenceNo: number
  safeDisplay: string
  status: RestoreJobRecordStatus
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
  retryable: boolean | null
  startedAt: string | null
  completedAt: string | null
  attempts: RestoreRecordAttempt[]
}

export interface RestoreRecordFilters {
  stage?: string
  section?: string
  action?: string
  status?: string
  retryable?: boolean
  search?: string
}

export interface RestoreRecordRunResult {
  recordId: string
  status: RestoreJobRecordStatus
  success: boolean
  idempotent: boolean
  errorCode?: string
  errorMessage?: string
  retryable?: boolean
}
