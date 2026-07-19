import { describe, expect, it, vi } from 'vitest'
import { buildPayload } from '../wordpress-publication-preview/payloadBuilder'
import type { SourceContent, TaxonomyMapping } from '../wordpress-publication-preview/schemas'
import { createWordPressDraftHandler } from './handler'
import type { AttemptDatabase, PublicationAttempt } from './schemas'

const ownerId = '00000000-0000-4000-8000-000000005c01'
const contentId = '5c100000-0000-4000-8000-000000000001'
const idempotencyKey = '5c300000-0000-4000-8000-000000000001'
const updatedAt = '2026-07-19T00:00:00Z'
const tagNames = ['금리 정책', '통화 정책', '경제 전망', '물가 동향', '금융 시장']
const source: SourceContent = {
  id: contentId, categoryId: 'economy', categoryName: '경제', contentGroup: 'news',
  wrapperClass: 'daily-brief-note news-briefing economy', slugPattern: 'economy-briefing-YYYY-MM-DD',
  seriesNo: null, briefingDate: '2026-07-19', publishedOn: null, contentStatus: 'ready', updatedAt,
  representativeTitle: '대표 제목', metaDescription: '가'.repeat(130),
  htmlBody: '<div class="daily-brief-note news-briefing economy"><h1>대표 제목</h1></div>',
  slug: 'economy-briefing-2026-07-19',
  tags: tagNames.map((name, index) => ({ id: `00000000-0000-4000-8000-0000000000${index + 10}`, name, normalizedName: name })),
}

function env(name: string) {
  return ({ WORDPRESS_SITE_URL: 'https://wordpress.example.com', WORDPRESS_USERNAME: 'wp-user', WORDPRESS_APPLICATION_PASSWORD: 'wp-pass', WORDPRESS_ALLOWED_USER_ID: ownerId, APP_ALLOWED_ORIGINS: 'https://app.example.com' } as Record<string, string>)[name]
}

function makeDatabase(sourceValue: SourceContent | null = source) {
  let attempt: PublicationAttempt | null = null
  const transitions: string[] = []
  const database: AttemptDatabase = {
    loadContent: vi.fn(async () => sourceValue), readContentUpdatedAt: vi.fn(async () => sourceValue?.updatedAt ?? null),
    loadMappings: vi.fn(async () => [] as TaxonomyMapping[]),
    findByIdempotency: vi.fn(async () => attempt),
    findContentGuard: vi.fn(async () => attempt && ['executing', 'succeeded', 'uncertain'].includes(attempt.status) ? attempt : null),
    insertReceived: vi.fn(async (input) => {
      attempt = {
        id: '5c200000-0000-4000-8000-000000000001', ownerId: input.ownerId, contentId: input.contentId,
        siteOrigin: input.siteOrigin, idempotencyKey: input.idempotencyKey,
        expectedSourceUpdatedAt: input.expectedSourceUpdatedAt, expectedPayloadFingerprint: input.expectedPayloadFingerprint,
        actualPayloadFingerprint: null, status: 'received', wordpressPostId: null, wordpressPostStatus: null,
        wordpressPostSlug: null, wordpressPostLink: null, errorCode: null, errorRetryable: null,
        startedAt: null, completedAt: null,
      }
      return attempt
    }),
    transition: vi.fn(async (input) => {
      if (!attempt) throw new Error('missing')
      transitions.push(`${input.expectedStatus}->${input.newStatus}`)
      attempt = {
        ...attempt, status: input.newStatus, actualPayloadFingerprint: input.actualPayloadFingerprint ?? attempt.actualPayloadFingerprint,
        wordpressPostId: input.wordpressPostId ?? null, wordpressPostStatus: input.wordpressPostStatus ?? null,
        wordpressPostSlug: input.wordpressPostSlug ?? null, wordpressPostLink: input.wordpressPostLink ?? null,
        errorCode: input.errorCode ?? null, errorRetryable: input.errorRetryable ?? null,
        startedAt: input.newStatus === 'executing' ? new Date(0).toISOString() : attempt.startedAt,
        completedAt: ['blocked', 'succeeded', 'failed_safe', 'uncertain'].includes(input.newStatus) ? new Date(0).toISOString() : null,
      }
      return attempt
    }),
  }
  return { database, transitions, current: () => attempt }
}

function wpJson(body: unknown, status = 200, paged = false) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json', ...(paged ? { 'x-wp-total': String(Array.isArray(body) ? body.length : 0), 'x-wp-totalpages': '1' } : {}),
  } })
}

function wordpressFetch(options: { failPost?: boolean } = {}) {
  return vi.fn(async (url: URL, init?: RequestInit) => {
    const pathname = new URL(String(url)).pathname
    if (init?.method === 'POST') {
      if (options.failPost) throw new TypeError('connection closed')
      return wpJson({ id: 91, status: 'draft', slug: source.slug, link: 'https://wordpress.example.com/?p=91' }, 201)
    }
    if (pathname.endsWith('/users/me')) return wpJson({ id: 1, capabilities: { edit_posts: true } })
    if (pathname.endsWith('/categories')) return wpJson([{ id: 7, name: '경제', slug: 'economy', parent: 0, count: 0 }], 200, true)
    if (pathname.endsWith('/tags')) return wpJson(tagNames.map((name, index) => ({ id: 11 + index, name, slug: `tag-${index}`, count: 0 })), 200, true)
    if (pathname.endsWith('/statuses')) return wpJson({ draft: {}, pending: {}, publish: {}, future: {}, private: {} })
    if (pathname.endsWith('/posts')) return wpJson([])
    throw new Error(`unexpected ${pathname}`)
  })
}

function request(fingerprint: string, overrides: Record<string, unknown> = {}) {
  return new Request('https://function.example.com', { method: 'POST', headers: {
    origin: 'https://app.example.com', authorization: 'Bearer token', 'content-type': 'application/json',
  }, body: JSON.stringify({
    action: 'create-draft', contentId, expectedSourceUpdatedAt: updatedAt,
    expectedPayloadFingerprint: fingerprint, idempotencyKey,
    confirmation: { confirmed: true, scope: 'single-wordpress-draft' }, ...overrides,
  }) })
}

async function expectedFingerprint() {
  return (await buildPayload(source, [7], [11, 12, 13, 14, 15])).payloadFingerprint
}

describe('WordPress draft create handler', () => {
  it('rebuilds, locks, creates one draft, records success and replays without another POST', async () => {
    const fixture = makeDatabase()
    const fetchMock = wordpressFetch()
    const handler = createWordPressDraftHandler({ environment: { get: env }, verifyCaller: vi.fn(async () => ({ id: ownerId })), createDatabase: () => fixture.database, fetchImpl: fetchMock })
    const fingerprint = await expectedFingerprint()
    const first = await handler(request(fingerprint))
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ ok: true, created: true, wordpress: { postId: 91, status: 'draft', slug: source.slug } })
    expect(fixture.transitions).toEqual(['received->validating', 'validating->executing', 'executing->succeeded'])
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
    const replay = await handler(request(fingerprint))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ created: false, idempotentReplay: true })
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('blocks stale source and fingerprint mismatch before any WordPress POST', async () => {
    for (const body of [
      { expectedSourceUpdatedAt: '2026-07-18T00:00:00Z', expectedPayloadFingerprint: await expectedFingerprint(), code: 'SOURCE_CHANGED' },
      { expectedSourceUpdatedAt: updatedAt, expectedPayloadFingerprint: `sha256:${'f'.repeat(64)}`, code: 'PAYLOAD_FINGERPRINT_MISMATCH' },
    ]) {
      const fixture = makeDatabase()
      const fetchMock = wordpressFetch()
      const handler = createWordPressDraftHandler({ environment: { get: env }, verifyCaller: vi.fn(async () => ({ id: ownerId })), createDatabase: () => fixture.database, fetchImpl: fetchMock })
      const response = await handler(request(body.expectedPayloadFingerprint, { expectedSourceUpdatedAt: body.expectedSourceUpdatedAt }))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: { code: body.code } })
      expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0)
    }
  })

  it('records an uncertain sent request and never resends the same key', async () => {
    const fixture = makeDatabase()
    const fetchMock = wordpressFetch({ failPost: true })
    const handler = createWordPressDraftHandler({ environment: { get: env }, verifyCaller: vi.fn(async () => ({ id: ownerId })), createDatabase: () => fixture.database, fetchImpl: fetchMock })
    const fingerprint = await expectedFingerprint()
    const first = await handler(request(fingerprint))
    expect(first.status).toBe(502)
    expect(fixture.current()?.status).toBe('uncertain')
    const second = await handler(request(fingerprint))
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: { code: 'MANUAL_RECONCILIATION_REQUIRED' } })
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
  })

  it('rejects method, origin, authentication, caller and arbitrary request fields', async () => {
    const fixture = makeDatabase()
    const fingerprint = await expectedFingerprint()
    const base = { environment: { get: env }, createDatabase: () => fixture.database, fetchImpl: wordpressFetch() }
    const method = await createWordPressDraftHandler({ ...base, verifyCaller: vi.fn() })(new Request('https://function.example.com', { method: 'GET', headers: { origin: 'https://app.example.com' } }))
    expect(method.status).toBe(405)
    const noAuth = await createWordPressDraftHandler({ ...base, verifyCaller: vi.fn() })(new Request('https://function.example.com', { method: 'POST', headers: { origin: 'https://app.example.com', 'content-type': 'application/json' }, body: '{}' }))
    expect(noAuth.status).toBe(401)
    const forbidden = await createWordPressDraftHandler({ ...base, verifyCaller: vi.fn(async () => ({ id: crypto.randomUUID() })) })(request(fingerprint))
    expect(forbidden.status).toBe(403)
    const invalid = await createWordPressDraftHandler({ ...base, verifyCaller: vi.fn(async () => ({ id: ownerId })) })(request(fingerprint, { status: 'publish' }))
    expect(invalid.status).toBe(400)
  })
})
