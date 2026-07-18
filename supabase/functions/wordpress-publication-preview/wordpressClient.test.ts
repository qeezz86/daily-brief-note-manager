import { describe, expect, it, vi } from 'vitest'
import { createPublicationWordPressClient } from './wordpressClient'

function response(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
}

describe('publication WordPress GET-only client', () => {
  it('taxonomy query와 field를 고정한다', async () => {
    const fetchMock = vi.fn(async () => response([], { headers: { 'content-type': 'application/json', 'x-wp-total': '0', 'x-wp-totalpages': '1' } }))
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: fetchMock })
    await client.getCatalogPage('categories', 1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('GET'); expect(init.redirect).toBe('manual')
    expect(String(url)).toContain('/wp-json/wp/v2/categories?'); expect(String(url)).toContain('_fields=id%2Cname%2Cslug%2Cparent%2Ccount')
  })
  it('duplicate query는 content와 excerpt를 요청하지 않는다', async () => {
    const fetchMock = vi.fn(async () => response([]))
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: fetchMock })
    await client.findPostsBySlug('economy-briefing-2026-07-18', 'draft')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('_fields=id%2Cslug%2Cstatus%2Cmodified_gmt%2Clink'); expect(url).not.toContain('content'); expect(url).not.toContain('excerpt')
  })
  it('응답 slug가 요청과 다르면 차단한다', async () => {
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => response([{ id: 1, slug: 'other', status: 'draft' }])) })
    await expect(client.findPostsBySlug('expected', 'draft')).rejects.toMatchObject({ code: 'WORDPRESS_READ_FAILED' })
  })
  it('redirect를 따라가지 않고 차단한다', async () => {
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => response({}, { status: 302 })) })
    await expect(client.getStatuses()).rejects.toMatchObject({ code: 'WORDPRESS_READ_FAILED' })
  })
  it('429는 retryable 안전 오류다', async () => {
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => response({}, { status: 429 })) })
    await expect(client.getStatuses()).rejects.toMatchObject({ code: 'WORDPRESS_READ_FAILED', retryable: true })
  })
  it('response size 상한을 적용한다', async () => {
    const client = createPublicationWordPressClient({ baseUrl: new URL('https://example.com'), username: 'user', applicationPassword: 'pass', maxResponseBytes: 5, fetchImpl: vi.fn(async () => response({ long: 'value' })) })
    await expect(client.getStatuses()).rejects.toMatchObject({ code: 'WORDPRESS_READ_FAILED' })
  })
})
