import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { validNewsPost } from './imports.fixtures'
import { saveWordPressManualPost, WordPressManualRepositoryError } from './wordPressManual.repository'

const saved = {
  postId: '11111111-1111-4111-8111-111111111111', title: '경제 핵심 뉴스', categoryId: 'economy', status: 'published',
  slug: 'economy-briefing-2026-07-12', displayId: '#2026-07-12-ECO', publishedOn: '2026-07-12', wordpressUrl: 'https://example.org/economy-2026-07-12',
}

describe('saveWordPressManualPost', () => {
  it('calls the exact RPC once with exactly p_item and maps the normalized result', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    await expect(saveWordPressManualPost({ rpc } as unknown as DatabaseClient, validNewsPost())).resolves.toEqual(saved)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0][0]).toBe('save_wordpress_manual_post')
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_item'])
    expect(rpc.mock.calls[0][1].p_item).toMatchObject({
      validation_mode: 'legacy', category_id: 'economy', title: '경제 핵심 뉴스',
      html_body: expect.stringContaining('daily-brief-note'),
      sources: [expect.objectContaining({ source_name: 'Example', sort_order: 0 })],
    })
  })

  it('allowlists normalized persistence fields and excludes provenance, identity, session, parser, and tracking data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: saved, error: null })
    const post = Object.assign(validNewsPost(), {
      sourceImportType: 'caller-controlled', source_import_type: 'caller-controlled', ownerId: 'owner', owner_id: 'owner',
      auth: 'auth', session: 'session', token: 'token', parserDiagnostics: { secret: true },
    })
    await saveWordPressManualPost({ rpc } as unknown as DatabaseClient, post)
    const payload = rpc.mock.calls[0][1].p_item as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'briefing_date', 'category_id', 'display_id', 'html_body', 'image', 'metadata', 'published_at', 'published_on',
      'seo', 'series_no', 'slug', 'sources', 'status', 'summary', 'tags', 'title', 'validation_mode', 'wordpress_url',
    ])
    const serialized = JSON.stringify(payload)
    ;['sourceImportType', 'source_import_type', 'ownerId', 'owner_id', 'auth', 'session', 'token', 'parserDiagnostics', 'newsTracking', 'topics', 'updates', 'followups'].forEach((key) => expect(serialized).not.toContain(key))
  })

  it.each([
    [{ code: '42501', message: 'private owner id' }, '로그인 세션과 콘텐츠 소유 권한을 확인해 주세요.'],
    [{ code: '23505', message: 'private slug' }, '같은 식별자를 사용하는 콘텐츠가 이미 있습니다. 중복 검사를 다시 실행해 주세요.'],
    [{ code: '22023', message: 'private raw html' }, '저장 입력이 유효하지 않습니다. 미리보기와 검증 결과를 다시 확인해 주세요.'],
    [{ code: 'XX000', message: 'private stack' }, '콘텐츠를 저장하지 못했습니다. 미리보기를 유지한 채 수동으로 다시 시도해 주세요.'],
  ])('sanitizes database failures without leaking backend details', async (error, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error })
    await expect(saveWordPressManualPost({ rpc } as unknown as DatabaseClient, validNewsPost())).rejects.toEqual(new WordPressManualRepositoryError(message))
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('does not retry an RPC failure or issue a client-side provenance update', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'XX000', message: 'private' } })
    const from = vi.fn()
    await expect(saveWordPressManualPost({ rpc, from } as unknown as DatabaseClient, validNewsPost())).rejects.toBeInstanceOf(WordPressManualRepositoryError)
    expect(rpc).toHaveBeenCalledOnce()
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects an unexpected success shape without retrying', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...saved, ownerId: 'secret' }, error: null })
    await expect(saveWordPressManualPost({ rpc } as unknown as DatabaseClient, validNewsPost())).rejects.toBeInstanceOf(WordPressManualRepositoryError)
    expect(rpc).toHaveBeenCalledOnce()
  })
})
