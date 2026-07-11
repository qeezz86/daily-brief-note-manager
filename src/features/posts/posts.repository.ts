import type { DatabaseClient } from '../../shared/supabase/client'
import { buildDisplayId } from './postIdentifiers'
import type {
  CreatePostInput,
  PostDetail,
  PostInsert,
  PostListItem,
  PostSource,
  PostTag,
  SeoData,
  UpdatePostInput,
} from './posts.types'

const postDetailFields =
  'id, category_id, display_id, series_no, briefing_date, published_on, title, summary, html_body, slug, content_status, wordpress_url, image_prompt, image_alt, image_prompt_version, image_prompt_updated_at, created_at, updated_at'

const seoDataFields =
  'post_id, representative_title, alternative_titles, meta_description, focus_keyword'

interface RepositoryError {
  code?: string
  message?: string
  details?: string
}

function throwPostError(error: RepositoryError): never {
  const detail = `${error.message ?? ''} ${error.details ?? ''}`

  if (error.code === '23505') {
    if (detail.includes('posts_owner_slug_key')) {
      throw new Error('동일한 slug가 이미 존재합니다.')
    }

    if (detail.includes('posts_owner_news_date_key')) {
      throw new Error('같은 날짜의 카테고리 브리핑이 이미 존재합니다.')
    }

    if (detail.includes('posts_owner_series_no_key')) {
      throw new Error('해당 시리즈 번호가 이미 존재합니다.')
    }

    if (detail.includes('posts_owner_wordpress_url_key')) {
      throw new Error('동일한 WordPress URL이 이미 존재합니다.')
    }

    throw new Error('중복된 콘텐츠가 이미 존재합니다.')
  }

  throw new Error('콘텐츠를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

function throwPostEditorError(error: RepositoryError): never {
  if (error.code === '23505') throwPostError(error)
  if (error.code === '42501') {
    throw new Error('수정할 콘텐츠를 찾을 수 없거나 접근 권한이 없습니다.')
  }
  const detail = `${error.message ?? ''} ${error.details ?? ''}`
  if (detail.includes('TAG_COUNT')) throw new Error('태그는 5개 이상 8개 이하로 입력해 주세요.')
  if (detail.includes('TAG_FORBIDDEN_CATEGORY')) throw new Error('카테고리명은 태그로 사용할 수 없습니다.')
  if (detail.includes('TAG_DUPLICATE')) throw new Error('동일한 태그가 이미 입력되어 있습니다.')
  if (detail.includes('SOURCE_DUPLICATE')) throw new Error('출처 URL이 중복되었습니다.')
  if (detail.includes('SOURCE_REQUIRED') || detail.includes('SOURCE_INCOMPLETE')) throw new Error('출처 정보를 모두 입력해 주세요.')

  throw new Error(
    '콘텐츠 편집 정보를 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.',
  )
}

export async function getPostTags(client: DatabaseClient, postId: string): Promise<PostTag[]> {
  const { data, error } = await client
    .from('post_tags')
    .select('tag_id, tags!inner(id, name)')
    .eq('post_id', postId)

  if (error) throw new Error('태그를 불러오지 못했습니다.')
  return data.map((row) => row.tags)
}

export async function getPostSources(client: DatabaseClient, postId: string): Promise<PostSource[]> {
  const { data, error } = await client
    .from('sources')
    .select('id, source_name, source_title, source_url, source_published_at, checked_point, sort_order')
    .eq('post_id', postId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error('출처를 불러오지 못했습니다.')
  return data
}

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

export async function getPostById(
  client: DatabaseClient,
  postId: string,
): Promise<PostDetail | null> {
  const { data, error } = await client
    .from('posts')
    .select(postDetailFields)
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    if (error.code === '22P02' || error.code === 'PGRST116') return null
    throw new Error('콘텐츠 상세 정보를 불러오지 못했습니다.')
  }

  return data
}

export async function getSeoDataByPostId(
  client: DatabaseClient,
  postId: string,
): Promise<SeoData | null> {
  const { data, error } = await client
    .from('seo_data')
    .select(seoDataFields)
    .eq('post_id', postId)
    .maybeSingle()

  if (error) {
    if (error.code === '22P02' || error.code === 'PGRST116') return null
    throw new Error('SEO 정보를 불러오지 못했습니다.')
  }

  return data
}

export async function issueSeriesNo(
  client: DatabaseClient,
  ownerId: string,
  categoryId: string,
): Promise<number> {
  const { data, error } = await client.rpc('issue_series_no', {
    p_owner_id: ownerId,
    p_category_id: categoryId,
  })

  if (error || data === null) {
    throw new Error('시리즈 번호를 발급하지 못했습니다. 저장하지 않았습니다.')
  }

  return data
}

export async function createPost(
  client: DatabaseClient,
  input: CreatePostInput,
): Promise<PostDetail> {
  const isNews = input.category.content_group === 'news'
  const seriesNo = isNews
    ? null
    : await issueSeriesNo(client, input.ownerId, input.category.id)
  const displayId = buildDisplayId(input.category, {
    date: input.briefingDate,
    seriesNo,
  })
  const insert: PostInsert = {
    owner_id: input.ownerId,
    category_id: input.category.id,
    series_no: seriesNo,
    briefing_date: isNews ? input.briefingDate : null,
    published_on: input.publishedOn,
    display_id: displayId,
    title: input.title,
    summary: input.summary,
    html_body: null,
    slug: input.slug,
    wordpress_url: input.wordpressUrl,
    content_status: input.contentStatus,
    source_import_type: 'manual_entry',
  }

  const { data, error } = await client
    .from('posts')
    .insert(insert)
    .select(postDetailFields)
    .single()

  if (error) throwPostError(error)

  return data
}

export async function updatePost(
  client: DatabaseClient,
  postId: string,
  input: UpdatePostInput,
): Promise<PostDetail> {
  const { data, error } = await client.rpc('save_post_publication_bundle', {
    p_post_id: postId,
    p_title: input.title,
    p_summary: input.summary,
    p_slug: input.slug,
    p_content_status: input.contentStatus,
    // Supabase type generation marks nullable SQL function parameters as strings.
    // The RPC accepts SQL NULL, so preserve the runtime values with assertions.
    p_published_on: input.publishedOn!,
    p_wordpress_url: input.wordpressUrl!,
    p_html_body: input.htmlBody!,
    p_image_prompt: input.imagePrompt!,
    p_image_alt: input.imageAlt!,
    p_representative_title: input.representativeTitle,
    p_alternative_titles: input.alternativeTitles,
    p_meta_description: input.metaDescription,
    p_focus_keyword: input.focusKeyword,
    p_tags: input.tags,
    p_sources: input.sources.map((source, sortOrder) => ({
      source_name: source.sourceName,
      source_title: source.sourceTitle,
      source_url: source.sourceUrl,
      source_published_at: source.sourcePublishedAt || null,
      checked_point: source.checkedPoint,
      sort_order: sortOrder,
    })),
  })

  if (error) throwPostEditorError(error)
  if (!data) throw new Error('수정할 콘텐츠를 찾을 수 없습니다.')

  return data
}

export async function archivePost(
  client: DatabaseClient,
  postId: string,
): Promise<PostDetail> {
  const { data, error } = await client
    .from('posts')
    .update({ content_status: 'archived' })
    .eq('id', postId)
    .select(postDetailFields)
    .maybeSingle()

  if (error) throwPostError(error)
  if (!data) throw new Error('보관할 콘텐츠를 찾을 수 없습니다.')

  return data
}
