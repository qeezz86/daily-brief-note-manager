import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../categories/categories.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  archivePost,
  createPost,
  getPostById,
  updatePost,
} from './posts.repository'
import type { PostDetail } from './posts.types'

const aiCategory: Category = {
  id: 'ai-column',
  content_group: 'ai',
  name: 'AI 칼럼',
  sort_order: 60,
  display_id_pattern: 'AI-###',
  slug_pattern: 'ai-###',
  wrapper_class: 'daily-brief-note ai-column',
}

const newsCategory: Category = {
  id: 'economy',
  content_group: 'news',
  name: '경제',
  sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO',
  slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy',
}

const chineseCategory: Category = {
  id: 'chinese-study',
  content_group: 'chinese',
  name: '중국어 학습',
  sort_order: 80,
  display_id_pattern: null,
  slug_pattern: 'cctv-chinese-news-study-###',
  wrapper_class: 'daily-brief-note chinese-study',
}

const savedPost: PostDetail = {
  id: 'post-1',
  category_id: 'ai-column',
  display_id: 'AI-007',
  series_no: 7,
  briefing_date: null,
  published_on: null,
  title: 'AI 에이전트',
  summary: '요약',
  slug: 'ai-agent',
  content_status: 'draft',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T01:00:00Z',
}

function createInsertClient(
  result: { data: PostDetail | null; error: Record<string, string> | null },
  rpcResult: { data: number | null; error: Record<string, string> | null } = {
    data: 7,
    error: null,
  },
) {
  const builder = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  }
  builder.insert.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.single.mockResolvedValue(result)
  const rpc = vi.fn().mockResolvedValue(rpcResult)

  return {
    builder,
    rpc,
    client: { from: vi.fn(() => builder), rpc } as unknown as DatabaseClient,
  }
}

function baseCreateInput(category: Category) {
  return {
    ownerId: 'owner-a',
    category,
    title: 'AI 에이전트',
    summary: '요약',
    slug: 'ai-agent',
    contentStatus: 'draft' as const,
    briefingDate: null,
    publishedOn: null,
    wordpressUrl: null,
  }
}

describe('posts repository mutations', () => {
  it('issues a series number before inserting a non-news post', async () => {
    const { builder, client, rpc } = createInsertClient({ data: savedPost, error: null })

    await createPost(client, baseCreateInput(aiCategory))

    expect(rpc).toHaveBeenCalledWith('issue_series_no', {
      p_owner_id: 'owner-a',
      p_category_id: 'ai-column',
    })
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ series_no: 7, display_id: 'AI-007' }),
    )
  })

  it('does not insert when series number issuance fails', async () => {
    const { builder, client } = createInsertClient(
      { data: null, error: null },
      { data: null, error: { message: 'rpc failed' } },
    )

    await expect(createPost(client, baseCreateInput(aiCategory))).rejects.toThrow(
      '시리즈 번호를 발급하지 못했습니다',
    )
    expect(builder.insert).not.toHaveBeenCalled()
  })

  it('never calls the series RPC for news posts', async () => {
    const newsPost = {
      ...savedPost,
      category_id: 'economy',
      display_id: '#2026-07-10-ECO',
      series_no: null,
      briefing_date: '2026-07-10',
    }
    const { builder, client, rpc } = createInsertClient({ data: newsPost, error: null })

    await createPost(client, {
      ...baseCreateInput(newsCategory),
      briefingDate: '2026-07-10',
    })

    expect(rpc).not.toHaveBeenCalled()
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        series_no: null,
        display_id: '#2026-07-10-ECO',
        briefing_date: '2026-07-10',
      }),
    )
  })

  it('never generates a display ID for Chinese study posts', async () => {
    const chinesePost = {
      ...savedPost,
      category_id: 'chinese-study',
      display_id: null,
      series_no: 7,
    }
    const { builder, client } = createInsertClient({ data: chinesePost, error: null })

    await createPost(client, baseCreateInput(chineseCategory))

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ display_id: null, series_no: 7 }),
    )
  })

  it('uses a transparent HTML placeholder and manual entry source', async () => {
    const { builder, client } = createInsertClient({ data: savedPost, error: null })

    await createPost(client, baseCreateInput(aiCategory))

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        html_body: expect.stringContaining('has not been authored yet'),
        source_import_type: 'manual_entry',
      }),
    )
  })

  it('maps unique slug violations to a safe Korean message', async () => {
    const { client } = createInsertClient({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key posts_owner_slug_key',
      },
    })

    await expect(createPost(client, baseCreateInput(aiCategory))).rejects.toThrow(
      '동일한 slug가 이미 존재합니다.',
    )
  })

  it('returns null for inaccessible posts', async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.maybeSingle.mockResolvedValue({ data: null, error: null })
    const client = { from: vi.fn(() => builder) } as unknown as DatabaseClient

    await expect(getPostById(client, 'missing')).resolves.toBeNull()
  })

  it('updates only editable basic fields', async () => {
    const builder = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    }
    builder.update.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.select.mockReturnValue(builder)
    builder.maybeSingle.mockResolvedValue({ data: savedPost, error: null })
    const client = { from: vi.fn(() => builder) } as unknown as DatabaseClient

    await updatePost(client, 'post-1', {
      title: '수정 제목',
      summary: '수정 요약',
      slug: 'updated-slug',
      contentStatus: 'ready',
      publishedOn: null,
      wordpressUrl: null,
    })

    const payload = builder.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('category_id')
    expect(payload).not.toHaveProperty('briefing_date')
    expect(payload).not.toHaveProperty('series_no')
    expect(payload).not.toHaveProperty('display_id')
  })

  it('archives by updating content status without deleting', async () => {
    const archived = { ...savedPost, content_status: 'archived' }
    const builder = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    }
    builder.update.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.select.mockReturnValue(builder)
    builder.maybeSingle.mockResolvedValue({ data: archived, error: null })
    const from = vi.fn(() => builder)
    const client = { from } as unknown as DatabaseClient

    await archivePost(client, 'post-1')

    expect(builder.update).toHaveBeenCalledWith({ content_status: 'archived' })
    expect(from).toHaveBeenCalledWith('posts')
  })
})
