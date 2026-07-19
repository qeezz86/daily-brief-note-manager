import { describe, expect, it, vi } from 'vitest'

import { DiagnosticError } from './errors.ts'
import { createWordPressClient } from './wordpressClient.ts'

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function client(fetchImpl: typeof fetch, options: { timeoutMs?: number; maxResponseBytes?: number } = {}) {
  return createWordPressClient({
    baseUrl: new URL('https://wordpress.example.com/'),
    username: 'api-user',
    applicationPassword: 'abcd efgh',
    fetchImpl,
    ...options,
  })
}

async function expectError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code })
}

describe('createWordPressClient', () => {
  it('uses only fixed GET paths, Basic Auth in the server request, manual redirects, and a User-Agent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ namespaces: [] }))
    await client(fetchImpl).get('discovery')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('https://wordpress.example.com/wp-json/')
    expect(init?.method).toBe('GET')
    expect(init?.redirect).toBe('manual')
    expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${btoa('api-user:abcdefgh')}`)
    expect(new Headers(init?.headers).get('user-agent')).toBe('Daily-Brief-Note-WordPress-Diagnostics/1.0')
  })

  it('encodes a non-ASCII WordPress username as UTF-8 Basic Auth', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}))
    const unicodeClient = createWordPressClient({
      baseUrl: new URL('https://wordpress.example.com/'),
      username: '편집자',
      applicationPassword: 'abcd',
      fetchImpl,
    })
    await unicodeClient.get('discovery')
    const authorization = new Headers(fetchImpl.mock.calls[0][1]?.headers).get('authorization') ?? ''
    const encoded = authorization.replace('Basic ', '')
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('편집자:abcd')
  })

  it.each([
    ['categories', 'context=view', 'per_page=100', '_fields=id%2Cname%2Cslug%2Cparent%2Ccount'],
    ['tags', 'hide_empty=false', 'page=1', '_fields=id%2Cname%2Cslug%2Ccount'],
    ['posts', 'per_page=1', 'context=edit', '_fields=id%2Cslug%2Cstatus%2Cmodified_gmt'],
  ] as const)('builds the fixed %s query', async (endpoint, first, second, third) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]))
    await client(fetchImpl).get(endpoint)
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain(first)
    expect(url).toContain(second)
    expect(url).toContain(third)
  })

  it('parses pagination headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([], { headers: { 'x-wp-total': '105', 'x-wp-totalpages': '2' } }))
    await expect(client(fetchImpl).get('tags')).resolves.toMatchObject({ total: 105, totalPages: 2 })
  })

  it.each([
    [401, 'WORDPRESS_AUTH_FAILED'],
    [403, 'WORDPRESS_FORBIDDEN'],
    [429, 'WORDPRESS_RATE_LIMITED'],
    [500, 'WORDPRESS_HTTP_ERROR'],
  ] as const)('maps upstream %s without returning its body', async (status, code) => {
    await expectError(client(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: 'secret-internal-error' }, { status }))).get('user'), code)
  })

  it.each([301, 307, 308])('rejects redirect status %s without following it', async (status) => {
    const response = jsonResponse({}, { status, headers: { location: 'https://other.example.com/private' } })
    await expectError(client(vi.fn<typeof fetch>().mockResolvedValue(response)).get('user'), 'WORDPRESS_REDIRECTED')
  })

  it('rejects HTML and invalid JSON responses', async () => {
    await expectError(client(vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }))).get('user'), 'WORDPRESS_RESPONSE_INVALID')
    await expectError(client(vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { headers: { 'content-type': 'application/json' } }))).get('user'), 'WORDPRESS_RESPONSE_INVALID')
  })

  it('limits response bodies', async () => {
    const response = jsonResponse({ value: 'x'.repeat(100) })
    await expectError(client(vi.fn<typeof fetch>().mockResolvedValue(response), { maxResponseBytes: 20 }).get('user'), 'WORDPRESS_RESPONSE_INVALID')
  })

  it('aborts timed out requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await expectError(client(fetchImpl, { timeoutMs: 5 }).get('user'), 'WORDPRESS_TIMEOUT')
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('maps network failures without leaking credential text', async () => {
    const request = client(vi.fn<typeof fetch>().mockRejectedValue(new Error('api-user abcdefgh'))).get('user')
    try {
      await request
    } catch (error) {
      expect(error).toBeInstanceOf(DiagnosticError)
      expect(JSON.stringify(error)).not.toContain('abcdefgh')
      expect((error as DiagnosticError).code).toBe('REST_API_UNREACHABLE')
    }
  })
})
