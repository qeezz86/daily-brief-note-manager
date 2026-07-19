import type { DatabaseClient } from '../../shared/supabase/client'
import { wordpressPublicationAttemptSchema, type WordPressPublicationAttempt } from './wordpressDraftCreate.schema'

export async function getWordPressPublicationAttempts(client: DatabaseClient, contentId: string): Promise<WordPressPublicationAttempt[]> {
  const result = await client.from('wordpress_publication_attempts').select(
    'id,operation,status,started_at,completed_at,created_at,wordpress_post_id,wordpress_post_status,wordpress_post_slug,wordpress_post_link,error_code,actual_payload_fingerprint',
  ).eq('content_id', contentId).order('created_at', { ascending: false })
  if (result.error) throw new Error('WordPress 초안 이력을 불러오지 못했습니다.')
  return wordpressPublicationAttemptSchema.array().parse(result.data ?? [])
}
