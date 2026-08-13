import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '6a000000-0000-4000-8000-000000000001'
const POST_ID = '6a000000-0000-4000-8000-000000000101'
const headings = [
  '1. SEO 입력용 대표 제목', '2. SEO 대안 제목 4개', '3. 메타 설명', '4. URL 슬러그', '5. 포커스 키워드', '6. SEO 태그 5~8개',
  '7. 워드프레스 본문용 HTML — 하나의 연속된 HTML 코드 블록, 올바른 wrapper, <h1>, 최종 닫는 wrapper, HTML 내부 이미지 프롬프트 금지',
  '8. 대표 이미지 프롬프트', '9. 이미지 ALT 문구', '10. 발행 전 체크리스트',
]
const categories = [
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', code: 'AI', sort_order: 60, display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column', enabled: true },
  { id: 'info-db', content_group: 'info_db', name: '정보DB', code: 'INFO', sort_order: 70, display_id_pattern: '정보DB-###', slug_pattern: 'info-db-###', wrapper_class: 'daily-brief-note info-db', enabled: true },
  { id: 'chinese-study', content_group: 'chinese', name: '중국어 학습', code: 'CHINESE', sort_order: 80, display_id_pattern: null, slug_pattern: 'cctv-chinese-news-###', wrapper_class: 'daily-brief-note chinese-study', enabled: true },
]

function response({ meta = '가'.repeat(120), extraHtml = '' } = {}) {
  const sections = [
    '새로운 업무 설계', '- 대안 제목 하나\n- 대안 제목 둘\n- 대안 제목 셋\n- 대안 제목 넷', meta, 'ai-###', '업무 설계',
    '- 인공지능\n- 업무혁신\n- 생산성\n- 자동화\n- 디지털전환',
    `\`\`\`html\n<div class="daily-brief-note ai-column"><h1>새로운 업무 설계</h1>${extraHtml}<section id="sources"><p data-source-name="기관" data-checked-point="핵심 확인"><a href="https://example.com/article">원문</a></p></section></div>\n\`\`\``,
    '사무실에서 협업하는 사람들의 미니멀한 대표 이미지', '사무실에서 협업하는 사람들', '- 제목 확인\n- 출처 확인',
  ]
  return headings.map((heading, index) => `${heading}\n${sections[index]}`).join('\n\n')
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: accessToken, refresh_token: 'e2e-refresh-token', expires_in: 2_000_000_000, expires_at: 4_102_444_800, token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    }))
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
}

async function installBackend(page: Page) {
  const saves: Record<string, unknown>[] = []
  let failNextSave = false
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) { await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } }); return }
    if (url.pathname === '/rest/v1/rpc/save_chatgpt_paste_post') {
      saves.push(request.postDataJSON() as Record<string, unknown>)
      if (failNextSave) { failNextSave = false; await fulfillJson(route, { code: 'XX000', message: 'private SQL RLS owner raw response' }, 500); return }
      await fulfillJson(route, { postId: POST_ID, title: '새로운 업무 설계', categoryId: 'ai-column', status: 'draft', slug: 'ai-007', displayId: 'AI-007', publishedOn: null, wordpressUrl: null })
      return
    }
    if (url.pathname.startsWith('/rest/v1/categories')) { await fulfillJson(route, categories); return }
    if (url.pathname.startsWith('/rest/v1/')) { await fulfillJson(route, []); return }
    await route.abort('blockedbyclient')
  })
  return { saves, failOnce: () => { failNextSave = true } }
}

async function enterValidReview(page: Page, text = response()) {
  await page.goto('/imports')
  await page.getByRole('radio', { name: '비뉴스 일반 응답 붙여넣기' }).check()
  await page.getByLabel('카테고리').selectOption('ai-column')
  await page.getByLabel('시리즈 번호').fill('7')
  await page.getByLabel('비뉴스 canonical 10-section 응답 plain text').fill(text)
  await page.getByRole('button', { name: '10-section 분석' }).click()
}

test.beforeEach(async ({ page }) => installAuthenticatedSession(page))

test('desktop completes parse, edit, validate, duplicate recheck, confirmation, and one safe draft save', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const backend = await installBackend(page)
  await enterValidReview(page)
  await expect(page.getByRole('heading', { name: '비뉴스 응답 검토 및 편집' })).toBeVisible()
  await page.getByLabel('SEO 대표 제목').fill('편집된 SEO 대표 제목')
  await page.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }).click()
  await expect(page.getByText(/정확한 DB 중복 검사가 complete/u)).toBeVisible()
  await page.getByRole('button', { name: '최종 저장 확인 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '초안 한 건 저장 최종 확인' })
  await expect(dialog).toContainText('AI 칼럼')
  await expect(dialog).toContainText('새로운 업무 설계')
  await expect(dialog).toContainText('ai-007')
  await expect(dialog).toContainText('draft')
  await page.getByRole('button', { name: '초안 한 건 저장 확인' }).dblclick()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u'))
  expect(backend.saves).toHaveLength(1)
  expect(Object.keys(backend.saves[0])).toEqual(['p_item'])
  const serialized = JSON.stringify(backend.saves[0])
  expect(serialized).not.toMatch(/10-section|checklist|owner|auth|session|source_import_type|provenance/iu)
})

test('desktop keeps unsafe HTML inert, requires stale revalidation and warning acknowledgement, and redacts failures', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const backend = await installBackend(page)
  const externalRequests: string[] = []
  page.on('request', (request) => { if (request.url().startsWith('https://untrusted.example.test/')) externalRequests.push(request.url()) })
  await enterValidReview(page, response({ meta: '짧은 설명', extraHtml: '<img src="https://untrusted.example.test/pixel.png" onerror="alert(1)">' }))
  await page.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }).click()
  await expect(page.getByText(/NON_NEWS_HTML_EXECUTABLE_CONTENT/u)).toBeVisible()
  expect(await page.locator('img[src="https://untrusted.example.test/pixel.png"]').count()).toBe(0)
  expect(externalRequests).toEqual([])

  await page.getByLabel('비뉴스 WordPress HTML inert preview').fill(response().match(/```html\n([\s\S]*?)\n```/u)?.[1] ?? '')
  await expect(page.getByText(/오래된 검증/u)).toBeVisible()
  await page.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }).click()
  await page.getByLabel('현재 검증 경고를 확인했으며 초안 저장을 계속합니다.').check()
  backend.failOnce()
  await page.getByRole('button', { name: '최종 저장 확인 열기' }).click()
  await page.getByRole('button', { name: '초안 한 건 저장 확인' }).click()
  const alert = page.getByRole('alert').last()
  await expect(alert).toContainText('자동 재시도하지 않았습니다')
  await expect(alert).not.toContainText('private SQL')
  expect(backend.saves).toHaveLength(1)
})

test('iPhone paste, edit, revalidate, and confirmation remain touch reachable without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone')
  await installBackend(page)
  await enterValidReview(page)
  await page.getByLabel('이미지 ALT 문구').fill('모바일에서 편집한 이미지 설명')
  await page.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }).click()
  await page.getByRole('button', { name: '최종 저장 확인 열기' }).click()
  await expect(page.getByRole('button', { name: '초안 한 건 저장 확인' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  for (const name of ['Canonical 재검증 및 DB 중복 검사', '초안 한 건 저장 확인']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(42)
  }
})

