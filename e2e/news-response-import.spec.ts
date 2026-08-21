import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '7a000000-0000-4000-8000-000000000001'
const POST_ID = '7a000000-0000-4000-8000-000000000101'
const headings = ['1. SEO 입력용 대표 제목', '2. SEO 대안 제목 4개', '3. 메타 설명', '4. URL 슬러그', '5. 포커스 키워드', '6. SEO 태그 5~8개', '7. 워드프레스 본문용 HTML', '8. 대표 이미지 프롬프트', '9. 이미지 ALT 문구', '10. 발행 전 체크리스트']
const categories = [
  { id: 'economy', content_group: 'news', name: '경제', code: 'ECO', sort_order: 10, display_id_pattern: '#YYYY-MM-DD-ECO', slug_pattern: 'economy-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing economy', enabled: true },
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', code: 'AI', sort_order: 60, display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column', enabled: true },
]
function response(meta = '가'.repeat(120)) {
  const sections = ['경제 흐름 대표 제목', '- 대안 하나\n- 대안 둘\n- 대안 셋\n- 대안 넷', meta, 'economy-briefing-2026-08-13', '경제 흐름', '- 금리\n- 환율\n- 물가\n- 산업\n- 정책', '```html\n<div class="daily-brief-note news-briefing economy"><h1>경제 흐름 대표 제목</h1><section id="sources"><p data-source-name="한국은행" data-source-title="통화정책" data-checked-point="기준금리"><a href="https://example.com/report">통화정책</a></p></section></div>\n```', '서울 금융 지구 편집 이미지', '서울 금융 지구', '- 제목 확인\n- 출처 확인']
  return headings.map((heading, index) => `${heading}\n${sections[index]}`).join('\n\n')
}
async function fulfillJson(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) }) }
async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({ access_token: accessToken, refresh_token: 'e2e-refresh-token', expires_in: 2_000_000_000, expires_at: 4_102_444_800, token_type: 'bearer', user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' } }))
  }, { userId: USER_ID })
}
async function installBackend(page: Page) {
  const saves: unknown[] = []
  const mutations: string[] = []
  let duplicateMode: 'clear' | 'duplicate' | 'partial' | 'unavailable' = 'clear'
  let failNextSave = false
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request(); const url = new URL(request.url())
    if (request.method() !== 'GET') mutations.push(url.pathname)
    if (url.pathname.startsWith('/auth/v1/')) { await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } }); return }
    if (url.pathname === '/rest/v1/rpc/save_chatgpt_paste_post') {
      saves.push(request.postDataJSON())
      if (failNextSave) { failNextSave = false; await fulfillJson(route, { code: 'XX000', message: 'private SQL RLS owner raw response' }, 500); return }
      await fulfillJson(route, { postId: POST_ID, title: '경제 흐름 대표 제목', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-13', displayId: '#2026-08-13-ECO', publishedOn: '2026-08-13', wordpressUrl: null }); return
    }
    if (url.pathname.startsWith('/rest/v1/categories')) { await fulfillJson(route, categories); return }
    if (url.pathname.startsWith('/rest/v1/posts')) {
      if (duplicateMode === 'unavailable' || duplicateMode === 'partial' && url.searchParams.has('or')) { await fulfillJson(route, { code: 'XX000', message: 'private lookup error' }, 500); return }
      if (duplicateMode === 'duplicate') { await fulfillJson(route, [{ category_id: 'economy', title: '경제 흐름 대표 제목', slug: 'economy-briefing-2026-08-13', display_id: '#2026-08-13-ECO', series_no: null, briefing_date: '2026-08-13', published_on: '2026-08-13', wordpress_url: null }]); return }
      await fulfillJson(route, []); return
    }
    if (url.pathname.startsWith('/rest/v1/')) { await fulfillJson(route, []); return }
    await route.abort('blockedbyclient')
  })
  return { saves, mutations, setDuplicateMode: (mode: typeof duplicateMode) => { duplicateMode = mode }, failOnce: () => { failNextSave = true } }
}
async function enterReview(page: Page, text = response()) {
  await page.goto('/imports'); await page.getByRole('radio', { name: '뉴스 일반 응답 붙여넣기', exact: true }).check(); await page.getByLabel('뉴스 카테고리').selectOption('economy'); await page.getByLabel('브리핑 날짜').fill('2026-08-13'); await page.getByLabel('뉴스 canonical 10-section 응답 plain text').fill(text); await page.getByRole('button', { name: '뉴스 10-section 분석' }).click()
}

test.beforeEach(async ({ page }) => installAuthenticatedSession(page))

test('valid response reaches inert review, complete duplicates, confirmation, one draft save, and detail navigation', async ({ page }) => {
  const backend = await installBackend(page); await enterReview(page)
  await expect(page.getByRole('heading', { name: '뉴스 응답 검토 및 편집' })).toBeVisible(); expect(await page.locator('section#sources').count()).toBe(0)
  await page.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }).click(); await expect(page.getByRole('status')).toContainText(/complete 정확 중복 검사에 충돌이 없습니다/u); await page.getByRole('button', { name: '최종 저장 확인 열기' }).click()
  const dialog = page.getByRole('dialog', { name: '뉴스 초안 한 건 저장 최종 확인' }); await expect(dialog).toContainText('경제'); await expect(dialog).toContainText('2026-08-13'); await expect(dialog).toContainText('#2026-08-13-ECO'); await expect(dialog).toContainText('draft')
  await page.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }).dblclick(); await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u')); expect(backend.saves).toHaveLength(1)
  const serialized = JSON.stringify(backend.saves[0]); expect(serialized).not.toMatch(/checklist|tracking|topic|owner|auth|session|provenance/iu); expect(backend.mutations.filter((path) => /news_topics|news_updates|followup/iu.test(path))).toEqual([])
})

test('candidate mutation becomes stale; revalidation binds warnings and conflict, partial, unavailable blocks', async ({ page }) => {
  const backend = await installBackend(page); await enterReview(page, response('짧은 설명')); await page.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }).click(); await page.getByLabel('현재 revision의 검증 경고를 확인했으며 초안 저장을 계속합니다.').check()
  await page.getByLabel('이미지 ALT 문구').fill('수정된 ALT'); await expect(page.getByText(/오래된 검증/u)).toBeVisible(); await expect(page.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  for (const mode of ['duplicate', 'partial', 'unavailable'] as const) {
    backend.setDuplicateMode(mode); await page.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }).click(); await expect(page.getByRole('alert').last()).toContainText(mode === 'duplicate' ? '정규화 exact title 중복' : mode); await expect(page.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled(); await page.getByLabel('이미지 ALT 문구').fill(`수정된 ALT ${mode}`)
  }
  expect(backend.saves).toEqual([]); expect(backend.mutations.filter((path) => /news_topics|news_updates|followup/iu.test(path))).toEqual([])
})

test('ambiguous save shows exact no-auto-retry message and only explicit manual retry makes a second call', async ({ page }) => {
  const backend = await installBackend(page); await enterReview(page); await page.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }).click(); backend.failOnce(); await page.getByRole('button', { name: '최종 저장 확인 열기' }).click(); await page.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }).click()
  const alert = page.getByRole('alert').last(); await expect(alert).toHaveText('초안 저장 결과를 확인하지 못했습니다. 자동 재시도하지 않았습니다. 미리보기와 후보는 유지됩니다. 결과를 확인한 뒤 수동으로 다시 시도하세요.'); await expect(alert).not.toContainText('private SQL'); expect(backend.saves).toHaveLength(1)
  await page.waitForTimeout(250); expect(backend.saves).toHaveLength(1); await page.getByRole('button', { name: '최종 저장 확인 열기' }).click(); await page.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }).click(); await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`, 'u')); expect(backend.saves).toHaveLength(2); expect(backend.mutations.filter((path) => /news_topics|news_updates|followup/iu.test(path))).toEqual([])
})
