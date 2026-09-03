import { describe, expect, it, vi } from 'vitest'
import { checkWordPressPostStatus, WordPressPostStatusServiceError } from './wordpressPostStatus.service'

const input = { contentId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222' }
const success = { schemaVersion: 1, ok: true, checkedAt: '2026-08-24T00:00:00.000Z', source: input, stored: { wordpressPostId: 1, status: 'draft', slug: 'a', link: 'https://example.com/a' }, wordpress: null, reconciliation: { primary: 'REMOTE_NOT_FOUND', deltas: [] } }
const clientFor = (data: unknown) => ({ functions: { invoke: vi.fn(async () => ({ data, error: null })) } } as never)

describe('post status service', () => {
  it('invokes only the bounded post-status function', async () => { const invoke = vi.fn(async () => ({ data: success, error: null })); await expect(checkWordPressPostStatus({ functions: { invoke } } as never, input)).resolves.toEqual(success); expect(invoke).toHaveBeenCalledWith('wordpress-post-status', expect.objectContaining({ body: { action: 'check-post-status', ...input } })) })
  it('rejects non-object and missing required results safely', async () => { await expect(checkWordPressPostStatus(clientFor([]), input)).rejects.toBeInstanceOf(WordPressPostStatusServiceError); await expect(checkWordPressPostStatus(clientFor({ ...success, stored: undefined }), input)).rejects.toBeInstanceOf(WordPressPostStatusServiceError) })
  it('rejects incorrect primitive and unknown status values safely', async () => { await expect(checkWordPressPostStatus(clientFor({ ...success, stored: { ...success.stored, wordpressPostId: '1' } }), input)).rejects.toBeInstanceOf(WordPressPostStatusServiceError); await expect(checkWordPressPostStatus(clientFor({ ...success, stored: { ...success.stored, status: 'deleted' } }), input)).rejects.toBeInstanceOf(WordPressPostStatusServiceError) })
  it('maps a validated function error without loosening malformed failure handling', async () => { const body = JSON.stringify({ schemaVersion: 1, ok: false, error: { code: 'REMOTE_NOT_FOUND', message: '찾을 수 없습니다.', retryable: false } }); const error = { context: new Response(body, { headers: { 'content-type': 'application/json' } }) }; await expect(checkWordPressPostStatus({ functions: { invoke: vi.fn(async () => ({ data: null, error })) } } as never, input)).rejects.toMatchObject({ code: 'REMOTE_NOT_FOUND', message: '찾을 수 없습니다.' }) })
})
