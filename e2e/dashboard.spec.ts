import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '00000000-0000-4000-8000-000000005e01'
const POST_ID = '00000000-0000-4000-8000-000000005e02'
const PROMPT_ID = '00000000-0000-4000-8000-000000005e03'

const emptyOverview = {
  schema_version: 1,
  counts: {
    total_posts: 0,
    ready_posts: 0,
    active_news_topics: 0,
    pending_news_followups: 0,
  },
  category_counts: [
    { category_id: 'economy', category_name: '경제', post_count: 0 },
  ],
  recent_posts: [],
  recent_prompt_runs: [],
}

const populatedOverview = {
  schema_version: 1,
  counts: {
    total_posts: 8,
    ready_posts: 2,
    active_news_topics: 3,
    pending_news_followups: 1,
  },
  category_counts: [
    { category_id: 'economy', category_name: '경제', post_count: 5 },
    { category_id: 'global', category_name: '국제', post_count: 0 },
  ],
  recent_posts: [{
    id: POST_ID,
    title: '최근 경제 콘텐츠',
    category_id: 'economy',
    content_status: 'ready',
    updated_at: '2026-07-29T03:00:00+00:00',
  }],
  recent_prompt_runs: [{
    id: PROMPT_ID,
    category_id: 'economy',
    reference_date: '2026-07-29',
    requested_post_count: 5,
    actual_post_count: 4,
    generated_at: '2026-07-29T02:00:00+00:00',
  }],
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value))
      .replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
      sub: userId,
      role: 'authenticated',
      exp: 4102444800,
    })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: accessToken,
      refresh_token: 'e2e-refresh-token',
      expires_in: 2_000_000_000,
      expires_at: 4_102_444_800,
      token_type: 'bearer',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: '2026-07-29T00:00:00Z',
        updated_at: '2026-07-29T00:00:00Z',
      },
    }))
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

async function installDashboardBackend(
  page: Page,
  response: typeof emptyOverview | typeof populatedOverview,
) {
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_dashboard_overview') {
      expect(route.request().postDataJSON()).toEqual({ p_recent_limit: 5 })
      await fulfillJson(route, response)
      return
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      await fulfillJson(route, [])
      return
    }
    await route.abort('blockedbyclient')
  })
}

test('redirects an unauthenticated user to login', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/u)
  await expect(
    page.getByRole('heading', { level: 1, name: '관리자 로그인' }),
  ).toBeVisible()
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('shows a populated operational dashboard without sensitive bodies', async ({ page }, testInfo) => {
  await installAuthenticatedSession(page)
  await installDashboardBackend(page, populatedOverview)
  await page.goto('/dashboard')

  const dashboard = page.getByRole('region', { name: '운영 현황' })
  await expect(page.getByRole('heading', { level: 1, name: '운영 현황' })).toBeVisible()
  await expect(page.getByRole('link', { name: '전체 콘텐츠 8개 보기' })).toBeVisible()
  await expect(page.getByRole('link', { name: '발행 준비 2개 보기' })).toBeVisible()
  await expect(page.getByRole('link', { name: '진행 중 뉴스 주제 3개 보기' })).toBeVisible()
  await expect(page.getByRole('link', { name: '확인 대기 후속 항목 1개 보기' })).toBeVisible()
  const economyCategory = dashboard
    .getByRole('region', { name: '카테고리별 콘텐츠' })
    .getByRole('listitem')
    .filter({ hasText: /^경제\s*5개$/u })
  await expect(economyCategory).toHaveCount(1)
  await expect(economyCategory.getByText('경제', { exact: true })).toBeVisible()
  await expect(economyCategory).toContainText('5개')
  const globalCategory = dashboard
    .getByRole('region', { name: '카테고리별 콘텐츠' })
    .getByRole('listitem')
    .filter({ has: page.getByText('국제', { exact: true }) })
  await expect(globalCategory.getByText('국제', { exact: true })).toBeVisible()
  await expect(globalCategory.getByText('0개', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /최근 경제 콘텐츠/ })).toHaveAttribute(
    'href',
    `/content/${POST_ID}`,
  )
  await expect(page.getByRole('link', { name: /economy · 2026-07-29/ })).toHaveAttribute(
    'href',
    `/briefing-prompts/history/${PROMPT_ID}`,
  )
  await expect(page.getByText(/html_body|context_snapshot|prompt_text|private prompt/)).toHaveCount(0)
  const dashboardText = await dashboard.textContent()
  expect(dashboardText).not.toContain('e2e-refresh-token')
  expect(dashboardText).not.toMatch(/\b(?:category_counts|recent_prompt_runs)\b/u)

  if (testInfo.project.name === 'iphone') {
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )).toBe(false)
    await expect(page.getByRole('link', { name: /최근 경제 콘텐츠/ })).toBeVisible()
  }
})

test('shows a zero-count empty dashboard and navigates through existing routes', async ({ page }) => {
  await installAuthenticatedSession(page)
  await installDashboardBackend(page, emptyOverview)
  await page.goto('/dashboard')

  const dashboard = page.getByRole('region', { name: '운영 현황' })
  await expect(page.getByRole('link', { name: '전체 콘텐츠 0개 보기' })).toBeVisible()
  await expect(dashboard.getByRole('link', { name: '발행 준비 0개 보기' })).toBeVisible()
  await expect(dashboard.getByRole('link', { name: '진행 중 뉴스 주제 0개 보기' })).toBeVisible()
  await expect(dashboard.getByRole('link', { name: '확인 대기 후속 항목 0개 보기' })).toBeVisible()
  await expect(
    dashboard
      .getByRole('region', { name: '최근 콘텐츠' })
      .getByText('최근 콘텐츠가 없습니다.', { exact: true }),
  ).toBeVisible()
  await expect(
    dashboard
      .getByRole('region', { name: '최근 저장 프롬프트' })
      .getByText('최근 저장 프롬프트가 없습니다.', { exact: true }),
  ).toBeVisible()
  expect(await dashboard.textContent()).not.toMatch(/\b(?:null|undefined)\b/iu)
  await expect(page.getByRole('heading', { name: '운영을 시작할 준비가 되었습니다' })).toBeVisible()
  await page.getByRole('link', { name: '콘텐츠 생성' }).click()
  await expect(page).toHaveURL(/\/content\/new$/u)
})

test('sanitizes dashboard failures and retries manually', async ({ page }) => {
  await installAuthenticatedSession(page)
  let requestCount = 0
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_dashboard_overview') {
      requestCount += 1
      if (requestCount === 1) {
        await fulfillJson(route, { message: 'owner_id=private backend failure' }, 500)
      } else {
        await fulfillJson(route, emptyOverview)
      }
      return
    }
    await fulfillJson(route, [])
  })

  await page.goto('/dashboard')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
  await expect(alert).not.toContainText('owner_id=private backend failure')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByRole('link', { name: '전체 콘텐츠 0개 보기' })).toBeVisible()
  expect(requestCount).toBe(2)
})
