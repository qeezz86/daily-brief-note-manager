import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'

import { PostStatusError } from './errors.ts'
import type { StoredAttempt, WordPressPostStatus } from './schemas.ts'

type Row = { id: string; owner_id: string; content_id: string; operation: string; status: string; site_origin: string; wordpress_post_id: number | null; wordpress_post_status: string | null; wordpress_post_slug: string | null; wordpress_post_link: string | null }

export async function loadSyncableAttempt(client: SupabaseClient, ownerId: string, contentId: string, attemptId: string, siteOrigin: string): Promise<StoredAttempt> {
  const result = await client.from('wordpress_publication_attempts').select('id,owner_id,content_id,operation,status,site_origin,wordpress_post_id,wordpress_post_status,wordpress_post_slug,wordpress_post_link')
    .eq('id', attemptId).eq('content_id', contentId).eq('owner_id', ownerId).maybeSingle()
  if (result.error) throw new PostStatusError('UNKNOWN')
  if (!result.data) throw new PostStatusError('ATTEMPT_NOT_FOUND', 404)
  const row = result.data as unknown as Row
  if (row.operation !== 'create_draft' || row.status !== 'succeeded' || row.site_origin !== siteOrigin
    || !Number.isSafeInteger(row.wordpress_post_id) || Number(row.wordpress_post_id) <= 0
    || !row.wordpress_post_status || !row.wordpress_post_slug || !row.wordpress_post_link) throw new PostStatusError('NO_SYNCABLE_WORDPRESS_ID', 409)
  return { id: row.id, contentId: row.content_id, wordpressPostId: Number(row.wordpress_post_id), status: row.wordpress_post_status as WordPressPostStatus, slug: row.wordpress_post_slug, link: row.wordpress_post_link }
}
