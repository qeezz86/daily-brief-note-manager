import type { DatabaseClient } from '../../shared/supabase/client'
import { publicationErrorSchema, publicationPlanSchema, taxonomyCatalogResponseSchema, type PublicationPlan, type TaxonomyCatalogResponse } from './wordpressPublicationPreview.schema'

export class WordPressPreviewServiceError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) { super(message); this.name = 'WordPressPreviewServiceError' }
}

async function errorPayload(error: unknown): Promise<unknown> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try { return await context.clone().json() } catch { return null }
}

async function invoke(client: DatabaseClient | null, body: Record<string, string>) {
  if (!client) throw new WordPressPreviewServiceError('CLIENT_UNAVAILABLE', 'Supabase 연결이 설정되지 않았습니다.')
  const result = await client.functions.invoke('wordpress-publication-preview', { method: 'POST', body })
  if (result.error) {
    const parsed = publicationErrorSchema.safeParse(await errorPayload(result.error))
    if (parsed.success) throw new WordPressPreviewServiceError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.retryable)
    throw new WordPressPreviewServiceError('UNKNOWN', 'WordPress Dry Run 요청을 완료하지 못했습니다.', true)
  }
  return result.data
}

export async function fetchTaxonomyCatalog(client: DatabaseClient | null): Promise<TaxonomyCatalogResponse> {
  const parsed = taxonomyCatalogResponseSchema.safeParse(await invoke(client, { action: 'get-taxonomy-catalog' }))
  if (!parsed.success) throw new WordPressPreviewServiceError('INVALID_RESPONSE', 'WordPress taxonomy 응답을 확인할 수 없습니다.')
  return parsed.data
}

export async function prepareWordPressPublication(client: DatabaseClient | null, contentId: string): Promise<PublicationPlan> {
  const parsed = publicationPlanSchema.safeParse(await invoke(client, { action: 'prepare-publication', contentId }))
  if (!parsed.success) throw new WordPressPreviewServiceError('INVALID_RESPONSE', 'WordPress publication plan 응답을 확인할 수 없습니다.')
  return parsed.data
}
