import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostDetail } from '../features/posts/posts.types'
import type { AiMetadata, ChineseMetadata, InfoDbMetadata, PostSource, PostTag } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentDetailPageContent } from './ContentDetailPage'

const category: Category = {
  id: 'chinese-study',
  content_group: 'chinese',
  name: '중국어 학습',
  sort_order: 80,
  display_id_pattern: null,
  slug_pattern: 'cctv-chinese-news-study-###',
  wrapper_class: 'daily-brief-note chinese-study',
}

const post: PostDetail = {
  id: 'post-1',
  category_id: 'chinese-study',
  display_id: null,
  series_no: 12,
  briefing_date: null,
  published_on: '2026-07-10',
  title: 'CCTV 뉴스로 배우는 중국어 #12',
  summary: '중국어 학습 요약',
  html_body: null,
  image_prompt: null,
  image_alt: null,
  image_prompt_version: 1,
  image_prompt_updated_at: null,
  slug: 'cctv-chinese-news-study-012',
  content_status: 'ready',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T02:00:00Z',
}

function createClient(postResult: PostDetail | null, tags: PostTag[] = [], sources: PostSource[] = [], chineseMetadata: ChineseMetadata | null = null, aiMetadata: AiMetadata | null = null, infoDbMetadata: InfoDbMetadata | null = null, activeCategory = category) {
  const categoryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  categoryBuilder.select.mockReturnValue(categoryBuilder)
  categoryBuilder.eq.mockReturnValue(categoryBuilder)
  categoryBuilder.order.mockResolvedValue({ data: [activeCategory], error: null })

  const postBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
  }
  postBuilder.select.mockReturnValue(postBuilder)
  postBuilder.eq.mockReturnValue(postBuilder)
  postBuilder.update.mockReturnValue(postBuilder)
  postBuilder.maybeSingle.mockResolvedValue({ data: postResult, error: null })

  const seoBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  seoBuilder.select.mockReturnValue(seoBuilder)
  seoBuilder.eq.mockReturnValue(seoBuilder)
  seoBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })

  const tagBuilder = { select: vi.fn(), eq: vi.fn() }
  tagBuilder.select.mockReturnValue(tagBuilder)
  tagBuilder.eq.mockResolvedValue({ data: tags.map((tag) => ({ tag_id: tag.id, tags: tag })), error: null })
  const sourceBuilder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  sourceBuilder.select.mockReturnValue(sourceBuilder)
  sourceBuilder.eq.mockReturnValue(sourceBuilder)
  sourceBuilder.order.mockResolvedValue({ data: sources, error: null })
  const chineseMetadataBuilder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  chineseMetadataBuilder.select.mockReturnValue(chineseMetadataBuilder)
  chineseMetadataBuilder.eq.mockReturnValue(chineseMetadataBuilder)
  chineseMetadataBuilder.maybeSingle.mockResolvedValue({ data: chineseMetadata, error: null })
  const aiMetadataBuilder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  aiMetadataBuilder.select.mockReturnValue(aiMetadataBuilder)
  aiMetadataBuilder.eq.mockReturnValue(aiMetadataBuilder)
  aiMetadataBuilder.maybeSingle.mockResolvedValue({ data: aiMetadata, error: null })
  const infoDbMetadataBuilder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  infoDbMetadataBuilder.select.mockReturnValue(infoDbMetadataBuilder)
  infoDbMetadataBuilder.eq.mockReturnValue(infoDbMetadataBuilder)
  infoDbMetadataBuilder.maybeSingle.mockResolvedValue({ data: infoDbMetadata, error: null })
  const newsUpdatesBuilder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  newsUpdatesBuilder.select.mockReturnValue(newsUpdatesBuilder)
  newsUpdatesBuilder.eq.mockReturnValue(newsUpdatesBuilder)
  newsUpdatesBuilder.order.mockResolvedValue({ data: [], error: null })

  return {
    client: {
      from: vi.fn((table: string) =>
        table === 'categories'
          ? categoryBuilder
          : table === 'seo_data'
            ? seoBuilder
            : table === 'post_tags'
              ? tagBuilder
              : table === 'sources'
                ? sourceBuilder
                : table === 'chinese_metadata'
                  ? chineseMetadataBuilder
                  : table === 'ai_metadata'
                    ? aiMetadataBuilder
                    : table === 'info_db_metadata'
                      ? infoDbMetadataBuilder
                      : table === 'news_updates'
                        ? newsUpdatesBuilder
                  : postBuilder,
      ),
    } as unknown as DatabaseClient,
    postBuilder,
  }
}

function renderDetail(client: DatabaseClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContentDetailPageContent
          client={client}
          userId="owner-a"
          postId="post-1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ContentDetailPage', () => {
  it('renders detail fields and uses only the Chinese series number', async () => {
    const { client } = createClient(post)
    renderDetail(client)

    expect(
      await screen.findByRole('heading', { name: post.title }),
    ).toBeInTheDocument()
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.queryByText(/브리핑 ID/)).not.toBeInTheDocument()
    expect(screen.getByText('중국어 학습 요약')).toBeInTheDocument()
    expect(screen.getByText('WordPress 본문')).toBeInTheDocument()
    expect(screen.getAllByText('SEO').length).toBeGreaterThan(0)
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0)
  })

  it('shows a safe not-found state for inaccessible content', async () => {
    const { client } = createClient(null)
    renderDetail(client)

    expect(
      await screen.findByRole('heading', { name: '콘텐츠를 찾을 수 없습니다' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/접근할 수 없는 콘텐츠/)).toBeInTheDocument()
  })

  it('archives after explicit confirmation and then hides duplicate archive action', async () => {
    const browserUser = userEvent.setup()
    const archivedPost = { ...post, content_status: 'archived' }
    const { client, postBuilder } = createClient(post)
    postBuilder.maybeSingle
      .mockResolvedValueOnce({ data: post, error: null })
      .mockResolvedValueOnce({ data: archivedPost, error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderDetail(client)

    await browserUser.click(
      await screen.findByRole('button', { name: '보관 처리' }),
    )

    expect(await screen.findByText('콘텐츠를 보관 처리했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보관 처리' })).not.toBeInTheDocument()
    expect(postBuilder.update).toHaveBeenCalledWith({ content_status: 'archived' })
  })

  it('renders tags and ordered source metadata with a safe external link', async () => {
    const tags = [{ id: 'tag-1', name: 'CCTV 중국어' }]
    const sources: PostSource[] = [{
      id: 'source-1', source_name: 'CCTV', source_title: '新闻节目',
      source_url: 'https://news.cctv.com/article/1',
      source_published_at: '2026-07-11T04:00:00Z', checked_point: '핵심 문장 확인', sort_order: 0,
    }]
    const { client } = createClient(post, tags, sources)
    renderDetail(client)

    expect(await screen.findByRole('heading', { name: 'SEO 태그 (1개)' })).toBeInTheDocument()
    expect(screen.getByText('CCTV 중국어')).toBeInTheDocument()
    expect(screen.getByText('新闻节目')).toBeInTheDocument()
    expect(screen.getByText('핵심 문장 확인')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: sources[0].source_url })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders Chinese metadata and the original URL as a safe external link', async () => {
    const chineseMetadata: ChineseMetadata = {
      post_id: post.id, learning_topic: '경제 표현', program_name: 'CCTV 뉴스', original_title: '原文标题',
      original_url: 'https://news.cctv.com/article/1', original_published_at: '2026-07-11T04:00:00Z',
      episode_list_included: false, verified_core_fact: '원문에서 학습 표현을 확인했습니다.', difficulty: '중급', learning_points: '핵심 표현 요약',
    }
    const { client } = createClient(post, [], [], chineseMetadata)
    renderDetail(client)

    expect(await screen.findByRole('heading', { name: '중국어 학습 정보' })).toBeInTheDocument()
    expect(screen.getByText('경제 표현')).toBeInTheDocument()
    expect(screen.getByText('미포함')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: chineseMetadata.original_url! })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders AI and information-DB metadata with Korean difficulty labels and safe fallbacks', async () => {
    const aiCategory = { ...category, id: 'ai-column', content_group: 'ai' as const, name: 'AI 칼럼' }
    const aiPost = { ...post, category_id: 'ai-column', title: 'AI 칼럼', slug: 'ai-001' }
    const { client: aiClient } = createClient(aiPost, [], [], null, { post_id: aiPost.id, field_name: '생성형 AI', difficulty: 'beginner', estimated_read_min: 6 }, null, aiCategory)
    const { unmount } = renderDetail(aiClient)
    expect(await screen.findByRole('heading', { name: 'AI 칼럼 정보' })).toBeInTheDocument()
    expect(screen.getByText('입문')).toBeInTheDocument()
    expect(screen.getByText('6분')).toBeInTheDocument()
    unmount()

    const infoCategory = { ...category, id: 'info-db', content_group: 'info_db' as const, name: '정보DB' }
    const infoPost = { ...post, category_id: 'info-db', title: '정보DB', slug: 'info-db-001' }
    const { client: infoClient } = createClient(infoPost, [], [], null, null, { post_id: infoPost.id, field_name: null, difficulty: 'legacy', estimated_read_min: null, reference_date: null }, infoCategory)
    renderDetail(infoClient)
    expect(await screen.findByRole('heading', { name: '정보DB 정보' })).toBeInTheDocument()
    expect(screen.getByText('legacy')).toBeInTheDocument()
    expect(screen.getAllByText('미등록').length).toBeGreaterThan(0)
  })
})
