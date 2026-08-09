import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '5f000000-0000-4000-8000-000000000001'
const POST_ID = '5f000000-0000-4000-8000-000000000101'

const category = {
  id: 'economy', content_group: 'news', name: '경제', code: 'ECO', sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO', slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy', enabled: true,
}

function structuredPaste({ title = '경제 브리핑', tracking = false } = {}) {
  return `[CONTENT_META_JSON]\n${JSON.stringify({ contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title, slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null })}\n[/CONTENT_META_JSON]\n[SEO_JSON]\n${JSON.stringify({ representativeTitle: '경제 브리핑 대표 제목', alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'], metaDescription: '가'.repeat(120), focusKeyword: '경제 브리핑', tags: ['금리', '환율', '물가', '산업', '정책'] })}\n[/SEO_JSON]\n[IMAGE_PROMPT_JSON]\n{"prompt":"경제 장면","alt":"경제 장면"}\n[/IMAGE_PROMPT_JSON]\n[SOURCES_JSON]\n[{"sourceName":"기관","sourceTitle":"원문","sourceUrl":"https://example.com/article","sourcePublishedAt":null,"checkedPoint":"핵심 확인"}]\n[/SOURCES_JSON]\n[WORDPRESS_HTML]\n<div class="daily-brief-note news-briefing economy"><h1>${title}</h1><p>&lt;script&gt;inert text&lt;/script&gt;</p></div>\n[/WORDPRESS_HTML]${tracking ? '\n[NEWS_TRACKING_JSON]\n{"updates":[],"followups":[]}\n[/NEWS_TRACKING_JSON]' : ''}`
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
  const savePayloads: Record<string, unknown>[] = []
  let failNextSave = false
  let holdNextSave = false
  let releaseHeldSave: (() => void) | null = null
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) { await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } }); return }
    if (url.pathname === '/rest/v1/rpc/save_chatgpt_paste_post') {
      const body = request.postDataJSON() as Record<string, unknown>
      savePayloads.push(body)
      if (holdNextSave) {
        holdNextSave = false
        await new Promise<void>((resolve) => { releaseHeldSave = resolve })
      }
      if (failNextSave) {
        failNextSave = false
        await fulfillJson(route, { code: 'XX000', message: 'private owner raw backend failure' }, 500)
        return
      }
      await fulfillJson(route, { postId: POST_ID, title: '경제 브리핑', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-01', displayId: '#2026-08-01-ECO', publishedOn: '2026-08-01', wordpressUrl: null })
      return
    }
    if (url.pathname.startsWith('/rest/v1/categories')) { await fulfillJson(route, [category]); return }
    if (url.pathname.startsWith('/rest/v1/')) { await fulfillJson(route, []); return }
    await route.abort('blockedbyclient')
  })
  return {
    savePayloads,
    failOnce: () => { failNextSave = true },
    holdOnce: () => { holdNextSave = true },
    release: () => { releaseHeldSave?.(); releaseHeldSave = null },
  }
}

test.beforeEach(async ({ page }) => {
  await installAuthenticatedSession(page)
})

test('valid paste previews locally and explicit double confirmation performs one active save', async ({ page }, testInfo) => {
  const backend = await installBackend(page)
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.goto('/imports')
  await expect(page.getByRole('radio', { name: '기존 JSON Import' })).toBeVisible()
  await page.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }).check()
  await page.getByLabel('구조화 ChatGPT 응답 plain text').fill(structuredPaste())
  await page.getByRole('button', { name: '로컬 미리보기 생성' }).click()

  await expect(page.getByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toBeVisible()
  await expect(page.getByRole('region', { name: '구조화 붙여넣기 미리보기' })
    .getByText('경제 브리핑 대표 제목', { exact: true })).toBeVisible()
  await expect(page.getByLabel('WordPress HTML inert preview')).toContainText('<script>inert text</script>')
  expect(await page.locator('script').filter({ hasText: 'inert text' }).count()).toBe(0)
  expect(backend.savePayloads).toHaveLength(0)
  await expect(page).toHaveURL(/\/imports$/u)

  backend.holdOnce()
  await page.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }).dblclick()
  await expect.poll(() => backend.savePayloads.length).toBe(1)
  backend.release()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u'))
  expect(Object.keys(backend.savePayloads[0])).toEqual(['p_item'])
  const serialized = JSON.stringify(backend.savePayloads[0])
  expect(serialized).not.toContain('[CONTENT_META_JSON]')
  expect(serialized).not.toMatch(/owner|auth|session|source_import_type|news_tracking/iu)
  expect(downloads).toEqual([])

  if (testInfo.project.name === 'iphone') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  }
})

test('blocked, edit, reset, warning acknowledgement, redacted failure, and manual retry remain controlled', async ({ page }, testInfo) => {
  const backend = await installBackend(page)
  await page.goto('/imports')
  await page.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }).check()
  const input = page.getByLabel('구조화 ChatGPT 응답 plain text')

  await input.fill(structuredPaste({ title: '' }))
  await page.getByRole('button', { name: '로컬 미리보기 생성' }).click()
  await expect(page.getByText(/차단 오류 \d+개/u)).toBeVisible()
  await expect(page.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })).toBeDisabled()
  expect(backend.savePayloads).toHaveLength(0)

  await input.fill(structuredPaste())
  await expect(page.getByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toHaveCount(0)
  await page.getByRole('button', { name: '붙여넣기 초기화' }).click()
  await expect(input).toHaveValue('')

  await input.fill(structuredPaste({ tracking: true }))
  await page.getByRole('button', { name: '로컬 미리보기 생성' }).click()
  const confirm = page.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })
  await expect(confirm).toBeDisabled()
  await page.getByLabel('저장에서 제외되는 항목과 모든 경고를 확인했습니다.').check()
  await expect(confirm).toBeEnabled()

  backend.failOnce()
  await confirm.click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('수동으로 다시 시도')
  await expect(alert).not.toContainText('private owner raw backend failure')
  await expect(page.getByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toBeVisible()
  if (testInfo.project.name === 'iphone') {
    const inputBox = await input.boundingBox()
    expect(inputBox?.width ?? 0).toBeGreaterThan(250)
  }
  await page.getByRole('button', { name: '수동으로 다시 저장' }).click()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u'))
  expect(backend.savePayloads).toHaveLength(2)
})
