import { describe, expect, it } from 'vitest'
import { DraftError } from './errors'
import { parseDraftCreateRequest } from './requestSchema'

const valid = {
  action: 'create-draft',
  contentId: '10000000-0000-4000-8000-000000000001',
  expectedSourceUpdatedAt: '2026-07-19T03:04:05.123456+00:00',
  expectedPayloadFingerprint: `sha256:${'a'.repeat(64)}`,
  idempotencyKey: '20000000-0000-4000-8000-000000000002',
  confirmation: { confirmed: true, scope: 'single-wordpress-draft' },
} as const

function request(body: unknown, contentType = 'application/json') {
  return new Request('https://function.example.com', { method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(body) })
}

async function code(body: unknown) {
  try { await parseDraftCreateRequest(request(body)); return null }
  catch (error) { return error instanceof DraftError ? error.code : 'UNKNOWN' }
}

describe('wordpress draft request schema', () => {
  it('accepts only the server rebuild contract', async () => {
    await expect(parseDraftCreateRequest(request(valid))).resolves.toEqual(valid)
  })

  it.each([
    ['unknown payload field', { ...valid, status: 'publish' }, 'INVALID_REQUEST'],
    ['invalid content UUID', { ...valid, contentId: 'not-a-uuid' }, 'INVALID_REQUEST'],
    ['locale timestamp', { ...valid, expectedSourceUpdatedAt: '7/19/2026 12:00' }, 'INVALID_REQUEST'],
    ['unprefixed fingerprint', { ...valid, expectedPayloadFingerprint: 'a'.repeat(64) }, 'INVALID_REQUEST'],
    ['invalid idempotency UUID', { ...valid, idempotencyKey: 'same-request' }, 'INVALID_REQUEST'],
    ['confirmation false', { ...valid, confirmation: { ...valid.confirmation, confirmed: false } }, 'CONFIRMATION_REQUIRED'],
    ['wrong confirmation scope', { ...valid, confirmation: { confirmed: true, scope: 'publish' } }, 'CONFIRMATION_REQUIRED'],
    ['arbitrary payload', { ...valid, payload: { title: 'override' } }, 'INVALID_REQUEST'],
  ])('rejects %s', async (_name, body, expected) => {
    await expect(code(body)).resolves.toBe(expected)
  })

  it('rejects non-JSON and oversized bodies', async () => {
    await expect(parseDraftCreateRequest(request(valid, 'text/plain'))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const body = { ...valid, padding: 'x'.repeat(5_000) }
    await expect(parseDraftCreateRequest(request(body))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })
})
