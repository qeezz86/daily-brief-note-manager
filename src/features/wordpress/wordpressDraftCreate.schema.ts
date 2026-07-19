import { z } from 'zod'

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS URL만 허용됩니다.')

export const wordpressDraftSuccessSchema = z.object({
  schemaVersion: z.literal(1), ok: z.literal(true), operation: z.literal('create-draft'),
  created: z.boolean(), idempotentReplay: z.boolean(), attemptId: z.string().uuid(),
  source: z.object({
    contentId: z.string().uuid(), sourceUpdatedAt: z.string(),
    payloadFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }).strict(),
  wordpress: z.object({
    postId: z.number().int().positive(), status: z.literal('draft'), slug: z.string().min(1), link: httpsUrl,
  }).strict(),
}).strict()

export const wordpressDraftErrorSchema = z.object({
  schemaVersion: z.literal(1), ok: z.literal(false),
  error: z.object({
    code: z.string(), message: z.string(), retryable: z.boolean(), attemptId: z.string().uuid().optional(),
  }).strict(),
}).strict()

export const wordpressPublicationAttemptSchema = z.object({
  id: z.string().uuid(), operation: z.literal('create_draft'),
  status: z.enum(['received', 'validating', 'blocked', 'executing', 'succeeded', 'failed_safe', 'uncertain']),
  started_at: z.string().nullable(), completed_at: z.string().nullable(), created_at: z.string(),
  wordpress_post_id: z.number().int().positive().nullable(), wordpress_post_status: z.string().nullable(),
  wordpress_post_slug: z.string().nullable(), wordpress_post_link: z.string().nullable(),
  error_code: z.string().nullable(), actual_payload_fingerprint: z.string().nullable(),
}).strict()

export type WordPressDraftSuccess = z.infer<typeof wordpressDraftSuccessSchema>
export type WordPressPublicationAttempt = z.infer<typeof wordpressPublicationAttemptSchema>

export interface WordPressDraftCreateInput {
  contentId: string
  expectedSourceUpdatedAt: string
  expectedPayloadFingerprint: string
  idempotencyKey: string
}
