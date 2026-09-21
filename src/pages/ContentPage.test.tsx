import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostListItem } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentPageContent } from './ContentPage'

const categories: Category[] = [
  {
    id: 'economy',
    content_group: 'news',
    name: '경제',
    sort_order: 10,
    display_id_pattern: '#YYYY-MM-DD-ECO',
    slug_pattern: 'economy-briefing-YYYY-MM-DD',
    wrapper_class: 'daily-brief-note news-briefing economy',
  },
  {
    id: 'technology',
    content_group: 'news',
    name: '과학기술',
    sort_order: 20,
    display_id_pattern: '#YYYY-MM-DD-TEC',
    slug_pattern: 'technology-briefing-YYYY-MM-DD',
    wrapper_class: 'daily-brief-note news-briefing technology',
  },
  {
    id: 'chinese-study',
    content_group: 'chinese',
    name: '중국어 학습',
    sort_order: 30,
    display_id_pattern: null,
    slug_pattern: 'cctv-chinese-news-###',
    wrapper_class: 'daily-brief-note chinese-study',
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
    slug: 'cctv-chinese-news-012',
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
  let rows = postResult.data ?? []
  let start = 0
  let end = 19
  const postBuilder = {
    select: vi.fn(() => { rows = postResult.data ?? []; return postBuilder }),
    eq: vi.fn((column: keyof PostListItem, value: string) => {
      rows = rows.filter((post) => post[column] === value)
      return postBuilder
    }),
    or: vi.fn((filter: string) => {
      const quoted = filter.slice('title.imatch.'.length).split(',slug.imatch.')[0]
      const regex = new RegExp(JSON.parse(quoted) as string, 'i')
      rows = rows.filter((post) => regex.test(post.title) || regex.test(post.slug))
      return postBuilder
    }),
    order: vi.fn(() => postBuilder),
    range: vi.fn((from: number, to: number) => { start = from; end = to; return postBuilder }),
    abortSignal: vi.fn(() => postBuilder),
    then: (resolve: (result: MockResult<PostListItem[]> & { count: number }) => unknown) =>
      Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: postResult.error }).then(resolve),
  }
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

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContentPageContent client={client} userId="owner-a" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
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
      { count: 'exact' },
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
      await screen.findByRole('heading', { name: '반도체 기술 브리핑' }),
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
      await screen.findByRole('heading', { name: '반도체 기술 브리핑' }),
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
      await screen.findByRole('heading', { name: 'CCTV 뉴스로 배우는 중국어 #12' }),
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
      await screen.findByRole('heading', { name: '반도체 기술 브리핑' }),
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
      await screen.findByRole('heading', { name: '기준금리 전망 정리' }),
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

  it('pages through results and resets each filter to the first page', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 41 }, (_, i) => ({ ...posts[0], id: `post-${i}`, title: `글 ${i + 1}` }))
    const { client, postBuilder } = createMockClient({ postResult: { data: many, error: null } })
    renderContent(client)
    await screen.findByRole('heading', { name: '글 1' })
    expect(screen.getByLabelText('전체 글 41개')).toBeVisible()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(within(screen.getByRole('list', { name: '콘텐츠 목록' })).getAllByRole('listitem')).toHaveLength(20)
    for (const change of [
      () => user.selectOptions(screen.getByLabelText('카테고리'), 'economy'),
      () => user.selectOptions(screen.getByLabelText('상태'), 'draft'),
      () => user.type(screen.getByLabelText('제목·slug 검색'), '글'),
      () => user.click(screen.getByRole('button', { name: '검색 초기화' })),
    ]) {
      await user.click(screen.getByRole('button', { name: '다음 페이지' }))
      await screen.findByText('2 / 3 페이지')
      expect(postBuilder.range).toHaveBeenLastCalledWith(20, 39)
      await change()
      await screen.findByText('1 / 3 페이지')
      await waitFor(() => expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled())
    }
    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByText('2 / 3 페이지')
    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByText('3 / 3 페이지')
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(within(screen.getByRole('list', { name: '콘텐츠 목록' })).getAllByRole('listitem')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '이전 페이지' }))
    await screen.findByText('2 / 3 페이지')
  })

  it('searches records beyond the old 1,000-row limit and reports filtered totals', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...posts[0], id: `post-${i}`, title: i === 1000 ? '마지막 특수 %_* 글' : `글 ${i}` }))
    const { client } = createMockClient({ postResult: { data: many, error: null } })
    renderContent(client)
    await screen.findByLabelText('전체 글 1001개')
    await userEvent.type(screen.getByLabelText('제목·slug 검색'), '%_*')
    await screen.findByRole('heading', { name: '마지막 특수 %_* 글' })
    expect(screen.getByLabelText('검색 결과 1개')).toBeVisible()
    await userEvent.type(screen.getByLabelText('제목·slug 검색'), '없음')
    await screen.findByRole('heading', { name: '조건에 맞는 콘텐츠가 없습니다' })
    expect(screen.queryByRole('navigation', { name: '콘텐츠 페이지 이동' })).not.toBeInTheDocument()
  })

  it('returns to the first page when deletions remove the current page', async () => {
    const result = { data: Array.from({ length: 21 }, (_, i) => ({ ...posts[0], id: `post-${i}`, title: `글 ${i + 1}` })), error: null }
    const { client } = createMockClient({ postResult: result })
    const { queryClient } = renderContent(client)
    await screen.findByText('1 / 2 페이지')
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByText('2 / 2 페이지')
    result.data = result.data.slice(0, 20)
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['posts', 'list'] }) })
    await screen.findByText('1 / 1 페이지')
    expect(screen.getByLabelText('전체 글 20개')).toBeVisible()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
  })

  it('shows a list error without claiming a zero total', async () => {
    const { client } = createMockClient({ postResult: { data: null, error: { message: 'private detail' } } })
    renderContent(client)
    await screen.findByRole('heading', { name: '콘텐츠 목록을 불러오지 못했습니다' })
    expect(screen.queryByLabelText('전체 글 0개')).not.toBeInTheDocument()
    expect(screen.queryByText('private detail')).not.toBeInTheDocument()
  })
})

function ListNavigationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <>
    <div data-testid="list-state">{JSON.stringify(location.state)}</div>
    <button onClick={() => void navigate('/content?visit=unrelated')}>다른 목록 방문</button>
    <button onClick={() => void navigate(-1)}>이전 방문</button>
  </>
}

function renderDeleteFeedback(state: unknown = null) {
  const { client } = createMockClient()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[{ pathname: '/content', state }]}>
      <ListNavigationProbe />
      <ContentPageContent client={client} userId="owner-a" />
    </MemoryRouter>
  </QueryClientProvider>)
}

describe('content delete list feedback', () => {
  it('shows success and consumes only the narrow delete signal', async () => {
    renderDeleteFeedback({ contentDeleted: true, unrelated: 'preserved' })
    expect(await screen.findByText('콘텐츠를 삭제했습니다.')).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('list-state')).toHaveTextContent('{"unrelated":"preserved"}')
    expect(screen.getByTestId('list-state')).not.toHaveTextContent('contentDeleted')
  })

  it.each([null, {}, { contentDeleted: false }, { contentDeleted: 'true' }])('does not show false success %#', async (state) => {
    renderDeleteFeedback(state)
    await screen.findByRole('heading', { name: '기준금리 전망 정리' })
    expect(screen.queryByText('콘텐츠를 삭제했습니다.')).not.toBeInTheDocument()
  })

  it('does not replay consumed feedback on an unrelated visit or back navigation', async () => {
    renderDeleteFeedback({ contentDeleted: true })
    expect(await screen.findByText('콘텐츠를 삭제했습니다.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '다른 목록 방문' }))
    expect(screen.queryByText('콘텐츠를 삭제했습니다.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '이전 방문' }))
    expect(screen.queryByText('콘텐츠를 삭제했습니다.')).not.toBeInTheDocument()
  })
})
