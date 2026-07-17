import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../categories/categories.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  archivePost,
  createPost,
  getPostById,
  getSeoDataByPostId,
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
  slug_pattern: 'cctv-chinese-news-###',
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
  html_body: null,
  image_prompt: null,
  image_alt: null,
  image_prompt_version: 1,
  image_prompt_updated_at: null,
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
      expect.objectContaining({ series_no: 7, display_id: 'AI-007', slug: 'ai-007' }),
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

  it('stores a null HTML body without an interim placeholder', async () => {
    const { builder, client } = createInsertClient({ data: savedPost, error: null })

    await createPost(client, baseCreateInput(aiCategory))

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        html_body: null,
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

  it('maps post, SEO, and image fields to the atomic editor RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedPost, error: null })
    const client = { rpc } as unknown as DatabaseClient

    await updatePost(client, 'post-1', {
      title: '수정 제목',
      summary: '수정 요약',
      slug: 'updated-slug',
      contentStatus: 'ready',
      publishedOn: null,
      wordpressUrl: null,
      htmlBody: '<div>HTML</div>',
      representativeTitle: '대표 제목',
      alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'],
      metaDescription: '메타 설명',
      focusKeyword: '포커스 키워드',
      imagePrompt: '이미지 프롬프트',
      imageAlt: 'ALT 문구',
      tags: ['AI', '에이전트', '자동화', '업무 혁신', '생성형 AI'],
      sources: [{
        sourceName: 'OpenAI', sourceTitle: 'Agents guide',
        sourceUrl: 'https://example.com/agents', sourcePublishedAt: '',
        checkedPoint: '에이전트 정의',
      }],
    })

    expect(rpc).toHaveBeenCalledWith('save_post_publication_bundle', expect.any(Object))
    const payload = rpc.mock.calls[0][1]
    expect(payload).not.toHaveProperty('category_id')
    expect(payload).not.toHaveProperty('briefing_date')
    expect(payload).not.toHaveProperty('series_no')
    expect(payload).not.toHaveProperty('display_id')
    expect(payload).toEqual(expect.objectContaining({
      p_html_body: '<div>HTML</div>',
      p_alternative_titles: ['대안 1', '대안 2', '대안 3', '대안 4'],
      p_image_prompt: '이미지 프롬프트',
      p_tags: ['AI', '에이전트', '자동화', '업무 혁신', '생성형 AI'],
      p_sources: [expect.objectContaining({ source_name: 'OpenAI', sort_order: 0 })],
    }))
  })

  it('maps Chinese metadata to the Chinese atomic publication RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedPost, error: null })
    const client = { rpc } as unknown as DatabaseClient

    await updatePost(client, 'post-1', {
      contentGroup: 'chinese', title: '제목', summary: '요약', slug: 'chinese-slug', contentStatus: 'draft',
      publishedOn: null, wordpressUrl: null, htmlBody: null, representativeTitle: '', alternativeTitles: [],
      metaDescription: '', focusKeyword: '', imagePrompt: null, imageAlt: null, tags: [], sources: [],
      chineseMetadata: {
        learningTopic: '학습 주제', programName: 'CCTV 뉴스', originalTitle: '원문 제목', originalUrl: 'https://news.cctv.com/a/1',
        originalPublishedAt: '2026-07-11T12:00', episodeListIncluded: false, verifiedCoreFact: '확인한 사실', difficulty: null, learningPoints: null,
      },
    })

    expect(rpc).toHaveBeenCalledWith('save_chinese_publication_bundle', expect.objectContaining({
      p_chinese_metadata: expect.objectContaining({ original_url: 'https://news.cctv.com/a/1', episode_list_included: false }),
    }))
  })

  it('maps AI and information-DB metadata to their atomic RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedPost, error: null })
    const client = { rpc } as unknown as DatabaseClient
    const base = {
      title: '제목', summary: '요약', slug: 'slug', contentStatus: 'draft' as const, publishedOn: null,
      wordpressUrl: null, htmlBody: null, representativeTitle: '', alternativeTitles: [], metaDescription: '', focusKeyword: '', imagePrompt: null, imageAlt: null, tags: [], sources: [],
    }
    await updatePost(client, 'post-1', { ...base, contentGroup: 'ai', aiMetadata: { fieldName: '생성형 AI', difficulty: 'beginner', estimatedReadMin: 4 } })
    expect(rpc).toHaveBeenLastCalledWith('save_ai_publication_bundle', expect.objectContaining({ p_ai_metadata: { field_name: '생성형 AI', difficulty: 'beginner', estimated_read_min: 4 } }))
    await updatePost(client, 'post-1', { ...base, contentGroup: 'info_db', infoDbMetadata: { fieldName: '반도체', difficulty: 'advanced', estimatedReadMin: 9, referenceDate: null } })
    expect(rpc).toHaveBeenLastCalledWith('save_info_db_publication_bundle', expect.objectContaining({ p_info_db_metadata: { field_name: '반도체', difficulty: 'advanced', estimated_read_min: 9, reference_date: null } }))
  })

  it('loads only explicit SEO fields', async () => {
    const seoData = {
      post_id: 'post-1',
      representative_title: '대표 제목',
      alternative_titles: ['대안 1', '대안 2', '대안 3', '대안 4'],
      meta_description: '메타 설명',
      focus_keyword: '키워드',
    }
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.maybeSingle.mockResolvedValue({ data: seoData, error: null })
    const client = { from: vi.fn(() => builder) } as unknown as DatabaseClient

    await expect(getSeoDataByPostId(client, 'post-1')).resolves.toEqual(seoData)
    expect(builder.select).toHaveBeenCalledWith(
      'post_id, representative_title, alternative_titles, meta_description, focus_keyword',
    )
  })

  it('reports atomic editor failures without exposing database details', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23514', message: 'sensitive failure detail' },
      }),
    } as unknown as DatabaseClient

    await expect(updatePost(client, 'post-1', {
      title: '제목', summary: '요약', slug: 'slug', contentStatus: 'draft',
      publishedOn: null, wordpressUrl: null, htmlBody: null,
      representativeTitle: '', alternativeTitles: [], metaDescription: '',
      focusKeyword: '', imagePrompt: null, imageAlt: null,
      tags: [], sources: [],
    })).rejects.toThrow('기존 데이터는 변경되지 않았습니다.')
  })

  it('explains how to remove a source linked to a news update', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23514', message: 'NEWS_UPDATE_LINKED_SOURCE_REMOVED' },
      }),
    } as unknown as DatabaseClient

    await expect(updatePost(client, 'post-1', {
      title: '제목', summary: '요약', slug: 'slug', contentStatus: 'draft',
      publishedOn: null, wordpressUrl: null, htmlBody: null,
      representativeTitle: '', alternativeTitles: [], metaDescription: '',
      focusKeyword: '', imagePrompt: null, imageAlt: null,
      tags: [], sources: [],
    })).rejects.toThrow('먼저 뉴스 항목에서 연결을 변경해야 삭제할 수 있습니다.')
  })

  it('maps duplicate Chinese original URLs to a clear editor message', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'CHINESE_METADATA_ORIGINAL_URL_DUPLICATE' } }),
    } as unknown as DatabaseClient

    await expect(updatePost(client, 'post-1', {
      contentGroup: 'chinese', title: '제목', summary: '요약', slug: 'slug', contentStatus: 'draft', publishedOn: null,
      wordpressUrl: null, htmlBody: null, representativeTitle: '', alternativeTitles: [], metaDescription: '', focusKeyword: '',
      imagePrompt: null, imageAlt: null, tags: [], sources: [], chineseMetadata: null,
    })).rejects.toThrow('동일한 중국어 원문 URL이 이미 존재합니다.')
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
