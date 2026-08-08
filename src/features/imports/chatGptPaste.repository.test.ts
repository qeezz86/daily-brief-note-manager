import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { ChatGptPastePersistencePayload } from './chatGptPaste.types'
import { mapChatGptPasteRepositoryError, saveChatGptPastePost } from './chatGptPaste.repository'

const payload: ChatGptPastePersistencePayload = {
  content: {
    content_group: 'news', category_id: 'economy', display_id: '#2026-08-01-ECO', series_no: null,
    title: '경제', summary: '요약', slug: 'economy-briefing-2026-08-01', published_on: '2026-08-01',
    published_at: null, wordpress_url: null,
  },
  seo: {
    representative_title: '대표', alternative_titles: ['1', '2', '3', '4'], meta_description: '가'.repeat(120),
    focus_keyword: '경제', tags: ['금리', '환율', '물가', '산업', '정책'],
  },
  image: { prompt: 'prompt', alt: 'alt' },
  sources: [{ source_name: '기관', source_title: '원문', source_url: 'https://example.com/a', source_published_at: null, checked_point: '확인' }],
  html_body: '<div class="daily-brief-note news-briefing economy"><h1>경제</h1></div>',
}

const saved = {
  postId: '11111111-1111-4111-8111-111111111111', title: '경제', categoryId: 'economy', status: 'draft',
  slug: 'economy-briefing-2026-08-01', displayId: '#2026-08-01-ECO', publishedOn: '2026-08-01', wordpressUrl: null,
}

describe('saveChatGptPastePost', () => {
  it('calls the exact RPC once with exactly p_item and maps the 8-field result', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    const client = { rpc } as unknown as DatabaseClient
    await expect(saveChatGptPastePost(client, payload)).resolves.toEqual(saved)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('save_chatgpt_paste_post', { p_item: payload })
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_item'])
  })

  it('sends only the validated payload allowlist without raw, owner, auth, session, provenance, tracking, or unknown fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    await saveChatGptPastePost({ rpc } as unknown as DatabaseClient, payload)
    const serialized = JSON.stringify(rpc.mock.calls[0][1])
    expect(Object.keys(rpc.mock.calls[0][1].p_item).sort()).toEqual(['content', 'html_body', 'image', 'seo', 'sources'])
    ;['rawPaste', 'ownerId', 'owner_id', 'auth', 'session', 'sourceImportType', 'source_import_type', 'provenance', 'NEWS_TRACKING', 'unknown'].forEach((field) => expect(serialized).not.toContain(field))
  })

  it('does not issue a broad post-success query', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    const from = vi.fn()
    await saveChatGptPastePost({ rpc, from } as unknown as DatabaseClient, payload)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: '42501', message: 'CHATGPT_PASTE_AUTH_REQUIRED details' }, 'unauthenticated'],
    [{ code: '42501', message: 'CHATGPT_PASTE_FORBIDDEN_REFERENCE private-id' }, 'forbidden-cross-owner-reference'],
    [{ code: '22023', message: 'CHATGPT_PASTE_MISSING_REQUIRED_FIELD title' }, 'missing-required-field'],
    [{ code: '22023', message: 'CHATGPT_PASTE_INVALID_INPUT raw-value' }, 'invalid-input'],
    [{ code: '23514', message: 'CHATGPT_PASTE_UNSUPPORTED_CATEGORY private-category' }, 'unsupported-category-or-enum'],
    [{ code: '23505', message: 'IMPORT_DUPLICATE_SLUG private_constraint' }, 'duplicate-or-uniqueness-conflict'],
    [{ code: '23503', message: 'private_fk' }, 'foreign-key-violation'],
    [{ code: 'XX000', message: 'private backend stack and pasted title' }, 'aggregate-persistence-failure'],
  ])('redacts repository error %j as %s', (databaseError, category) => {
    const error = mapChatGptPasteRepositoryError(databaseError)
    expect(error.category).toBe(category)
    expect(error.message).not.toContain(databaseError.message)
    expect(error.message).not.toContain('private')
  })

  it('does not automatically retry an RPC failure', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'secret' } })
    await expect(saveChatGptPastePost({ rpc } as unknown as DatabaseClient, payload)).rejects.toMatchObject({ category: 'aggregate-persistence-failure' })
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('redacts an unexpected success shape without another request', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...saved, ownerId: 'secret' }, error: null })
    await expect(saveChatGptPastePost({ rpc } as unknown as DatabaseClient, payload)).rejects.toMatchObject({ category: 'aggregate-persistence-failure' })
    expect(rpc).toHaveBeenCalledOnce()
  })
})
