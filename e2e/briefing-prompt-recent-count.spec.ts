import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '00000000-0000-4000-8000-000000000501'
const RUN_ID = '00000000-0000-4000-8000-000000000502'

const category = {
  id: 'economy',
  content_group: 'news',
  name: '경제',
  code: 'ECO',
  wrapper_class: 'daily-brief-note news-briefing economy',
  display_id_pattern: '#YYYY-MM-DD-ECO',
  slug_pattern: 'economy-briefing-YYYY-MM-DD',
  sort_order: 1,
  enabled: true,
}

const context = {
  schemaVersion: 1,
  referenceDate: '2026-07-26',
  category: {
    id: category.id,
    name: category.name,
    code: category.code,
    wrapperClass: category.wrapper_class,
    displayIdPattern: category.display_id_pattern,
    slugPattern: category.slug_pattern,
  },
  recentPosts: [],
  openTopics: [],
  pendingFollowups: [],
  recentClosedTopics: [],
  counts: {
    recentPosts: 0,
    recentUpdates: 0,
    openTopics: 0,
    pendingFollowups: 0,
    overdueFollowups: 0,
    recentClosedTopics: 0,
  },
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
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
      },
    }))
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

test('generates and preserves a recent-count 10 prompt run', async ({ page }) => {
  await installAuthenticatedSession(page)
  let savedRow: Record<string, unknown> | null = null

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/rest/v1/categories') {
      await fulfillJson(route, [category])
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_news_briefing_prompt_context') {
      expect(request.postDataJSON()).toMatchObject({ p_category_id: 'economy', p_recent_post_limit: 10 })
      await fulfillJson(route, context)
      return
    }
    if (url.pathname === '/rest/v1/rpc/save_news_briefing_prompt_run') {
      const payload = request.postDataJSON() as Record<string, unknown>
      expect(payload.p_requested_post_count).toBe(10)
      savedRow = {
        id: RUN_ID,
        category_id: 'economy',
        reference_date: '2026-07-26',
        prompt_mode: 'standard',
        closed_lookback_days: 90,
        context_schema_version: 1,
        context_snapshot: payload.p_context_snapshot,
        prompt_text: payload.p_prompt_text,
        is_pinned: false,
        generated_at: '2026-07-26T03:00:00+00:00',
        requested_post_count: 10,
        actual_post_count: 0,
      }
      await fulfillJson(route, savedRow)
      return
    }
    if (url.pathname === '/rest/v1/generated_prompts') {
      await fulfillJson(route, savedRow)
      return
    }
    await route.abort()
  })

  await page.goto('/briefing-prompts')
  const recentCount = page.getByLabel('최근 글 수')
  await expect(recentCount).toBeVisible()
  const box = await recentCount.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? Number.MAX_SAFE_INTEGER)

  await recentCount.selectOption('10')
  await page.getByRole('button', { name: '프롬프트 생성' }).click()
  await expect(page.getByText('요청 10개 · 실제 사용 0개')).toBeVisible()
  await page.getByRole('button', { name: '현재 프롬프트 저장' }).click()
  await page.getByRole('link', { name: '저장한 이력 보기' }).click()

  await expect(page).toHaveURL(new RegExp(`/briefing-prompts/history/${RUN_ID}$`))
  await expect(page.getByText('요청한 최근 글 수').locator('..')).toContainText('10개')
  await expect(page.getByText('실제 사용한 최근 글 수').locator('..')).toContainText('0개')
  await expect(page.getByRole('textbox', { name: '저장된 프롬프트' })).not.toHaveValue('')
})
