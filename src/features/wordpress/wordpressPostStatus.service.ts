import type { DatabaseClient } from '../../shared/supabase/client'
import { parseWordPressPostStatusError, parseWordPressPostStatusSuccess, type WordPressPostStatusInput, type WordPressPostStatusSuccess } from './wordpressPostStatus.schema'

export class WordPressPostStatusServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'WordPressPostStatusServiceError' }
}
async function errorPayload(error: unknown): Promise<unknown> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try { return await context.clone().json() } catch { return null }
}
export async function checkWordPressPostStatus(client: DatabaseClient | null, input: WordPressPostStatusInput): Promise<WordPressPostStatusSuccess> {
  if (!client) throw new WordPressPostStatusServiceError('CLIENT_UNAVAILABLE', 'Supabase 연결이 설정되지 않았습니다.')
  const result = await client.functions.invoke('wordpress-post-status', { method: 'POST', body: { action: 'check-post-status', contentId: input.contentId, attemptId: input.attemptId } })
  if (result.error) {
    const parsed = parseWordPressPostStatusError(await errorPayload(result.error))
    if (parsed) throw new WordPressPostStatusServiceError(parsed.error.code, parsed.error.message)
    throw new WordPressPostStatusServiceError('CLIENT_RESULT_UNCERTAIN', 'WordPress 상태 확인 응답을 안전하게 확인하지 못했습니다.')
  }
  const parsed = parseWordPressPostStatusSuccess(result.data)
  if (!parsed) throw new WordPressPostStatusServiceError('CLIENT_RESULT_UNCERTAIN', 'WordPress 상태 확인 응답을 안전하게 확인하지 못했습니다.')
  return parsed
}
