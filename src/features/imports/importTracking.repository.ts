import { z } from 'zod'
import type { Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { mapImportTrackingPayload } from './mapImportTrackingPayload'
import { mapKnownTrackingImportError } from './mapImportTrackingError'

const resultSchema = z.object({
  postId: z.string().uuid(),
  topicCount: z.number().int().nonnegative(),
  reusedTopicCount: z.number().int().nonnegative(),
  createdTopicCount: z.number().int().nonnegative(),
  updateCount: z.number().int().nonnegative(),
  followupCount: z.number().int().nonnegative(),
  sourceLinkCount: z.number().int().nonnegative(),
}).strict()

export async function importNewsTrackingForPost(client: DatabaseClient, postId: string, tracking: unknown) {
  const payload = mapImportTrackingPayload(tracking)
  const { data, error } = await client.rpc('import_news_tracking_for_post', {
    p_post_id: postId,
    p_tracking: payload as unknown as Json,
  })
  if (error) throw mapKnownTrackingImportError(error)
  const parsed = resultSchema.safeParse(data)
  if (!parsed.success) throw mapKnownTrackingImportError({ code: 'PGRST202', message: 'import_news_tracking_for_post response mismatch' })
  return parsed.data
}
