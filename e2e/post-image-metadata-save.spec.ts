import { expect, test, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '5d000000-0000-4000-8000-000000000001'
const POST_ID = '5d000000-0000-4000-8000-000000000101'

const category = {
  id: 'economy',
  content_group: 'news',
  name: '경제',
  sort_order: 10,
  display_id_pattern: '#YYYY-MM-DD-ECO',
  slug_pattern: 'economy-briefing-YYYY-MM-DD',
  wrapper_class: 'daily-brief-note news-briefing economy',
}

const initialPost = {
  id: POST_ID,
  category_id: 'economy',
  display_id: '#2026-07-28-ECO',
  series_no: null,
  briefing_date: '2026-07-28',
  published_on: null,
  title: '원래 제목',
  summary: '원래 요약',
  html_body: null,
  slug: 'economy-briefing-2026-07-28',
  content_status: 'draft',
  wordpress_url: null,
  image_prompt: '원래 프롬프트',
  image_alt: '원래 ALT',
  image_prompt_version: 1,
  image_prompt_updated_at: '2026-07-28T00:00:00Z',
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
}

type StoredPost = Omit<typeof initialPost, 'image_prompt' | 'image_alt'> & {
  image_prompt: string | null
  image_alt: string | null
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
        created_at: '2026-07-28T00:00:00Z',
        updated_at: '2026-07-28T00:00:00Z',
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

async function installBackend(page: Page) {
  let storedPost: StoredPost = { ...initialPost }
  const imagePayloads: Record<string, unknown>[] = []
  const fullSavePayloads: Record<string, unknown>[] = []

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }

    if (url.pathname === '/rest/v1/rpc/update_post_image_metadata') {
      const payload = request.postDataJSON() as Record<string, unknown>
      imagePayloads.push(payload)
      storedPost = {
        ...storedPost,
        image_prompt: payload.p_image_prompt as string | null,
        image_alt: payload.p_image_alt as string | null,
        image_prompt_version: storedPost.image_prompt_version + 1,
        image_prompt_updated_at: '2026-07-28T01:00:00Z',
        updated_at: '2026-07-28T01:00:00Z',
      }
      await fulfillJson(route, {
        id: storedPost.id,
        image_prompt: storedPost.image_prompt,
        image_alt: storedPost.image_alt,
        image_prompt_version: storedPost.image_prompt_version,
        image_prompt_updated_at: storedPost.image_prompt_updated_at,
        updated_at: storedPost.updated_at,
      })
      return
    }

    if (url.pathname === '/rest/v1/rpc/save_post_publication_bundle') {
      const payload = request.postDataJSON() as Record<string, unknown>
      fullSavePayloads.push(payload)
      storedPost = {
        ...storedPost,
        title: payload.p_title as string,
        image_prompt: payload.p_image_prompt as string | null,
        image_alt: payload.p_image_alt as string | null,
        updated_at: '2026-07-28T02:00:00Z',
      }
      await fulfillJson(route, storedPost)
      return
    }

    if (!url.pathname.startsWith('/rest/v1/')) {
      await route.abort('blockedbyclient')
      return
    }

    const table = url.pathname.slice('/rest/v1/'.length)
    const rows = table === 'posts'
      ? [storedPost]
      : table === 'categories'
        ? [category]
        : []
    await fulfillJson(route, rows)
  })

  return {
    imagePayloads,
    fullSavePayloads,
    post: () => storedPost,
  }
}

test('image prompt and ALT save stays separate from full article save', async ({ page }) => {
  await installAuthenticatedSession(page)
  const backend = await installBackend(page)

  await page.goto(`/content/${POST_ID}/edit`)
  await expect(page.getByRole('heading', { level: 1, name: '콘텐츠 수정' })).toBeVisible()

  const title = page.getByLabel('제목', { exact: true })
  await expect(title).toHaveCount(1)
  await expect(title).toBeVisible()
  await expect(title).toBeEditable()
  await title.fill('화면에 남길 새 제목')
  await page.getByLabel('이미지 프롬프트').fill('새 이미지 프롬프트')
  await page.getByLabel('이미지 ALT 문구').fill('새 이미지 ALT')
  await page.getByRole('button', { name: '이미지 프롬프트·ALT만 저장' }).click()

  await expect(page.getByText('이미지 프롬프트와 ALT를 저장했습니다.')).toBeVisible()
  await expect(page.getByText('다른 변경 사항은 저장되지 않은 상태로 유지됩니다.')).toBeVisible()
  await expect(title).toHaveValue('화면에 남길 새 제목')
  await expect(page.getByRole('button', { name: '이미지 프롬프트·ALT만 저장' })).toBeDisabled()

  expect(backend.imagePayloads).toEqual([{
    p_post_id: POST_ID,
    p_image_prompt: '새 이미지 프롬프트',
    p_image_alt: '새 이미지 ALT',
  }])
  expect(backend.post()).toMatchObject({
    title: '원래 제목',
    image_prompt: '새 이미지 프롬프트',
    image_alt: '새 이미지 ALT',
  })

  await page.getByRole('button', { name: '변경 사항 저장' }).click()
  await expect(page.getByText('변경 사항을 저장했습니다.')).toBeVisible()
  expect(backend.fullSavePayloads).toHaveLength(1)
  expect(backend.post().title).toBe('화면에 남길 새 제목')

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
})
