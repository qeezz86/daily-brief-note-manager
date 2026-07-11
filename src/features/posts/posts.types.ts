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
  | 'html_body'
  | 'image_prompt'
  | 'image_alt'
  | 'image_prompt_version'
  | 'image_prompt_updated_at'
  | 'slug'
  | 'content_status'
  | 'wordpress_url'
  | 'created_at'
  | 'updated_at'
>

export type SeoData = Pick<
  Tables<'seo_data'>,
  | 'post_id'
  | 'representative_title'
  | 'alternative_titles'
  | 'meta_description'
  | 'focus_keyword'
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
  htmlBody: string | null
  representativeTitle: string
  alternativeTitles: string[]
  metaDescription: string
  focusKeyword: string
  imagePrompt: string | null
  imageAlt: string | null
}

export type PostInsert = TablesInsert<'posts'>
export type PostUpdate = TablesUpdate<'posts'>

export interface PostFilters {
  categoryId: string
  status: ContentStatus | ''
  search: string
}
