import { describe, expect, it, vi } from 'vitest'
import { createPostStatusHandler } from './handler'

const environment = new Map([['WORDPRESS_SITE_URL', 'https://example.com'], ['WORDPRESS_USERNAME', 'user'], ['WORDPRESS_APPLICATION_PASSWORD', 'password'], ['WORDPRESS_ALLOWED_USER_ID', '11111111-1111-4111-8111-111111111111'], ['APP_ALLOWED_ORIGINS', 'https://app.example.com']])
const requestBody = { action: 'check-post-status', contentId: '22222222-2222-4222-8222-222222222222', attemptId: '33333333-3333-4333-8333-333333333333' }
const row = { id: requestBody.attemptId, owner_id: '11111111-1111-4111-8111-111111111111', content_id: requestBody.contentId, operation: 'create_draft', status: 'succeeded', site_origin: 'https://example.com', wordpress_post_id: 7, wordpress_post_status: 'draft', wordpress_post_slug: 'post', wordpress_post_link: 'https://example.com/post' }
function handler(fetchImpl?: typeof fetch) { return createPostStatusHandler({ environment: { get: (name) => environment.get(name) }, verifyCaller: async () => ({ id: '11111111-1111-4111-8111-111111111111' }), createDatabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) }) }) as never, fetchImpl, now: () => new Date('2026-08-24T00:00:00.000Z') }) }
function request() { return new Request('https://edge.example.com', { method: 'POST', headers: { origin: 'https://app.example.com', authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(requestBody) }) }
describe('post status handler', () => {
  it('returns normalized, mutation-free result', async () => { const response = await handler(vi.fn(async () => new Response(JSON.stringify({ id: 7, slug: 'post', status: 'draft', link: 'https://example.com/post', modified_gmt: '2026-08-24T00:00:00', date_gmt: null }), { headers: { 'content-type': 'application/json' } }))).call(null, request()); expect(response.status).toBe(200); expect((await response.json()).ok).toBe(true) })
  it('responds to CORS preflight', async () => expect((await handler()(new Request('https://edge.example.com', { method: 'OPTIONS', headers: { origin: 'https://app.example.com' } }))).status).toBe(204))
})
