import type { Tables, TablesInsert, TablesUpdate } from '../../shared/supabase/database.types'
import type { Category } from '../categories/categories.types'
import type { PublicationSourceInput } from './publicationFields'

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
  contentGroup?: 'news' | 'ai' | 'info_db' | 'chinese' | ''
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
  tags: string[]
  sources: PublicationSourceInput[]
  chineseMetadata?: ChineseMetadataInput | null
  aiMetadata?: AiMetadataInput | null
  infoDbMetadata?: InfoDbMetadataInput | null
}

export type ChineseMetadata = Pick<
  Tables<'chinese_metadata'>,
  | 'post_id'
  | 'learning_topic'
  | 'program_name'
  | 'original_title'
  | 'original_url'
  | 'original_published_at'
  | 'episode_list_included'
  | 'verified_core_fact'
  | 'difficulty'
  | 'learning_points'
>

export interface ChineseMetadataInput {
  learningTopic: string | null
  programName: string | null
  originalTitle: string | null
  originalUrl: string | null
  originalPublishedAt: string | null
  episodeListIncluded: boolean | null
  verifiedCoreFact: string | null
  difficulty: string | null
  learningPoints: string | null
}

export type AiMetadata = Pick<
  Tables<'ai_metadata'>,
  'post_id' | 'field_name' | 'difficulty' | 'estimated_read_min'
>

export interface AiMetadataInput {
  fieldName: string | null
  difficulty: string | null
  estimatedReadMin: number | null
}

export type InfoDbMetadata = Pick<
  Tables<'info_db_metadata'>,
  'post_id' | 'field_name' | 'difficulty' | 'estimated_read_min' | 'reference_date'
>

export interface InfoDbMetadataInput extends AiMetadataInput {
  referenceDate: string | null
}

export type PostTag = Pick<Tables<'tags'>, 'id' | 'name'>
export type PostSource = Pick<
  Tables<'sources'>,
  | 'id'
  | 'source_name'
  | 'source_title'
  | 'source_url'
  | 'source_published_at'
  | 'checked_point'
  | 'sort_order'
>

export type PostInsert = TablesInsert<'posts'>
export type PostUpdate = TablesUpdate<'posts'>

export interface PostFilters {
  categoryId: string
  status: ContentStatus | ''
  search: string
}
