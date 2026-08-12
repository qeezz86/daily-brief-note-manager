import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '00000000-0000-4000-8000-0000000005aa'

const activeCategories = [
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', sort_order: 60, display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column' },
  { id: 'info-db', content_group: 'info_db', name: '정보DB', sort_order: 70, display_id_pattern: '정보DB-###', slug_pattern: 'info-db-###', wrapper_class: 'daily-brief-note info-db' },
  { id: 'chinese-study', content_group: 'chinese', name: '중국어 학습', sort_order: 80, display_id_pattern: null, slug_pattern: 'cctv-chinese-news-###', wrapper_class: 'daily-brief-note chinese-study' },
]

function row(categoryId: 'ai-column' | 'info-db' | 'chinese-study') {
  const names = {
    'ai-column': 'AI 칼럼',
    'info-db': '정보DB',
    'chinese-study': '중국어 학습',
  }
  return {
    id: `internal-${categoryId}`,
    updated_at: '2026-08-11T02:00:00Z',
    display_id: categoryId === 'chinese-study' ? null : `${categoryId}-001`,
    series_no: 1,
    title: `${names[categoryId]} 기존 글`,
    slug: `${categoryId}-001`,
    summary: '중복 검토용 요약',
    published_on: '2026-08-10',
    categories: { id: categoryId, name: names[categoryId] },
    seo_data: categoryId === 'chinese-study' ? [] : [{ focus_keyword: '핵심 키워드' }],
    post_tags: categoryId === 'ai-column' ? [{ tags: { name: 'AI' } }] : [],
    ai_metadata: categoryId === 'ai-column' ? [{ field_name: '생성형 AI' }] : [],
    info_db_metadata: categoryId === 'info-db' ? [{ field_name: '경제 용어' }] : [],
    chinese_metadata: categoryId === 'chinese-study' ? [{
      program_name: '新闻联播',
      original_title: '原文标题',
      original_url: 'https://news.cctv.com/item',
      learning_topic: '경제 중국어',
      learning_points: '핵심 표현',
    }] : [],
  }
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
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
        created_at: '2026-08-11T00:00:00Z',
        updated_at: '2026-08-11T00:00:00Z',
      },
    }))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (sessionStorage.getItem('force-copy-failure') === 'true') {
            throw new Error('clipboard denied')
          }
          sessionStorage.setItem('non-news-context-copy', text)
        },
      },
    })
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

async function installBackend(page: Page) {
  const restMethods: string[] = []
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    restMethods.push(request.method())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/rest/v1/posts') {
      const categoryFilter = url.searchParams.get('categories.id') ?? ''
      const categoryId = categoryFilter.replace(/^eq\./u, '')
      expect(['ai-column', 'info-db', 'chinese-study']).toContain(categoryId)
      expect(url.searchParams.get('content_status')).toBe('in.(ready,published)')
      await fulfillJson(route, [row(categoryId as 'ai-column' | 'info-db' | 'chinese-study')])
      return
    }
    if (url.pathname === '/rest/v1/categories') {
      expect(url.searchParams.get('enabled')).toBe('eq.true')
      await fulfillJson(route, activeCategories)
      return
    }
    await route.abort('blockedbyclient')
  })
  return restMethods
}

test('desktop: context and composer generate, validate, copy, stale, regenerate, and fail copy without writes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  await installAuthenticatedSession(page)
  const restMethods = await installBackend(page)
  await page.goto('/non-news-contexts')

  await expect(page.getByRole('heading', { name: '비뉴스 중복 방지 컨텍스트' })).toBeVisible()
  const navigation = page.getByRole('link', { name: '비뉴스 컨텍스트' })
  await expect(navigation).toHaveAttribute('href', '/non-news-contexts')
  await expect(navigation).toHaveAttribute('aria-current', 'page')
  const category = page.getByLabel('비뉴스 카테고리')
  await expect(category).toHaveValue('ai-column')
  await category.selectOption('info-db')
  await expect(page.getByText('사용 항목 1개 / 최대 30개')).toBeVisible()

  const preview = page.getByLabel('복사용 비뉴스 컨텍스트')
  await expect(preview).toHaveValue(/카테고리: 정보DB \(info-db\)/u)
  await page.getByRole('button', { name: '컨텍스트 복사' }).click()
  await expect(page.getByText('컨텍스트를 복사했습니다.')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('non-news-context-copy'))).toBe(await preview.inputValue())

  await page.getByLabel('새 글 주제').fill('인플레이션 기초 가이드')
  await page.getByLabel('각도 또는 초점 (선택)').fill('가계 관점')
  await page.getByRole('button', { name: '작성 프롬프트 생성' }).click()
  await expect(page.getByText('유효', { exact: true })).toBeVisible()
  const authoringPreview = page.getByLabel('복사용 비뉴스 작성 프롬프트')
  await expect(authoringPreview).toHaveValue(/\[BEGIN_NON_NEWS_AUTHORING_PROMPT\]/u)
  await page.getByRole('button', { name: '작성 프롬프트 복사' }).click()
  expect(await page.evaluate(() => sessionStorage.getItem('non-news-context-copy'))).toBe(await authoringPreview.inputValue())

  await page.getByLabel('사용자 추가 지시 (선택)').fill('직장인을 위한 예시를 강조해 주세요.')
  await expect(page.getByText('오래된 미리보기', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '작성 프롬프트 복사' })).toBeDisabled()
  await page.getByRole('button', { name: '프롬프트 다시 생성' }).click()
  await expect(page.getByText('유효', { exact: true })).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem('force-copy-failure', 'true'))
  await page.getByRole('button', { name: '작성 프롬프트 복사' }).click()
  await expect(page.getByText('작성 프롬프트를 복사하지 못했습니다.')).toBeVisible()
  expect(restMethods.length).toBeGreaterThanOrEqual(2)
  expect(new Set(restMethods)).toEqual(new Set(['GET']))
})

test('iPhone: Chinese composer preserves [번호], stale copy block, exact copy, and mobile width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone')
  await installAuthenticatedSession(page)
  const restMethods = await installBackend(page)
  await page.goto('/non-news-contexts')

  const navigation = page.getByRole('link', { name: '비뉴스 컨텍스트' })
  await expect(navigation).toBeVisible()
  await navigation.click()
  const category = page.getByLabel('비뉴스 카테고리')
  await expect(category).toBeVisible()
  await category.selectOption('chinese-study')
  await expect(page.getByText('사용 항목 1개 / 최대 20개')).toBeVisible()
  const preview = page.getByLabel('복사용 비뉴스 컨텍스트')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveValue(/시리즈 번호: 1/u)

  const copyButton = page.getByRole('button', { name: '컨텍스트 복사' })
  const copyBox = await copyButton.boundingBox()
  expect(copyBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  await copyButton.click()
  await expect(page.getByText('컨텍스트를 복사했습니다.')).toBeVisible()

  await page.getByLabel('새 글 주제').fill('첨단 제조업 핵심 표현')
  await page.getByRole('button', { name: '작성 프롬프트 생성' }).click()
  const authoringPreview = page.getByLabel('복사용 비뉴스 작성 프롬프트')
  await expect(authoringPreview).toHaveValue(/\[번호\]/u)
  expect(await authoringPreview.inputValue()).not.toMatch(/CCTV 뉴스로 배우는 중국어 #\d+/u)
  const authoringCopy = page.getByRole('button', { name: '작성 프롬프트 복사' })
  const authoringCopyBox = await authoringCopy.boundingBox()
  expect(authoringCopyBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  await page.getByLabel('각도 또는 초점 (선택)').fill('초급 학습자')
  await expect(page.getByText('오래된 미리보기', { exact: true })).toBeVisible()
  await expect(authoringCopy).toBeDisabled()
  await page.getByRole('button', { name: '프롬프트 다시 생성' }).click()
  await authoringCopy.click()
  expect(await page.evaluate(() => sessionStorage.getItem('non-news-context-copy'))).toBe(await authoringPreview.inputValue())
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  expect(new Set(restMethods)).toEqual(new Set(['GET']))
})
