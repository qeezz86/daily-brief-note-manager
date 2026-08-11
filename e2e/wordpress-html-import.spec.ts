import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '5a000000-0000-4000-8000-000000000001'
const POST_ID = '5a000000-0000-4000-8000-000000000101'

const category = {
  id: 'economy', content_group: 'news', name: '경제', code: 'ECO', sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO', slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy', enabled: true,
}

function manualHtml(extra = '') {
  return `<div class="daily-brief-note news-briefing economy"><h1>경제 브리핑</h1><p class="intro">경제 요약</p><p class="brief-meta">2026-08-09 #2026-08-09-ECO</p><link rel="canonical" href="https://example.com/economy-briefing-2026-08-09">${extra}</div>`
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: accessToken, refresh_token: 'e2e-refresh-token', expires_in: 2_000_000_000,
      expires_at: 4_102_444_800, token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    }))
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
}

async function installBackend(page: Page) {
  const saves: Record<string, unknown>[] = []
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) { await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } }); return }
    if (url.pathname === '/rest/v1/rpc/save_wordpress_manual_post') {
      saves.push(request.postDataJSON() as Record<string, unknown>)
      await fulfillJson(route, { postId: POST_ID, title: '편집된 경제 브리핑', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-09', displayId: '#2026-08-09-ECO', publishedOn: '2026-08-09', wordpressUrl: 'https://example.com/economy-briefing-2026-08-09' })
      return
    }
    if (url.pathname.startsWith('/rest/v1/categories')) { await fulfillJson(route, [category]); return }
    if (url.pathname.startsWith('/rest/v1/')) { await fulfillJson(route, []); return }
    await route.abort('blockedbyclient')
  })
  return saves
}

test.beforeEach(async ({ page }) => {
  await installAuthenticatedSession(page)
})

test('manual WordPress HTML is analyzed, edited, validated, and explicitly saved once', async ({ page }, testInfo) => {
  const saves = await installBackend(page)
  await page.goto('/imports')
  await page.getByRole('radio', { name: 'WordPress HTML 붙여넣기' }).check()
  const input = page.getByLabel('WordPress HTML 원문')
  await input.fill(manualHtml())
  await page.getByRole('button', { name: '로컬 HTML 분석' }).click()

  await expect(page.getByRole('heading', { name: 'WordPress HTML 구조 미리보기 및 편집' })).toBeVisible()
  await page.getByLabel('제목', { exact: true }).fill('편집된 경제 브리핑')
  await page.getByRole('button', { name: 'Canonical 검증 및 DB 중복 검사' }).click()
  await expect(page.getByText(/DB 중복 검사와 canonical validation이 완료되었습니다/u)).toBeVisible()
  expect(saves).toHaveLength(0)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }).click()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u'))
  expect(saves).toHaveLength(1)
  expect(Object.keys(saves[0])).toEqual(['p_item'])
  const payload = saves[0].p_item as Record<string, unknown>
  expect(payload.title).toBe('편집된 경제 브리핑')
  expect(payload.html_body).toBe(manualHtml())
  expect(JSON.stringify(payload)).not.toMatch(/owner|auth|session|source_import_type|news_tracking/iu)

  if (testInfo.project.name === 'iphone') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  }
})

test('unsafe pasted nodes stay inert and block persistence on desktop and mobile', async ({ page }) => {
  const saves = await installBackend(page)
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://untrusted.example.test/')) externalRequests.push(request.url())
  })
  await page.goto('/imports')
  await page.getByRole('radio', { name: 'WordPress HTML 붙여넣기' }).check()
  await page.getByLabel('WordPress HTML 원문').fill(manualHtml('<script>window.__manualExecuted=true</script><img src="https://untrusted.example.test/pixel.png" onerror="window.__manualExecuted=true">'))
  await page.getByRole('button', { name: '로컬 HTML 분석' }).click()

  await expect(page.getByText(/HTML_SCRIPT_NOT_ALLOWED/u)).toBeVisible()
  await expect(page.getByText(/HTML_EVENT_HANDLER_NOT_ALLOWED/u)).toBeVisible()
  await expect(page.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' })).toBeDisabled()
  expect(await page.evaluate(() => Reflect.get(window, '__manualExecuted'))).toBeUndefined()
  expect(await page.locator('img[src="https://untrusted.example.test/pixel.png"]').count()).toBe(0)
  expect(externalRequests).toEqual([])
  expect(saves).toHaveLength(0)
})
