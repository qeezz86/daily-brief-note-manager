import { describe, expect, it } from 'vitest'
import { importJobDetailSchema, importJobItemSchema } from './importJobs.schema'

const job = {
  id: '912f6f4b-2871-46f5-a1b9-7352e0be0514', format: 'daily-brief-note-content-import', schemaVersion: 1,
  sourceName: 'source.json', sourceFingerprint: 'a'.repeat(64), status: 'ready', totalCount: 1,
  completedCount: 0, successCount: 0, failedCount: 0, pendingCount: 1, progressPercent: 0,
  createdAt: '2026-09-26T01:18:49.585179+00:00', startedAt: null, completedAt: null,
  restoredFromBackup: false, executionLocked: false, restoreOriginChecksum: null,
  readyCount: 1, warningCount: 0, invalidCount: 0, duplicateCount: 0, acknowledgedWarningCount: 0,
  dryRunSummary: {}, runningCount: 0, contentImportedCount: 0, contentFailedCount: 0,
  trackingImportedCount: 0, trackingFailedCount: 0, trackingNotPresentCount: 0,
  trackingNotApplicableCount: 1, cancelledCount: 0, retryableFailureCount: 0,
  nonRetryableFailureCount: 0, contentRetryableFailureCount: 0, trackingRetryableFailureCount: 0,
  cancelledAt: null,
}

const item = {
  id: '04597ced-e5fe-48c5-88e2-18dcd6923f37', itemIndex: 0, externalKey: 'wordpress-example',
  payloadFingerprint: 'b'.repeat(64), title: '예시', categoryId: 'chinese-study', validationStatus: 'ready',
  warningAcknowledged: false, contentStatus: 'pending', trackingStatus: 'not_applicable', overallStatus: 'pending',
  postId: null, contentAttemptCount: 0, trackingAttemptCount: 0, contentErrorCode: null,
  contentErrorMessage: null, contentRetryable: false, trackingErrorCode: null, trackingErrorMessage: null,
  trackingRetryable: false, topicCount: null, reusedTopicCount: null, createdTopicCount: null, updateCount: null,
  followupCount: null, sourceLinkCount: null, contentStartedAt: null, contentCompletedAt: null,
  trackingStartedAt: null, trackingCompletedAt: null, attempts: [],
}

describe('import job response schemas', () => {
  it('keeps required values while stripping forward-compatible job fields', () => {
    const parsed = importJobDetailSchema.parse({ ...job, serverAddedField: 'future' })
    expect(parsed.status).toBe('ready')
    expect(parsed).not.toHaveProperty('serverAddedField')
  })

  it('keeps required values while stripping forward-compatible item fields', () => {
    const parsed = importJobItemSchema.parse({ ...item, serverAddedField: 'future' })
    expect(parsed.attempts).toEqual([])
    expect(parsed).not.toHaveProperty('serverAddedField')
  })
})
