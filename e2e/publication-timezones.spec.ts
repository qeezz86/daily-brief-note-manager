import { expect, test, type Page } from '@playwright/test'
import { POST_ID, USER_ID, SUPABASE_ORIGIN, sourcePost } from './fixtures/wordpress-publication'

// Both browser projects run outside the product's time zones.
test.use({ timezoneId: 'America/Los_Angeles' })

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
        created_at: '2026-07-28T00:00:00Z',
        updated_at: '2026-07-28T00:00:00Z',
      },
    }))
  }, { userId: USER_ID })
}


const original = '2026-09-15T16:30:45.123456+00:00'

test('publication dates retain precision and use Seoul or Shanghai on save', async ({ page }) => {
  await installAuthenticatedSession(page)
  const post = { ...sourcePost, category_id: 'chinese-study', display_id: null, series_no: 1, briefing_date: null, html_body: null, content_status: 'draft', slug: 'cctv-chinese-news-001', published_on: '2026-09-16' }
  const category = { id: 'chinese-study', content_group: 'chinese', name: '중국어 학습', sort_order: 80, display_id_pattern: null, slug_pattern: 'cctv-chinese-news-###', wrapper_class: 'daily-brief-note chinese-study' }
  const metadata = { post_id: POST_ID, learning_topic: null, program_name: null, original_title: null, original_url: 'https://news.cctv.com/a/1', original_published_at: original, episode_list_included: null, verified_core_fact: null, difficulty: null, learning_points: null }
  let sources = [
    { id: 'source-1', source_name: '일반', source_title: '원문', source_url: 'https://example.com/a', source_published_at: original, checked_point: '확인', sort_order: 0 },
    { id: 'source-2', source_name: 'CCTV', source_title: '원문', source_url: 'https://news.cctv.com/a/1', source_published_at: original, checked_point: '확인', sort_order: 1 },
  ]
  const saves: { p_sources: typeof sources; p_chinese_metadata: typeof metadata; p_published_on: string }[] = []
  await page.route(SUPABASE_ORIGIN + '/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    let result: unknown
    if (pathname.startsWith('/auth/v1/')) result = { user: { id: USER_ID, email: 'admin@example.test' } }
    else if (pathname === '/rest/v1/rpc/save_chinese_publication_bundle') {
      const payload = route.request().postDataJSON() as (typeof saves)[number]
      saves.push(payload)
      sources = payload.p_sources.map((source, index) => ({ ...source, id: 'source-' + (index + 1) }))
      metadata.original_published_at = payload.p_chinese_metadata.original_published_at
      result = post
    } else if (route.request().method() === 'GET' && pathname.startsWith('/rest/v1/')) {
      const table = pathname.slice('/rest/v1/'.length)
      result = table === 'posts' ? [post] : table === 'categories' ? [category] : table === 'sources' ? sources : table === 'chinese_metadata' ? [metadata] : []
    } else { await route.abort('blockedbyclient'); return }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('/content/' + POST_ID + '/edit')
  const times = page.getByLabel('게시·업데이트 일시', { exact: true })
  const chineseTime = page.getByLabel('원문 게시·업데이트 시각', { exact: true })
  await expect(times.nth(0)).toHaveValue('2026-09-16T01:30:45.123')
  await expect(times.nth(1)).toHaveValue('2026-09-16T00:30:45.123')
  await expect(chineseTime).toHaveValue('2026-09-16T00:30:45.123')
  await expect(times.nth(0)).toHaveAccessibleDescription('한국 표준시(Asia/Seoul) 기준입니다.')
  await expect(chineseTime).toHaveAccessibleDescription('중국 표준시(Asia/Shanghai) 기준입니다.')
  await page.getByRole('button', { name: '변경 사항 저장', exact: true }).click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0].p_sources.map((source) => source.source_published_at)).toEqual([original, original])
  expect(saves[0].p_chinese_metadata.original_published_at).toBe(original)
  expect(saves[0].p_published_on).toBe('2026-09-16')
  await expect(page.getByText('변경 사항을 저장했습니다.', { exact: true })).toBeVisible()
  await times.nth(0).fill('2026-09-17T00:15')
  await times.nth(1).fill('2026-09-17T00:15')
  await chineseTime.fill('2026-09-17T00:15')
  await page.getByRole('button', { name: '변경 사항 저장', exact: true }).click()
  await expect.poll(() => saves.length).toBe(2)
  expect(saves[1].p_sources.map((source) => source.source_published_at)).toEqual(['2026-09-16T15:15:00Z', '2026-09-16T16:15:00Z'])
  expect(saves[1].p_chinese_metadata.original_published_at).toBe('2026-09-16T16:15:00Z')
  await expect(page.getByText('변경 사항을 저장했습니다.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(times.nth(0)).toHaveValue('2026-09-17T00:15')
  await expect(times.nth(1)).toHaveValue('2026-09-17T00:15')
  await expect(chineseTime).toHaveValue('2026-09-17T00:15')
})
