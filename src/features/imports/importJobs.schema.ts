import { z } from 'zod'

export const importJobStatusSchema = z.enum(['preparing', 'ready', 'running', 'completed', 'completed_with_errors', 'cancelled', 'failed'])
const nullableTimestamp = z.string().nullable()

export const importJobListItemSchema = z.object({
  id: z.string().uuid(), format: z.string(), schemaVersion: z.number().int(), sourceName: z.string().nullable(),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/), status: importJobStatusSchema,
  totalCount: z.number().int().nonnegative(), completedCount: z.number().int().nonnegative(), successCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(), pendingCount: z.number().int().nonnegative(),
  progressPercent: z.number().nonnegative(), createdAt: z.string(), startedAt: nullableTimestamp, completedAt: nullableTimestamp,
}).strict()

export const importJobDetailSchema = importJobListItemSchema.extend({
  readyCount: z.number().int().nonnegative(), warningCount: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative(), duplicateCount: z.number().int().nonnegative(),
  acknowledgedWarningCount: z.number().int().nonnegative(), dryRunSummary: z.unknown(),
  runningCount: z.number().int().nonnegative(), contentImportedCount: z.number().int().nonnegative(),
  contentFailedCount: z.number().int().nonnegative(), trackingImportedCount: z.number().int().nonnegative(),
  trackingFailedCount: z.number().int().nonnegative(), trackingNotPresentCount: z.number().int().nonnegative(),
  trackingNotApplicableCount: z.number().int().nonnegative(), cancelledCount: z.number().int().nonnegative(),
  retryableFailureCount: z.number().int().nonnegative(), nonRetryableFailureCount: z.number().int().nonnegative(),
  contentRetryableFailureCount: z.number().int().nonnegative(), trackingRetryableFailureCount: z.number().int().nonnegative(),
  cancelledAt: nullableTimestamp,
}).strict()

const attemptSchema = z.object({
  id: z.string().uuid(), stage: z.enum(['content', 'tracking']), attemptNo: z.number().int().positive(),
  status: z.enum(['running', 'imported', 'failed']), safeErrorCode: z.string().nullable(), safeErrorMessage: z.string().nullable(),
  retryable: z.boolean(), startedAt: z.string(), completedAt: nullableTimestamp,
}).strict()

export const importJobItemSchema = z.object({
  id: z.string().uuid(), itemIndex: z.number().int().nonnegative(), externalKey: z.string(),
  payloadFingerprint: z.string().regex(/^[0-9a-f]{64}$/), title: z.string(), categoryId: z.string(),
  validationStatus: z.enum(['ready', 'warning']), warningAcknowledged: z.boolean(),
  contentStatus: z.enum(['pending', 'running', 'imported', 'failed', 'skipped_duplicate', 'cancelled']),
  trackingStatus: z.enum(['not_applicable', 'not_present', 'pending', 'running', 'imported', 'failed', 'cancelled']),
  overallStatus: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']), postId: z.string().uuid().nullable(),
  contentAttemptCount: z.number().int().nonnegative(), trackingAttemptCount: z.number().int().nonnegative(),
  contentErrorCode: z.string().nullable(), contentErrorMessage: z.string().nullable(), contentRetryable: z.boolean(),
  trackingErrorCode: z.string().nullable(), trackingErrorMessage: z.string().nullable(), trackingRetryable: z.boolean(),
  topicCount: z.number().int().nonnegative().nullable(), reusedTopicCount: z.number().int().nonnegative().nullable(),
  createdTopicCount: z.number().int().nonnegative().nullable(), updateCount: z.number().int().nonnegative().nullable(),
  followupCount: z.number().int().nonnegative().nullable(), sourceLinkCount: z.number().int().nonnegative().nullable(),
  contentStartedAt: nullableTimestamp, contentCompletedAt: nullableTimestamp,
  trackingStartedAt: nullableTimestamp, trackingCompletedAt: nullableTimestamp, attempts: z.array(attemptSchema),
}).strict()

export const importJobStageResultSchema = z.object({
  itemId: z.string().uuid(), success: z.boolean(), idempotent: z.boolean(),
  contentStatus: z.enum(['pending', 'running', 'imported', 'failed', 'skipped_duplicate', 'cancelled']),
  trackingStatus: z.enum(['not_applicable', 'not_present', 'pending', 'running', 'imported', 'failed', 'cancelled']),
  postId: z.string().uuid().nullable(), retryable: z.boolean().optional(), errorCode: z.string().optional(), errorMessage: z.string().optional(),
  topicCount: z.number().int().nonnegative().nullable().optional(), reusedTopicCount: z.number().int().nonnegative().nullable().optional(),
  createdTopicCount: z.number().int().nonnegative().nullable().optional(), updateCount: z.number().int().nonnegative().nullable().optional(),
  followupCount: z.number().int().nonnegative().nullable().optional(), sourceLinkCount: z.number().int().nonnegative().nullable().optional(),
}).strict()
