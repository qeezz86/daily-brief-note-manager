import { describe, expect, it, vi } from 'vitest'
import { createWordPressPostStatusClient } from './wordpressPostStatusClient'

const body = { id: 7, slug: 'post', status: 'draft', link: 'https://example.com/post', modified_gmt: '2026-08-24T00:00:00', date_gmt: null }
const response = (value: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(value), { status, headers: { 'content-type': type } })
describe('post status WordPress client', () => {
  it('uses the fixed GET endpoint and bounded query', async () => { const fetchImpl = vi.fn(async () => response(body)); const client = createWordPressPostStatusClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'password', fetchImpl }); await client.getPost(7); const [url, init] = fetchImpl.mock.calls[0]; expect(init.method).toBe('GET'); expect(init.redirect).toBe('manual'); expect(String(url)).toBe('https://example.com/wp-json/wp/v2/posts/7?context=edit&_fields=id%2Cslug%2Cstatus%2Clink%2Cmodified_gmt%2Cdate_gmt') })
  it('maps bounded upstream failures without exposing response data', async () => { for (const status of [401, 403, 404, 302]) { const client = createWordPressPostStatusClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'password', fetchImpl: vi.fn(async () => response({}, status)) }); await expect(client.getPost(7)).rejects.toMatchObject({ code: expect.any(String) }) } })
  it('rejects invalid response identity, status, and link', async () => { for (const value of [{ ...body, id: 8 }, { ...body, status: 'unknown' }, { ...body, link: 'http://example.com/post' }]) { const client = createWordPressPostStatusClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'password', fetchImpl: vi.fn(async () => response(value)) }); await expect(client.getPost(7)).rejects.toMatchObject({ code: expect.any(String) }) } })
})
