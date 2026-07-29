import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/categories/categories.types'
import type { PostImageMetadata } from '../features/posts/posts.repository'
import type { PostDetail } from '../features/posts/posts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { ContentEditPageContent } from './ContentEditPage'

type TestRpcSuccessData = PostDetail | PostImageMetadata

type TestRpcError = {
  code: string
  message: string
}

type TestRpcResult =
  | { data: TestRpcSuccessData; error: null }
  | { data: null; error: TestRpcError }

type TestRpcImplementation = (
  functionName: string,
  payload?: Record<string, unknown>,
) => Promise<TestRpcResult>

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

  const rpc = vi.fn<TestRpcImplementation>(async (functionName, payload) => {
    if (functionName === 'update_post_image_metadata') {
      return {
        data: {
          id: post.id,
          image_prompt: typeof payload?.p_image_prompt === 'string'
            ? payload.p_image_prompt
            : null,
          image_alt: typeof payload?.p_image_alt === 'string'
            ? payload.p_image_alt
            : null,
          image_prompt_version: 2,
          image_prompt_updated_at: '2026-07-28T01:00:00Z',
          updated_at: '2026-07-28T01:00:00Z',
        },
        error: null,
      }
    }
    return {
      data: {
        ...post,
        title: typeof payload?.p_title === 'string'
          ? payload.p_title
          : '수정된 경제 브리핑',
      },
      error: null,
    }
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

  it('saves image metadata separately, keeps unrelated edits, and preserves full save', async () => {
    const browserUser = userEvent.setup()
    const { client, rpc } = createClient()
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
    await browserUser.type(title, '아직 저장하지 않은 제목')
    await browserUser.type(screen.getByLabelText('이미지 프롬프트'), ' 전용 프롬프트 ')
    await browserUser.type(screen.getByLabelText('이미지 ALT 문구'), ' 전용 ALT ')
    await browserUser.click(screen.getByRole('button', { name: '이미지 프롬프트·ALT만 저장' }))

    expect(await screen.findByText('이미지 프롬프트와 ALT를 저장했습니다.')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('update_post_image_metadata', {
      p_post_id: 'post-1',
      p_image_prompt: '전용 프롬프트',
      p_image_alt: '전용 ALT',
    })
    expect(title).toHaveValue('아직 저장하지 않은 제목')
    expect(screen.getByText('다른 변경 사항은 저장되지 않은 상태로 유지됩니다.')).toBeInTheDocument()

    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(await screen.findByText('변경 사항을 저장했습니다.')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith(
      'save_post_publication_bundle',
      expect.objectContaining({ p_title: '아직 저장하지 않은 제목' }),
    )
  })

  it('keeps image values and dirty state when the dedicated RPC fails', async () => {
    const browserUser = userEvent.setup()
    const { client, rpc } = createClient()
    rpc.mockImplementation(async (functionName: string) => functionName === 'update_post_image_metadata'
      ? { data: null, error: { code: '23514', message: 'forced failure' } }
      : { data: post, error: null })
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

    const prompt = await screen.findByLabelText('이미지 프롬프트')
    await browserUser.type(prompt, '실패해도 유지')
    await browserUser.click(screen.getByRole('button', { name: '이미지 프롬프트·ALT만 저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('기존 데이터는 변경되지 않았습니다.')
    expect(prompt).toHaveValue('실패해도 유지')
    expect(screen.getByRole('button', { name: '이미지 프롬프트·ALT만 저장' })).toBeEnabled()
  })
})
