import type { DatabaseClient } from '../../shared/supabase/client'
import type { PostListItem } from './posts.types'

export async function getPosts(client: DatabaseClient): Promise<PostListItem[]> {
  const { data, error } = await client
    .from('posts')
    .select(
      'id, category_id, display_id, series_no, briefing_date, published_on, title, summary, slug, content_status, wordpress_url, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error('콘텐츠 목록을 불러오지 못했습니다.')
  }

  return data
}
