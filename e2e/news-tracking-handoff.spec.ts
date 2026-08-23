import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '8b000000-0000-4000-8000-000000000001'
const POST_ID = '8b000000-0000-4000-8000-000000000101'

const newsCategory = {
  id: 'economy',
  content_group: 'news',
  name: '경제',
  sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO',
  slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy',
}

const aiCategory = {
  ...newsCategory,
  id: 'ai-column',
  content_group: 'ai',
  name: 'AI 칼럼',
  display_id_pattern: 'AI-###',
  slug_pattern: 'ai-###',
  wrapper_class: 'daily-brief-note ai-column',
}

const newsPost = {
  id: POST_ID,
  category_id: newsCategory.id,
  display_id: '#2026-08-22-ECO',
  series_no: null,
  briefing_date: '2026-08-22',
  published_on: '2026-08-22',
  title: '경제 뉴스 브리핑',
  summary: '오늘의 경제 뉴스 요약입니다.',
  html_body: null,
  slug: 'economy-briefing-2026-08-22',
  content_status: 'draft',
  wordpress_url: null,
  image_prompt: null,
  image_alt: null,
  image_prompt_version: 1,
  image_prompt_updated_at: null,
  created_at: '2026-08-22T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z',
}

const aiPost = {
  ...newsPost,
  category_id: aiCategory.id,
  display_id: 'AI-001',
  series_no: 1,
  briefing_date: null,
  title: 'AI 칼럼 초안',
  summary: 'AI 칼럼 요약입니다.',
  slug: 'ai-001',
}

const linkedUpdate = {
  id: '8b000000-0000-4000-8000-000000000201',
  post_id: POST_ID,
  topic_id: '8b000000-0000-4000-8000-000000000301',
  item_order: 1,
  update_type: 'follow_up',
  headline: '기준금리 후속 발표',
  fact_summary: '한국은행이 기준금리 방향을 발표했습니다.',
  importance_summary: null,
  impact_summary: null,
  change_summary: '직전 전망보다 인하 시점이 늦어졌습니다.',
  previous_update_id: null,
  created_at: '2026-08-22T01:00:00Z',
  updated_at: '2026-08-22T01:00:00Z',
  post: {
    id: POST_ID,
    title: newsPost.title,
    display_id: newsPost.display_id,
    briefing_date: newsPost.briefing_date,
  },
  topic: {
    id: '8b000000-0000-4000-8000-000000000301',
    canonical_title: '한국 기준금리 전망',
    category_id: newsCategory.id,
    status: 'active',
  },
  sources: [{
    id: '8b000000-0000-4000-8000-000000000401',
    source_name: '한국은행',
    source_title: '통화정책방향',
    source_url: 'https://example.com/bok',
    checked_point: '금리 방향',
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
        created_at: '2026-08-22T00:00:00Z',
        updated_at: '2026-08-22T00:00:00Z',
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

interface BackendOptions {
  post?: typeof newsPost | typeof aiPost
  updates?: (typeof linkedUpdate)[]
}

async function installBackend(page: Page, options: BackendOptions = {}) {
  const selectedPost = options.post ?? newsPost
  const selectedCategory = selectedPost.category_id === newsCategory.id ? newsCategory : aiCategory
  const requests: Array<{ method: string; pathname: string }> = []

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }

    if (!url.pathname.startsWith('/rest/v1/')) {
      await route.abort('blockedbyclient')
      return
    }

    requests.push({ method: request.method(), pathname: url.pathname })
    const table = url.pathname.slice('/rest/v1/'.length)
    const rows = table === 'posts'
      ? [selectedPost]
      : table === 'categories'
        ? [selectedCategory]
        : table === 'news_updates'
          ? options.updates ?? []
          : []
    await fulfillJson(route, rows)
  })

  return { requests }
}

test('E2E1 news post with zero updates shows tracking-not-recorded guidance', async ({ page }) => {
  await installAuthenticatedSession(page)
  await installBackend(page)

  await page.goto(`/content/${POST_ID}`)

  await expect(page.getByRole('heading', { name: '뉴스 추적' })).toBeVisible()
  await expect(page.getByText('추적 상태: 미기록')).toBeVisible()
  await expect(page.getByText(/자동으로 추론하거나 저장하지 않습니다/)).toBeVisible()
})

test('E2E2 manual handoff reaches an existing topic tracking flow', async ({ page }) => {
  await installAuthenticatedSession(page)
  await installBackend(page)
  await page.goto(`/content/${POST_ID}`)

  await page.getByRole('link', { name: '새 뉴스 주제 만들기' }).click()

  await expect(page).toHaveURL(/\/news-topics\/new$/u)
  await expect(page.getByRole('heading', { name: '뉴스 주제 신규 생성' })).toBeVisible()
})

test('E2E3 linked updates show recorded tracking information and existing navigation', async ({ page }) => {
  await installAuthenticatedSession(page)
  await installBackend(page, { updates: [linkedUpdate] })

  await page.goto(`/content/${POST_ID}`)

  await expect(page.getByText('추적 상태: 기록됨 · 연결된 뉴스 항목 1개')).toBeVisible()
  await expect(page.getByText('1. 기준금리 후속 발표')).toBeVisible()
  await expect(page.getByText('후속', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '한국 기준금리 전망' })).toHaveAttribute('href', `/news-topics/${linkedUpdate.topic.id}`)
  await expect(page.getByText(linkedUpdate.fact_summary)).toBeVisible()
  await expect(page.getByText('연결 출처 1개')).toBeVisible()
})

test('E2E4 non-news post has no tracking handoff or NEWS_TRACKING-specific update read', async ({ page }) => {
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, { post: aiPost })

  await page.goto(`/content/${POST_ID}`)
  await expect(page.getByRole('heading', { name: aiPost.title })).toBeVisible()

  await expect(page.getByRole('heading', { name: '뉴스 추적' })).toHaveCount(0)
  expect(backend.requests.filter((request) => request.pathname === '/rest/v1/news_updates')).toEqual([])
})

test('E2E5 handoff performs no tracking write, WordPress call, or external background request', async ({ page }) => {
  await installAuthenticatedSession(page)
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== SUPABASE_ORIGIN && url.origin !== 'http://127.0.0.1:4173') {
      externalRequests.push(request.url())
    }
  })
  const backend = await installBackend(page)

  await page.goto(`/content/${POST_ID}`)
  await expect(page.getByText('추적 상태: 미기록')).toBeVisible()

  expect(backend.requests.filter((request) => request.method !== 'GET' && request.method !== 'HEAD')).toEqual([])
  expect(backend.requests.filter((request) => request.pathname.includes('/rpc/'))).toEqual([])
  expect(backend.requests.filter((request) => request.pathname.toLowerCase().includes('wordpress'))).toEqual([])
  expect(externalRequests).toEqual([])
})

test('E2E6 iPhone keeps manual actions reachable without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone viewport contract')
  await installAuthenticatedSession(page)
  await installBackend(page)

  await page.goto(`/content/${POST_ID}`)
  const actions = [
    page.getByRole('link', { name: '기존 뉴스 주제 보기' }),
    page.getByRole('link', { name: '새 뉴스 주제 만들기' }),
    page.getByRole('link', { name: '뉴스 항목 추가' }),
  ]
  for (const action of actions) {
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeVisible()
  }
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )).toBe(false)
})
