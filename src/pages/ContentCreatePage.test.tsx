import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostDetail } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentCreatePageContent } from './ContentCreatePage'

const category: Category = {
  id: 'ai-column',
  content_group: 'ai',
  name: 'AI 칼럼',
  sort_order: 60,
  display_id_pattern: 'AI-###',
  slug_pattern: 'ai-###',
  wrapper_class: 'daily-brief-note ai-column',
}

const savedPost: PostDetail = {
  id: 'post-created',
  category_id: 'ai-column',
  display_id: 'AI-001',
  series_no: 1,
  briefing_date: null,
  published_on: null,
  title: 'AI 칼럼',
  summary: 'AI 칼럼 요약',
  html_body: null,
  slug: 'ai-column',
  content_status: 'draft',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T01:00:00Z',
}

function createClient(insertError: Record<string, string> | null = null) {
  const categoryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  categoryBuilder.select.mockReturnValue(categoryBuilder)
  categoryBuilder.eq.mockReturnValue(categoryBuilder)
  categoryBuilder.order.mockResolvedValue({ data: [category], error: null })

  const postBuilder = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  }
  postBuilder.insert.mockReturnValue(postBuilder)
  postBuilder.select.mockReturnValue(postBuilder)
  postBuilder.single.mockResolvedValue({
    data: insertError ? null : savedPost,
    error: insertError,
  })

  return {
    client: {
      from: vi.fn((table: string) =>
        table === 'categories' ? categoryBuilder : postBuilder,
      ),
      rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
    } as unknown as DatabaseClient,
    postBuilder,
  }
}

function renderCreate(client: DatabaseClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/content/new']}>
        <Routes>
          <Route
            path="/content/new"
            element={<ContentCreatePageContent client={client} userId="owner-a" />}
          />
          <Route path="/content/:postId" element={<p>생성된 콘텐츠 상세</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillValidForm() {
  const browserUser = userEvent.setup()
  await browserUser.selectOptions(
    await screen.findByLabelText('카테고리'),
    'ai-column',
  )
  await browserUser.type(screen.getByLabelText('제목'), 'AI 칼럼')
  await browserUser.type(screen.getByLabelText('요약'), 'AI 칼럼 요약')
  await browserUser.type(screen.getByLabelText('Slug'), 'ai-column')
  return browserUser
}

describe('ContentCreatePage', () => {
  it('renders the protected create page content', async () => {
    const { client } = createClient()
    renderCreate(client)

    expect(
      await screen.findByRole('heading', { name: '콘텐츠 신규 생성' }),
    ).toBeInTheDocument()
  })

  it('navigates to the created post detail after a successful save', async () => {
    const { client, postBuilder } = createClient()
    renderCreate(client)
    const browserUser = await fillValidForm()

    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))

    expect(await screen.findByText('생성된 콘텐츠 상세')).toBeInTheDocument()
    expect(postBuilder.insert).toHaveBeenCalledOnce()
  })

  it('shows a friendly unique slug error without database details', async () => {
    const { client } = createClient({
      code: '23505',
      message: 'duplicate key posts_owner_slug_key sensitive detail',
    })
    renderCreate(client)
    const browserUser = await fillValidForm()

    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('동일한 slug가 이미 존재합니다.')
    expect(screen.queryByText(/sensitive detail/)).not.toBeInTheDocument()
  })
})
