import { describe, expect, it, vi } from 'vitest'

import { createHandler } from './handler.ts'

const values: Record<string, string> = {
  WORDPRESS_SITE_URL: 'https://wordpress.example.com',
  WORDPRESS_USERNAME: 'api-user',
  WORDPRESS_APPLICATION_PASSWORD: 'application-secret',
  WORDPRESS_ALLOWED_USER_ID: '11111111-1111-4111-8111-111111111111',
  APP_ALLOWED_ORIGINS: 'https://app.example.com',
}

function wordpressFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input))
  const data = url.pathname === '/wp-json/'
    ? { name: 'Site', namespaces: ['wp/v2'], authentication: { 'application-passwords': { endpoints: { authorization: 'https://wordpress.example.com/wp-admin/authorize-application.php' } } } }
    : url.pathname.endsWith('/users/me')
      ? { id: 1, name: 'Editor', roles: ['editor'], capabilities: { edit_posts: true, publish_posts: false, upload_files: false, manage_categories: false, edit_others_posts: false, delete_posts: false } }
      : url.pathname.endsWith('/types')
        ? { post: { rest_base: 'posts', taxonomies: ['category', 'post_tag'] } }
        : url.pathname.endsWith('/statuses')
          ? { draft: {}, pending: {}, publish: {}, future: {}, private: {} }
          : []
  return Promise.resolve(new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-wp-total': '0', 'x-wp-totalpages': '0' } }))
}

function handler(overrides: Partial<{ verifyCaller: (token: string) => Promise<{ id: string }>; fetchImpl: typeof fetch }> = {}) {
  return createHandler({
    environment: { get: (name) => values[name] },
    verifyCaller: overrides.verifyCaller ?? vi.fn().mockResolvedValue({ id: values.WORDPRESS_ALLOWED_USER_ID }),
    fetchImpl: overrides.fetchImpl ?? wordpressFetch,
    now: () => new Date('2026-07-17T00:00:00.000Z'),
  })
}

function request(method = 'POST', body = JSON.stringify({ action: 'diagnose' }), headers: Record<string, string> = {}) {
  return new Request('https://functions.example.com/wordpress-diagnostics', {
    method,
    body: ['GET', 'OPTIONS'].includes(method) ? undefined : body,
    headers: { origin: 'https://app.example.com', authorization: 'Bearer valid-token', 'content-type': 'application/json', ...headers },
  })
}

describe('wordpress diagnostics handler', () => {
  it('handles an allowlisted OPTIONS preflight without authentication', async () => {
    const response = await handler()(request('OPTIONS'))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  it('handles preflight before WordPress credentials are configured', async () => {
    const environment = { get: (name: string) => name === 'APP_ALLOWED_ORIGINS' ? values.APP_ALLOWED_ORIGINS : undefined }
    const response = await createHandler({ environment, verifyCaller: vi.fn() })(request('OPTIONS'))
    expect(response.status).toBe(204)
  })

  it('runs POST diagnose for the exact allowed Supabase user', async () => {
    const verifyCaller = vi.fn().mockResolvedValue({ id: values.WORDPRESS_ALLOWED_USER_ID })
    const response = await handler({ verifyCaller })(request())
    expect(response.status).toBe(200)
    expect(verifyCaller).toHaveBeenCalledWith('valid-token')
    await expect(response.json()).resolves.toMatchObject({ schemaVersion: 1, ok: true, readiness: { connection: 'ready' } })
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('rejects %s without calling WordPress', async (method) => {
    const fetchImpl = vi.fn<typeof fetch>()
    const response = await handler({ fetchImpl })(request(method))
    expect(response.status).toBe(405)
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } })
  })

  it.each([
    ['{}', 'application/json'],
    ['{"action":"other"}', 'application/json'],
    ['{"action":"diagnose","url":"https://evil.example.com"}', 'application/json'],
    ['{', 'application/json'],
    ['{"action":"diagnose"}', 'text/plain'],
  ])('rejects malformed or arbitrary request payload', async (body, contentType) => {
    const response = await handler()(request('POST', body, { 'content-type': contentType }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } })
  })

  it.each(['', 'Basic abc', 'Bearer', 'Bearer token with spaces'])('rejects malformed authorization %s', async (authorization) => {
    const response = await handler()(request('POST', undefined, { authorization }))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CALLER_UNAUTHENTICATED' } })
  })

  it('rejects an invalid JWT and a different authenticated user', async () => {
    const invalid = await handler({ verifyCaller: vi.fn().mockRejectedValue(new Error('invalid token')) })(request())
    expect(invalid.status).toBe(401)
    const forbidden = await handler({ verifyCaller: vi.fn().mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' }) })(request())
    expect(forbidden.status).toBe(403)
    await expect(forbidden.json()).resolves.toMatchObject({ error: { code: 'CALLER_FORBIDDEN' } })
  })

  it('rejects a disallowed origin without CORS reflection', async () => {
    const response = await handler()(request('POST', undefined, { origin: 'https://evil.example.com' }))
    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('returns a safe upstream error without secrets, headers, stack, or response bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: 'private upstream body' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    const response = await handler({ fetchImpl })(request())
    const serialized = JSON.stringify(await response.json())
    expect(response.status).toBe(424)
    expect(serialized).toContain('WORDPRESS_AUTH_FAILED')
    expect(serialized).not.toContain('application-secret')
    expect(serialized).not.toContain('api-user')
    expect(serialized).not.toContain('private upstream body')
    expect(serialized).not.toContain('valid-token')
    expect(serialized).not.toContain('stack')
  })
})
