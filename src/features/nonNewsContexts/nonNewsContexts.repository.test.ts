import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { listNonNewsContextItems } from './nonNewsContexts.repository'
import type { SupportedNonNewsCategoryId } from './nonNewsContexts.types'

function row(categoryId: SupportedNonNewsCategoryId) {
  return {
    id: 'internal-post-id',
    updated_at: '2026-08-11T02:00:00Z',
    display_id: categoryId === 'chinese-study' ? null : 'DISPLAY-001',
    series_no: 1,
    title: '기존 글',
    slug: 'existing-post',
    summary: '기존 글 요약',
    published_on: '2026-08-10',
    categories: { id: categoryId, name: '카테고리' },
    seo_data: [{ focus_keyword: '포커스' }],
    post_tags: [{ tags: { name: '태그' } }],
    ai_metadata: [{ field_name: '생성형 AI' }],
    info_db_metadata: [{ field_name: '경제 용어' }],
    chinese_metadata: [{
      program_name: '新闻联播',
      original_title: '原文标题',
      original_url: 'https://news.cctv.com/item',
      learning_topic: '경제 중국어',
      learning_points: '핵심 표현',
    }],
  }
}

function createClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockResolvedValue(result)
  const client = { from: vi.fn(() => builder) } as unknown as DatabaseClient
  return { builder, client }
}

describe('listNonNewsContextItems', () => {
  it('uses an explicit allowlisted AI projection without owner or raw body fields', async () => {
    const { builder, client } = createClient({ data: [row('ai-column')], error: null })
    await listNonNewsContextItems(client, 'ai-column')
    const projection = builder.select.mock.calls[0][0] as string
    expect(projection).toContain('categories!inner(id, name)')
    expect(projection).toContain('seo_data(focus_keyword)')
    expect(projection).toContain('post_tags(tags(name))')
    expect(projection).toContain('ai_metadata(field_name)')
    expect(projection).not.toContain('*')
    expect(projection).not.toMatch(/owner_id|html_body|wordpress_url|image_prompt/)
  })

  it('filters the canonical category and ready/published statuses without an owner override', async () => {
    const { builder, client } = createClient({ data: [], error: null })
    await listNonNewsContextItems(client, 'info-db')
    expect(builder.eq.mock.calls).toEqual([['categories.id', 'info-db']])
    expect(builder.in).toHaveBeenCalledWith('content_status', ['ready', 'published'])
    expect(builder.eq).not.toHaveBeenCalledWith('owner_id', expect.anything())
  })

  it('applies the exact deterministic three-level ordering', async () => {
    const { builder, client } = createClient({ data: [], error: null })
    await listNonNewsContextItems(client, 'ai-column')
    expect(builder.order.mock.calls).toEqual([
      ['published_on', { ascending: false, nullsFirst: false }],
      ['updated_at', { ascending: false }],
      ['id', { ascending: true }],
    ])
  })

  it.each([
    ['ai-column', 20],
    ['info-db', 30],
    ['chinese-study', 20],
  ] as const)('applies the %s database-side limit', async (categoryId, limit) => {
    const { builder, client } = createClient({ data: [], error: null })
    await listNonNewsContextItems(client, categoryId)
    expect(builder.limit).toHaveBeenCalledWith(limit)
  })

  it('maps allowlisted relations and strips ordering-only internal fields', async () => {
    const { client } = createClient({ data: [row('ai-column')], error: null })
    const result = await listNonNewsContextItems(client, 'ai-column')
    expect(result).toEqual([{
      displayId: 'DISPLAY-001',
      seriesNo: 1,
      title: '기존 글',
      slug: 'existing-post',
      summary: '기존 글 요약',
      publishedOn: '2026-08-10',
      focusKeyword: '포커스',
      tags: ['태그'],
      fieldName: '생성형 AI',
      chineseMetadata: null,
    }])
    expect(result[0]).not.toHaveProperty('id')
    expect(result[0]).not.toHaveProperty('updated_at')
  })

  it('uses only the selected category metadata projection', async () => {
    const info = createClient({ data: [], error: null })
    await listNonNewsContextItems(info.client, 'info-db')
    const infoProjection = info.builder.select.mock.calls[0][0] as string
    expect(infoProjection).toContain('info_db_metadata(field_name)')
    expect(infoProjection).toContain('display_id')
    expect(infoProjection).not.toContain('series_no')
    expect(infoProjection).not.toMatch(/post_tags|ai_metadata|chinese_metadata/)

    const chinese = createClient({ data: [], error: null })
    await listNonNewsContextItems(chinese.client, 'chinese-study')
    const chineseProjection = chinese.builder.select.mock.calls[0][0] as string
    expect(chineseProjection).toContain('chinese_metadata(program_name, original_title, original_url, learning_topic, learning_points)')
    expect(chineseProjection).toContain('series_no')
    expect(chineseProjection).not.toContain('display_id')
    expect(chineseProjection).not.toMatch(/seo_data|post_tags|ai_metadata|info_db_metadata/)
  })

  it('preserves fewer-than-limit results without padding', async () => {
    const { client } = createClient({ data: [row('info-db')], error: null })
    await expect(listNonNewsContextItems(client, 'info-db')).resolves.toHaveLength(1)
  })

  it('propagates a safe repository error without database details', async () => {
    const { client } = createClient({ data: null, error: { message: 'private SQL detail' } })
    await expect(listNonNewsContextItems(client, 'ai-column'))
      .rejects.toThrow('비뉴스 중복 방지 컨텍스트를 불러오지 못했습니다.')
  })
})
