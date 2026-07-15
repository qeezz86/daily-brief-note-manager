import type { Json } from '../../shared/supabase/database.types'
import type { ImportContentPostPayload } from './importExecution.types'

export type ImportJobStatus = 'preparing' | 'ready' | 'running' | 'completed' | 'completed_with_errors' | 'cancelled' | 'failed'
export type ImportJobContentStatus = 'pending' | 'running' | 'imported' | 'failed' | 'skipped_duplicate' | 'cancelled'
export type ImportJobTrackingStatus = 'not_applicable' | 'not_present' | 'pending' | 'running' | 'imported' | 'failed' | 'cancelled'
export type ImportJobOverallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ImportJobExecutionMode = 'pending' | 'all_failed' | 'content_failed' | 'tracking_failed'

export interface ImportJobSnapshot {
  schemaVersion: 1
  externalKey: string
  contentGroup: 'news' | 'ai' | 'info_db' | 'chinese'
  content: ImportContentPostPayload
  tracking: Json
}

export interface PreparedImportJobItem {
  itemIndex: number
  externalKey: string
  payloadFingerprint: string
  title: string
  categoryId: string
  validationStatus: 'ready' | 'warning'
  warningAcknowledged: boolean
  normalizedPayload: ImportJobSnapshot
}

export interface ImportJobListItem {
  id: string
  format: string
  schemaVersion: number
  sourceName: string | null
  sourceFingerprint: string
  status: ImportJobStatus
  totalCount: number
  completedCount: number
  successCount: number
  failedCount: number
  pendingCount: number
  progressPercent: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  restoredFromBackup?: boolean
  executionLocked?: boolean
  restoreOriginChecksum?: string | null
}

export interface ImportJobDetail extends ImportJobListItem {
  readyCount: number
  warningCount: number
  invalidCount: number
  duplicateCount: number
  acknowledgedWarningCount: number
  dryRunSummary: Json
  runningCount: number
  contentImportedCount: number
  contentFailedCount: number
  trackingImportedCount: number
  trackingFailedCount: number
  trackingNotPresentCount: number
  trackingNotApplicableCount: number
  cancelledCount: number
  retryableFailureCount: number
  contentRetryableFailureCount: number
  trackingRetryableFailureCount: number
  nonRetryableFailureCount: number
  cancelledAt: string | null
}

export interface ImportJobAttempt {
  id: string
  stage: 'content' | 'tracking'
  attemptNo: number
  status: 'running' | 'imported' | 'failed'
  safeErrorCode: string | null
  safeErrorMessage: string | null
  retryable: boolean
  startedAt: string
  completedAt: string | null
}

export interface ImportJobItem {
  id: string
  itemIndex: number
  externalKey: string
  payloadFingerprint: string
  title: string
  categoryId: string
  validationStatus: 'ready' | 'warning'
  warningAcknowledged: boolean
  contentStatus: ImportJobContentStatus
  trackingStatus: ImportJobTrackingStatus
  overallStatus: ImportJobOverallStatus
  postId: string | null
  contentAttemptCount: number
  trackingAttemptCount: number
  contentErrorCode: string | null
  contentErrorMessage: string | null
  contentRetryable: boolean
  trackingErrorCode: string | null
  trackingErrorMessage: string | null
  trackingRetryable: boolean
  topicCount: number | null
  reusedTopicCount: number | null
  createdTopicCount: number | null
  updateCount: number | null
  followupCount: number | null
  sourceLinkCount: number | null
  contentStartedAt: string | null
  contentCompletedAt: string | null
  trackingStartedAt: string | null
  trackingCompletedAt: string | null
  attempts: ImportJobAttempt[]
}

export interface ImportJobStageResult {
  itemId: string
  success: boolean
  idempotent: boolean
  contentStatus: ImportJobContentStatus
  trackingStatus: ImportJobTrackingStatus
  postId: string | null
  retryable?: boolean
  errorCode?: string
  errorMessage?: string
  topicCount?: number | null
  reusedTopicCount?: number | null
  createdTopicCount?: number | null
  updateCount?: number | null
  followupCount?: number | null
  sourceLinkCount?: number | null
}

export interface ImportJobFilters { status?: ImportJobStatus | ''; sourceName?: string; createdFrom?: string; createdTo?: string }
