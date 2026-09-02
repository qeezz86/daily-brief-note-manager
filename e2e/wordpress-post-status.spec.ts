import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '10000000-0000-4000-8000-000000000001'
const POST_ID = '20000000-0000-4000-8000-000000000001'
const ATTEMPT_ID = '30000000-0000-4000-8000-000000000001'
const checkedAt = '2026-08-24T00:00:00.000Z'

type ReconciliationPrimary = 'IN_SYNC' | 'REMOTE_NOT_FOUND' | 'REMOTE_RESPONSE_UNCERTAIN'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function postStatusResponse(primary: ReconciliationPrimary = 'IN_SYNC') {
  const wordpress = primary === 'IN_SYNC'
    ? { wordpressPostId: 901, status: 'publish', slug: 'remote-slug', link: 'https://wordpress.example.com/remote-slug', modifiedGmt: checkedAt, dateGmt: null }
    : null
  return {
    schemaVersion: 1, ok: true, checkedAt,
    source: { contentId: POST_ID, attemptId: ATTEMPT_ID },
    stored: { wordpressPostId: 901, status: 'draft', slug: 'saved-slug', link: 'https://wordpress.example.com/?p=901' },
    wordpress,
    reconciliation: { primary, deltas: primary === 'IN_SYNC' ? ['STATUS_CHANGED', 'SLUG_CHANGED', 'LINK_CHANGED'] : [] },
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId, timestamp }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const token = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: token, refresh_token: 'refresh', expires_in: 2_000_000_000, expires_at: 4_102_444_800, token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', email_confirmed_at: timestamp, phone: '', app_metadata: {}, user_metadata: {}, identities: [], created_at: timestamp, updated_at: timestamp },
    }))
  }, { userId: USER_ID, timestamp: checkedAt })
}

async function installBackend(page: Page, statusResponse = postStatusResponse(), options: { holdStatus?: boolean } = {}) {
  const calls: Record<string, unknown>[] = []
  const statusGate = deferred()
  const post = { id: POST_ID, category_id: 'economy', display_id: '#2026-08-24-ECO', series_no: null, briefing_date: '2026-08-24', published_on: '2026-08-24', title: 'WordPress 상태 확인 대상', summary: '상태 확인용 요약', html_body: null, image_prompt: null, image_alt: null, image_prompt_version: 1, image_prompt_updated_at: null, slug: 'saved-slug', content_status: 'ready', wordpress_url: null, created_at: checkedAt, updated_at: checkedAt }
  const category = { id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: '#YYYY-MM-DD-ECO', slug_pattern: 'economy-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing economy' }
  const attempt = { id: ATTEMPT_ID, operation: 'create_draft', status: 'succeeded', started_at: checkedAt, completed_at: checkedAt, created_at: checkedAt, wordpress_post_id: 901, wordpress_post_status: 'draft', wordpress_post_slug: 'saved-slug', wordpress_post_link: 'https://wordpress.example.com/?p=901', error_code: null, actual_payload_fingerprint: null }
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) return fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
    if (url.pathname === '/functions/v1/wordpress-post-status') {
      const body = request.postDataJSON() as Record<string, unknown>
      calls.push(body)
      expect(Object.keys(body).sort()).toEqual(['action', 'attemptId', 'contentId'])
      expect(body).toEqual({ action: 'check-post-status', contentId: POST_ID, attemptId: ATTEMPT_ID })
      expect(body).not.toHaveProperty('wordpressPostId')
      expect(body).not.toHaveProperty('remoteUrl')
      expect(body).not.toHaveProperty('remoteQuery')
      if (options.holdStatus) await statusGate.promise
      return fulfillJson(route, statusResponse)
    }
    if (!url.pathname.startsWith('/rest/v1/')) return route.abort('blockedbyclient')
    const table = url.pathname.slice('/rest/v1/'.length)
    const rows: unknown[] = table === 'posts' ? [post]
      : table === 'categories' ? [category]
        : table === 'wordpress_publication_attempts' ? [attempt]
          : []
    return fulfillJson(route, rows)
  })
  return { calls, releaseStatus: statusGate.resolve }
}

async function expectNoPostSyncWrites(page: Page) {
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'WordPress 게시물 상태' }) })
  await expect(panel.getByRole('button', { name: /게시|발행|복구|동기화 저장|수정|삭제/i })).toHaveCount(0)
}

test('Chromium: explicit post-status check sends one bounded request and renders all observed deltas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, postStatusResponse(), { holdStatus: true })
  await page.goto(`/content/${POST_ID}`)

  const button = page.getByRole('button', { name: 'WordPress 상태 확인' })
  await expect(button).toBeVisible()
  expect(backend.calls).toEqual([])
  await button.click()
  await expect(page.getByRole('status')).toHaveText('WordPress 상태를 확인하고 있습니다.')
  await expect(button).toBeDisabled()
  backend.releaseStatus()
  await expect(page.getByText('현재 원격 상태를 확인했습니다.')).toBeVisible()
  await expect(page.getByText('STATUS_CHANGED, SLUG_CHANGED, LINK_CHANGED')).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://wordpress.example.com/remote-slug' })).toHaveAttribute('href', 'https://wordpress.example.com/remote-slug')
  expect(backend.calls).toHaveLength(1)
  await expectNoPostSyncWrites(page)
})

test('Chromium: missing and uncertain remote states remain safe manual guidance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await installAuthenticatedSession(page)
  await installBackend(page, postStatusResponse('REMOTE_NOT_FOUND'))
  await page.goto(`/content/${POST_ID}`)
  await page.getByRole('button', { name: 'WordPress 상태 확인' }).click()
  await expect(page.getByText(/WordPress에서 게시물을 찾지 못했습니다/)).toBeVisible()
  await expectNoPostSyncWrites(page)
})

test('iPhone: explicit post-status action is reachable without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone')
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, postStatusResponse('REMOTE_RESPONSE_UNCERTAIN'))
  await page.goto(`/content/${POST_ID}`)
  const button = page.getByRole('button', { name: 'WordPress 상태 확인' })
  await expect(button).toBeVisible()
  expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40)
  expect(backend.calls).toEqual([])
  await button.click()
  await expect(page.getByText(/원격 응답을 안전하게 확인하지 못했습니다/)).toBeVisible()
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  expect(layout.width).toBeLessThanOrEqual(layout.viewport)
  await expectNoPostSyncWrites(page)
})