import type { Tables, TablesInsert, TablesUpdate } from '../../shared/supabase/database.types'
import type { Category } from '../categories/categories.types'

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

export type PostDetail = Pick<
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
  | 'created_at'
  | 'updated_at'
>

export interface CreatePostInput {
  ownerId: string
  category: Category
  title: string
  summary: string
  slug: string
  contentStatus: ContentStatus
  briefingDate: string | null
  publishedOn: string | null
  wordpressUrl: string | null
}

export interface UpdatePostInput {
  title: string
  summary: string
  slug: string
  contentStatus: ContentStatus
  publishedOn: string | null
  wordpressUrl: string | null
}

export type PostInsert = TablesInsert<'posts'>
export type PostUpdate = TablesUpdate<'posts'>

export interface PostFilters {
  categoryId: string
  status: ContentStatus | ''
  search: string
}
