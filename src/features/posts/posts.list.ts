import { useQuery } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import { postQueryKeys } from './posts.queries'
import type { PostFilters, PostListItem } from './posts.types'

export const POST_PAGE_SIZE = 20

export interface PostListOptions extends PostFilters {
  page: number
}

export interface PostListPage {
  posts: PostListItem[]
  count: number
  page: number
}

export async function getPosts(
  client: DatabaseClient,
  options: PostListOptions,
  signal?: AbortSignal,
): Promise<PostListPage> {
  const page = Number.isSafeInteger(options.page) && options.page > 0 ? options.page : 1
  let query = client.from('posts').select(
    'id, category_id, display_id, series_no, briefing_date, published_on, title, summary, slug, content_status, wordpress_url, updated_at',
    { count: 'exact' },
  )
  if (options.categoryId) query = query.eq('category_id', options.categoryId)
  if (options.status) query = query.eq('content_status', options.status)
  const search = options.search.trim()
  if (search) {
    // Escape regex and PostgREST syntax separately. Even *, % and _ are literal text.
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const quoted = '"' + literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    query = query.or(`title.imatch.${quoted},slug.imatch.${quoted}`)
  }
  query = query.order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * POST_PAGE_SIZE, page * POST_PAGE_SIZE - 1)
  if (signal) query = query.abortSignal(signal)
  const { data, count, error } = await query
  // Concurrent deletions can remove the requested page. Recover once at page one.
  if (page > 1 && (error?.code === 'PGRST103' || (!error && count !== null && data?.length === 0))) {
    return getPosts(client, { ...options, page: 1 }, signal)
  }
  if (error || !data || count === null) throw new Error('콘텐츠 목록을 불러오지 못했습니다.')
  return { posts: data, count, page }
}

export function usePostsQuery(client: DatabaseClient | null, userId: string, options: PostListOptions) {
  const normalized = { ...options, search: options.search.trim() }
  return useQuery({
    queryKey: [...postQueryKeys.list(userId), normalized],
    queryFn: ({ signal }) => {
      if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.')
      return getPosts(client, normalized, signal)
    },
    enabled: client !== null && userId !== '',
  })
}
