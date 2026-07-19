import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { createWordPressDraft, WordPressDraftServiceError } from './wordpressDraftCreate.service'

const input = {
  contentId: '10000000-0000-4000-8000-000000000001', expectedSourceUpdatedAt: '2026-07-19T00:00:00Z',
  expectedPayloadFingerprint: `sha256:${'a'.repeat(64)}`, idempotencyKey: '20000000-0000-4000-8000-000000000002',
}
const success = {
  schemaVersion: 1, ok: true, operation: 'create-draft', created: true, idempotentReplay: false,
  attemptId: '30000000-0000-4000-8000-000000000003',
  source: { contentId: input.contentId, sourceUpdatedAt: input.expectedSourceUpdatedAt, payloadFingerprint: input.expectedPayloadFingerprint },
  wordpress: { postId: 91, status: 'draft', slug: 'economy-briefing-2026-07-19', link: 'https://wordpress.example.com/?p=91' },
}
function client(data: unknown, error: unknown = null) { return { functions: { invoke: vi.fn().mockResolvedValue({ data, error }) } } as unknown as DatabaseClient }

describe('wordpress draft create service', () => {
  it('sends identifiers, reviewed values and exact confirmation without a WordPress payload', async () => {
    const db = client(success)
    await expect(createWordPressDraft(db, input)).resolves.toMatchObject({ wordpress: { status: 'draft' } })
    expect(db.functions.invoke).toHaveBeenCalledWith('wordpress-draft-create', { method: 'POST', body: {
      action: 'create-draft', ...input, confirmation: { confirmed: true, scope: 'single-wordpress-draft' },
    } })
    const calls = vi.mocked(db.functions.invoke).mock.calls
    expect(JSON.stringify(calls)).not.toContain('"content"')
    expect(JSON.stringify(calls)).not.toContain('"categories"')
  })

  it('rejects non-HTTPS links and non-draft responses', async () => {
    await expect(createWordPressDraft(client({ ...success, wordpress: { ...success.wordpress, link: 'javascript:alert(1)' } }), input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(createWordPressDraft(client({ ...success, wordpress: { ...success.wordpress, status: 'publish' } }), input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('never exposes a raw Function error', async () => {
    await expect(createWordPressDraft(client(null, new Error('Authorization Basic secret')), input)).rejects.toEqual(expect.objectContaining<Partial<WordPressDraftServiceError>>({ code: 'UNKNOWN' }))
  })
})
