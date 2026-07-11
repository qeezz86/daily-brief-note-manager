import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostDetail } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentEditPageContent } from './ContentEditPage'

const category: Category = {
  id: 'economy',
  content_group: 'news',
  name: '경제',
  sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO',
  slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy',
}

const post: PostDetail = {
  id: 'post-1',
  category_id: 'economy',
  display_id: '#2026-07-10-ECO',
  series_no: null,
  briefing_date: '2026-07-10',
  published_on: null,
  title: '경제 브리핑',
  summary: '경제 브리핑 요약',
  html_body: null,
  image_prompt: null,
  image_alt: null,
  image_prompt_version: 1,
  image_prompt_updated_at: null,
  slug: 'economy-briefing-2026-07-10',
  content_status: 'draft',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T01:00:00Z',
}

function createClient() {
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
  postBuilder.maybeSingle
    .mockResolvedValue({ data: post, error: null })

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
  tagBuilder.eq.mockResolvedValue({ data: [], error: null })
  const sourceBuilder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  sourceBuilder.select.mockReturnValue(sourceBuilder)
  sourceBuilder.eq.mockReturnValue(sourceBuilder)
  sourceBuilder.order.mockResolvedValue({ data: [], error: null })

  const rpc = vi.fn().mockResolvedValue({
    data: { ...post, title: '수정된 경제 브리핑' },
    error: null,
  })

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
                : postBuilder,
      ),
      rpc,
    } as unknown as DatabaseClient,
    postBuilder,
    rpc,
    seoBuilder,
  }
}

describe('ContentEditPage', () => {
  it('saves editable fields and keeps identity fields out of the update', async () => {
    const browserUser = userEvent.setup()
    const { client, rpc, seoBuilder } = createClient()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ContentEditPageContent client={client} userId="owner-a" postId="post-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const title = await screen.findByLabelText('제목')
    await browserUser.clear(title)
    await browserUser.type(title, '수정된 경제 브리핑')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))

    expect(await screen.findByText('변경 사항을 저장했습니다.')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'save_post_publication_bundle',
      expect.not.objectContaining({ category_id: expect.anything() }),
    )
    expect(screen.getByLabelText('카테고리')).toBeDisabled()
    expect(screen.getByLabelText('브리핑 날짜')).toBeDisabled()
    await waitFor(() => expect(seoBuilder.maybeSingle).toHaveBeenCalledTimes(2))
  })
})
