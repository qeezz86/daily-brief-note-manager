import type { DatabaseClient } from '../../shared/supabase/client'
import {
  wordpressDraftErrorSchema, wordpressDraftSuccessSchema,
  type WordPressDraftCreateInput, type WordPressDraftSuccess,
} from './wordpressDraftCreate.schema'

export class WordPressDraftServiceError extends Error {
  constructor(readonly code: string, message: string, readonly attemptId?: string) {
    super(message)
    this.name = 'WordPressDraftServiceError'
  }
}

async function errorPayload(error: unknown): Promise<unknown> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try { return await context.clone().json() } catch { return null }
}

export async function createWordPressDraft(client: DatabaseClient | null, input: WordPressDraftCreateInput): Promise<WordPressDraftSuccess> {
  if (!client) throw new WordPressDraftServiceError('CLIENT_UNAVAILABLE', 'Supabase 연결이 설정되지 않았습니다.')
  const result = await client.functions.invoke('wordpress-draft-create', {
    method: 'POST',
    body: {
      action: 'create-draft', contentId: input.contentId,
      expectedSourceUpdatedAt: input.expectedSourceUpdatedAt,
      expectedPayloadFingerprint: input.expectedPayloadFingerprint,
      idempotencyKey: input.idempotencyKey,
      confirmation: { confirmed: true, scope: 'single-wordpress-draft' },
    },
  })
  if (result.error) {
    const parsed = wordpressDraftErrorSchema.safeParse(await errorPayload(result.error))
    if (parsed.success) throw new WordPressDraftServiceError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.attemptId)
    throw new WordPressDraftServiceError('UNKNOWN', 'WordPress 초안 생성 결과를 확인하지 못했습니다.')
  }
  const parsed = wordpressDraftSuccessSchema.safeParse(result.data)
  if (!parsed.success) throw new WordPressDraftServiceError('INVALID_RESPONSE', 'WordPress 초안 응답을 안전하게 확인하지 못했습니다.')
  return parsed.data
}
