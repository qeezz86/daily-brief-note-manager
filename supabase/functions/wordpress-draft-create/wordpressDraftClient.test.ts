import { describe, expect, it, vi } from 'vitest'
import type { PublicationPayload } from '../wordpress-publication-preview/schemas'
import { createWordPressDraftClient } from './wordpressDraftClient'

const payload: PublicationPayload = {
  title: '대표 제목', content: '<div><h1>대표 제목</h1></div>', status: 'draft',
  slug: 'economy-briefing-2026-07-19', excerpt: '메타 설명', categories: [7], tags: [11, 12],
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
})
const success = { id: 91, status: 'draft', slug: payload.slug, link: 'https://wordpress.example.com/?p=91', content: { rendered: 'secret' } }

describe('WordPress draft write client', () => {
  it('checks edit_posts with GET and sends exactly one fixed POST with allowlisted fields', async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => init?.method === 'GET'
      ? json({ id: 1, capabilities: { edit_posts: true, publish_posts: true } }) : json(success, 201))
    const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: fetchMock })
    await expect(client.verifyDraftCapability()).resolves.toBe(true)
    await expect(client.createDraft(payload)).resolves.toEqual({ postId: 91, status: 'draft', slug: payload.slug, link: success.link })
    const [url, init] = fetchMock.mock.calls[1]
    expect(String(url)).toBe('https://wordpress.example.com/wp-json/wp/v2/posts')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect(Object.keys(JSON.parse(String(init?.body))).sort()).toEqual(['categories', 'content', 'excerpt', 'slug', 'status', 'tags', 'title'])
    expect(JSON.parse(String(init?.body)).status).toBe('draft')
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('does not expose raw response fields', async () => {
    const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => json(success, 201)) })
    expect(await client.createDraft(payload)).not.toHaveProperty('content')
  })

  it.each([
    ['missing id', { ...success, id: undefined }, 'WORDPRESS_DRAFT_RESPONSE_INVALID'],
    ['publish status', { ...success, status: 'publish' }, 'WORDPRESS_DRAFT_RESPONSE_INVALID'],
    ['wrong slug', { ...success, slug: 'other' }, 'WORDPRESS_DRAFT_RESPONSE_INVALID'],
    ['javascript link', { ...success, link: 'javascript:alert(1)' }, 'WORDPRESS_DRAFT_RESPONSE_INVALID'],
  ])('rejects %s success response', async (_name, response, expected) => {
    const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => json(response, 201)) })
    await expect(client.createDraft(payload)).rejects.toMatchObject({ code: expected })
  })

  it.each([400, 401, 403, 404, 409])('classifies explicit HTTP %s rejection as failed-safe', async (status) => {
    const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => json({ code: 'rest_error', message: 'no' }, status)) })
    await expect(client.createDraft(payload)).rejects.toMatchObject({ code: 'WORDPRESS_DRAFT_REJECTED' })
  })

  it.each([429, 500, 503])('classifies HTTP %s after POST as uncertain', async (status) => {
    const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: vi.fn(async () => json({ code: 'rest_error' }, status)) })
    await expect(client.createDraft(payload)).rejects.toMatchObject({ code: 'WORDPRESS_DRAFT_RESULT_UNCERTAIN' })
  })

  it('rejects redirect, invalid JSON, non-JSON and oversized response without another POST', async () => {
    const fixtures = [
      new Response('', { status: 302, headers: { location: 'https://evil.example.com' } }),
      new Response('{', { status: 201, headers: { 'content-type': 'application/json' } }),
      new Response('<html>', { status: 201, headers: { 'content-type': 'text/html' } }),
      json(success, 201, { 'content-length': '999999' }),
    ]
    for (const response of fixtures) {
      const fetchMock = vi.fn(async () => response)
      const client = createWordPressDraftClient({ baseUrl: new URL('https://wordpress.example.com'), username: 'user', applicationPassword: 'pass', fetchImpl: fetchMock })
      await expect(client.createDraft(payload)).rejects.toMatchObject({ code: 'WORDPRESS_DRAFT_RESULT_UNCERTAIN' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
})
