import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostListItem } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentPageContent } from './ContentPage'

const categories: Category[] = [
  { id: 'economy', content_group: 'news', name: '경제', sort_order: 10 },
  {
    id: 'technology',
    content_group: 'news',
    name: '과학기술',
    sort_order: 20,
  },
  {
    id: 'chinese-study',
    content_group: 'chinese',
    name: '중국어 학습',
    sort_order: 30,
  },
]

const posts: PostListItem[] = [
  {
    id: 'post-economy',
    category_id: 'economy',
    display_id: '#2026-07-10-ECO',
    series_no: null,
    briefing_date: '2026-07-10',
    published_on: null,
    title: '기준금리 전망 정리',
    summary: '경제 브리핑 요약',
    slug: 'economy-rate-outlook',
    content_status: 'draft',
    wordpress_url: null,
    updated_at: '2026-07-10T09:00:00.000Z',
  },
  {
    id: 'post-technology',
    category_id: 'technology',
    display_id: '#2026-07-09-TEC',
    series_no: null,
    briefing_date: '2026-07-09',
    published_on: '2026-07-09',
    title: '반도체 기술 브리핑',
    summary: '기술 브리핑 요약',
    slug: 'chip-technology-briefing',
    content_status: 'published',
    wordpress_url: 'https://example.test/chip-technology-briefing',
    updated_at: '2026-07-09T09:00:00.000Z',
  },
  {
    id: 'post-chinese',
    category_id: 'chinese-study',
    display_id: 'SHOULD-NOT-BE-DISPLAYED',
    series_no: 12,
    briefing_date: null,
    published_on: '2026-07-08',
    title: 'CCTV 뉴스로 배우는 중국어 #12',
    summary: '중국어 학습 요약',
    slug: 'cctv-chinese-news-study-012',
    content_status: 'ready',
    wordpress_url: null,
    updated_at: '2026-07-08T09:00:00.000Z',
  },
]

interface MockResult<T> {
  data: T | null
  error: { message: string } | null
}

function createQueryBuilder<T>(result: MockResult<T>) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }

  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockResolvedValue(result)

  return builder
}

function createMockClient({
  categoryResult = { data: categories, error: null },
  postResult = { data: posts, error: null },
}: {
  categoryResult?: MockResult<Category[]>
  postResult?: MockResult<PostListItem[]>
} = {}) {
  const categoryBuilder = createQueryBuilder(categoryResult)
  const postBuilder = createQueryBuilder(postResult)
  const from = vi.fn((table: string) =>
    table === 'categories' ? categoryBuilder : postBuilder,
  )

  return {
    categoryBuilder,
    client: { from } as unknown as DatabaseClient,
    from,
    postBuilder,
  }
}

function renderContent(client: DatabaseClient) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ContentPageContent client={client} userId="owner-a" />
    </QueryClientProvider>,
  )
}

describe('ContentPage', () => {
  it('loads active categories in the configured order', async () => {
    const { categoryBuilder, client } = createMockClient()
    renderContent(client)

    expect(
      await screen.findByRole(
        'option',
        { name: '경제' },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument()
    expect(categoryBuilder.eq).toHaveBeenCalledWith('enabled', true)
    expect(categoryBuilder.order).toHaveBeenCalledWith('sort_order', {
      ascending: true,
    })
  })

  it('shows a friendly category error without internal details', async () => {
    const { client } = createMockClient({
      categoryResult: {
        data: null,
        error: { message: 'sensitive database detail' },
      },
    })
    renderContent(client)

    expect(
      await screen.findByRole('heading', {
        name: '카테고리를 불러오지 못했습니다',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('sensitive database detail')).not.toBeInTheDocument()
  })

  it('shows an empty state when the user has no posts', async () => {
    const { client } = createMockClient({
      postResult: { data: [], error: null },
    })
    renderContent(client)

    expect(
      await screen.findByRole('heading', {
        name: '등록된 콘텐츠가 없습니다',
      }),
    ).toBeInTheDocument()
  })

  it('renders posts and selects only the list fields', async () => {
    const { client, postBuilder } = createMockClient()
    renderContent(client)

    expect(
      await screen.findByRole('heading', { name: '기준금리 전망 정리' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '반도체 기술 브리핑' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('전체 글 3개')).toBeInTheDocument()
    expect(postBuilder.select).toHaveBeenCalledWith(
      expect.not.stringContaining('html_body'),
    )
    expect(postBuilder.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    })
  })

  it('filters posts by category', async () => {
    const browserUser = userEvent.setup()
    const { client } = createMockClient()
    renderContent(client)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })

    await browserUser.selectOptions(
      screen.getByLabelText('카테고리'),
      'technology',
    )

    expect(
      screen.getByRole('heading', { name: '반도체 기술 브리핑' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '기준금리 전망 정리' }),
    ).not.toBeInTheDocument()
  })

  it('filters posts by status', async () => {
    const browserUser = userEvent.setup()
    const { client } = createMockClient()
    renderContent(client)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })

    await browserUser.selectOptions(screen.getByLabelText('상태'), 'published')

    expect(
      screen.getByRole('heading', { name: '반도체 기술 브리핑' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '기준금리 전망 정리' }),
    ).not.toBeInTheDocument()
  })

  it('searches trimmed title text case-insensitively', async () => {
    const browserUser = userEvent.setup()
    const { client } = createMockClient()
    renderContent(client)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })

    await browserUser.type(screen.getByLabelText('제목·slug 검색'), '  CCTV  ')

    expect(
      screen.getByRole('heading', { name: 'CCTV 뉴스로 배우는 중국어 #12' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '기준금리 전망 정리' }),
    ).not.toBeInTheDocument()
  })

  it('searches by slug', async () => {
    const browserUser = userEvent.setup()
    const { client } = createMockClient()
    renderContent(client)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })

    await browserUser.type(
      screen.getByLabelText('제목·slug 검색'),
      'chip-technology',
    )

    expect(
      screen.getByRole('heading', { name: '반도체 기술 브리핑' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '기준금리 전망 정리' }),
    ).not.toBeInTheDocument()
  })

  it('clears the search and restores the list', async () => {
    const browserUser = userEvent.setup()
    const { client } = createMockClient()
    renderContent(client)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })

    await browserUser.type(screen.getByLabelText('제목·slug 검색'), 'CCTV')
    await browserUser.click(screen.getByRole('button', { name: '검색 초기화' }))

    expect(screen.getByLabelText('제목·slug 검색')).toHaveValue('')
    expect(
      screen.getByRole('heading', { name: '기준금리 전망 정리' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '반도체 기술 브리핑' }),
    ).toBeInTheDocument()
  })

  it('uses the series number and never a briefing ID for Chinese study posts', async () => {
    const { client } = createMockClient()
    renderContent(client)

    const heading = await screen.findByRole('heading', {
      name: 'CCTV 뉴스로 배우는 중국어 #12',
    })
    const card = heading.closest('article')

    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('#12')).toBeInTheDocument()
    expect(
      within(card as HTMLElement).queryByText('SHOULD-NOT-BE-DISPLAYED'),
    ).not.toBeInTheDocument()
  })
})
