import { z } from 'zod'

export const restoreJobStatusSchema = z.enum(['preparing', 'ready', 'running', 'paused_with_errors', 'completed', 'cancelled', 'failed'])
export const restoreRecordStatusSchema = z.enum(['pending', 'running', 'applied', 'reused', 'skipped', 'failed', 'cancelled'])

const aggregateFields = {
  id: z.string().uuid(), sourceName: z.string().nullable(), backupProfile: z.enum(['core', 'full']),
  backupChecksum: z.string(), planFingerprint: z.string(), status: restoreJobStatusSchema,
  currentStageKey: z.string().nullable(), totalCount: z.number().int().nonnegative(), pendingCount: z.number().int().nonnegative(),
  runningCount: z.number().int().nonnegative(), appliedCount: z.number().int().nonnegative(), reusedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative(), cancelledCount: z.number().int().nonnegative(),
  retryableFailureCount: z.number().int().nonnegative(), completedStageCount: z.number().int().nonnegative(), stageCount: z.number().int().nonnegative(),
  progressPercent: z.number().nonnegative(), stageProgressPercent: z.number().nonnegative(), createdAt: z.string(), startedAt: z.string().nullable(),
  completedAt: z.string().nullable(), cancelledAt: z.string().nullable().optional(),
}

export const restoreJobListSchema = z.object(aggregateFields).strict()
export const restoreJobDetailSchema = z.object({ ...aggregateFields,
  backupFormat: z.string(), backupSchemaVersion: z.number().int(), planFormat: z.string(), planSchemaVersion: z.number().int(),
  planVersion: z.number().int(), analysisFingerprint: z.string(), policies: z.unknown(), categoryMappings: z.unknown(), executionStages: z.unknown(),
}).strict()

const attemptSchema = z.object({
  id: z.string().uuid(), attemptNo: z.number().int().positive(), status: z.enum(['running', 'applied', 'reused', 'skipped', 'failed']),
  safeErrorCode: z.string().nullable(), safeErrorMessage: z.string().nullable(), retryable: z.boolean().nullable(),
  startedAt: z.string(), completedAt: z.string().nullable(),
}).strict()

export const restoreJobRecordSchema = z.object({
  id: z.string().uuid(), section: z.string(), sourceId: z.string(), targetId: z.string().nullable(),
  action: z.enum(['create', 'preserve_id', 'remap_id', 'reuse_existing', 'skip']), stageKey: z.string(),
  stageOrder: z.number().int().positive(), sequenceNo: z.number().int().nonnegative(), safeDisplay: z.string(), status: restoreRecordStatusSchema,
  attemptCount: z.number().int().nonnegative(), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), retryable: z.boolean().nullable(),
  startedAt: z.string().nullable(), completedAt: z.string().nullable(), attempts: z.array(attemptSchema),
}).strict()

export const restoreRunResultSchema = z.object({
  recordId: z.string().uuid(), status: restoreRecordStatusSchema, success: z.boolean(), idempotent: z.boolean(),
  errorCode: z.string().optional(), errorMessage: z.string().optional(), retryable: z.boolean().optional(),
}).passthrough()
