import { PostStatusError } from './errors.ts'

export interface PostStatusRequest { action: 'check-post-status'; contentId: string; attemptId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parsePostStatusRequest(value: unknown): PostStatusRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PostStatusError('UNKNOWN', 400)
  const input = value as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.length !== 3 || !keys.every((key) => ['action', 'contentId', 'attemptId'].includes(key))) throw new PostStatusError('UNKNOWN', 400)
  if (input.action !== 'check-post-status' || typeof input.contentId !== 'string' || typeof input.attemptId !== 'string'
    || !uuid.test(input.contentId) || !uuid.test(input.attemptId)) throw new PostStatusError('UNKNOWN', 400)
  return { action: 'check-post-status', contentId: input.contentId, attemptId: input.attemptId }
}
