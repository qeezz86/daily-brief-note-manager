import type { Tables } from '../../shared/supabase/database.types'

export const contentStatuses = [
  'draft',
  'ready',
  'published',
  'archived',
] as const

export type ContentStatus = (typeof contentStatuses)[number]

export type PostListItem = Pick<
  Tables<'posts'>,
  | 'id'
  | 'category_id'
  | 'display_id'
  | 'series_no'
  | 'briefing_date'
  | 'published_on'
  | 'title'
  | 'summary'
  | 'slug'
  | 'content_status'
  | 'wordpress_url'
  | 'updated_at'
>

export interface PostFilters {
  categoryId: string
  status: ContentStatus | ''
  search: string
}
