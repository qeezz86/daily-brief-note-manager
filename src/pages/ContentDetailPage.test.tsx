import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostDetail } from '../features/posts/posts.types'
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
  slug: 'cctv-chinese-news-study-012',
  content_status: 'ready',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T02:00:00Z',
}

function createClient(postResult: PostDetail | null) {
  const categoryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  categoryBuilder.select.mockReturnValue(categoryBuilder)
  categoryBuilder.eq.mockReturnValue(categoryBuilder)
  categoryBuilder.order.mockResolvedValue({ data: [category], error: null })

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

  return {
    client: {
      from: vi.fn((table: string) =>
        table === 'categories' ? categoryBuilder : postBuilder,
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
})
