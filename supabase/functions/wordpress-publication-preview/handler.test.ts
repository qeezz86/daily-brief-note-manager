import { describe, expect, it, vi } from 'vitest'
import { createPublicationPreviewHandler } from './handler'
import type { CallerDatabase, EnvironmentSource } from './schemas'

const allowedId = '00000000-0000-4000-8000-000000000001'
const env: EnvironmentSource = { get(name) { return ({ WORDPRESS_SITE_URL: 'https://example.com', WORDPRESS_USERNAME: 'wp-user', WORDPRESS_APPLICATION_PASSWORD: 'wp-pass', WORDPRESS_ALLOWED_USER_ID: allowedId, APP_ALLOWED_ORIGINS: 'https://app.example.com' } as Record<string, string>)[name] } }
const database: CallerDatabase = { loadContent: vi.fn(), readContentUpdatedAt: vi.fn(), loadMappings: vi.fn() }
const wpResponse = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-wp-total': Array.isArray(data) ? String(data.length) : '0', 'x-wp-totalpages': '1' } })
const request = (body: unknown, overrides: RequestInit = {}) => new Request('https://function.example.com', { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://app.example.com', authorization: 'Bearer token', 'content-type': 'application/json' }, ...overrides })

describe('publication preview handler', () => {
  it('catalog action은 GET 2건과 write 0건만 수행한다', async () => {
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => { void init; return wpResponse(String(url).includes('/categories') ? [{ id: 1, name: '경제', slug: 'economy', parent: 0, count: 0 }] : [{ id: 2, name: 'AI', slug: 'ai', count: 0 }]) })
    const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(async () => ({ id: allowedId })), createDatabase: () => database, fetchImpl: fetchMock, now: () => new Date(0) })
    const response = await handler(request({ action: 'get-taxonomy-catalog' }))
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, writePerformed: false, site: { origin: 'https://example.com' } }); expect(fetchMock).toHaveBeenCalledTimes(2); expect(fetchMock.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true)
  })
  it('유효한 요청의 무인증 호출은 401이다', async () => { const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(), createDatabase: () => database }); const response = await handler(new Request('https://function.example.com', { method: 'POST', body: JSON.stringify({ action: 'get-taxonomy-catalog' }), headers: { origin: 'https://app.example.com', 'content-type': 'application/json' } })); expect(response.status).toBe(401) })
  it('비허용 사용자는 403이다', async () => { const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(async () => ({ id: crypto.randomUUID() })), createDatabase: () => database }); expect((await handler(request({ action: 'get-taxonomy-catalog' }))).status).toBe(403) })
  it('비허용 origin은 403이다', async () => { const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(async () => ({ id: allowedId })), createDatabase: () => database }); const bad = request({ action: 'get-taxonomy-catalog' }, { headers: { origin: 'https://evil.example.com', authorization: 'Bearer token', 'content-type': 'application/json' } }); expect((await handler(bad)).status).toBe(403) })
  it('GET은 405다', async () => { const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(), createDatabase: () => database }); const response = await handler(new Request('https://function.example.com', { method: 'GET', headers: { origin: 'https://app.example.com' } })); expect(response.status).toBe(405) })
  it('arbitrary action/content/URL/term ID는 400이다', async () => { const handler = createPublicationPreviewHandler({ environment: env, verifyCaller: vi.fn(), createDatabase: () => database }); const response = await handler(request({ action: 'prepare-publication', contentId: crypto.randomUUID(), url: 'https://evil.example.com', categories: [99] })); expect(response.status).toBe(400) })
})
