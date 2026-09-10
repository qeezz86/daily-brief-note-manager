import { expect, test, type Page } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '5d000000-0000-4000-8000-000000000001'
const POST_ID = '5d000000-0000-4000-8000-000000000101'
const title = '영구 삭제 전용 격리 콘텐츠'

interface Options {
  archived?: boolean
  importHistory?: boolean
  wordpressHistory?: boolean
  checkFailed?: boolean
  checking?: boolean
  deleteFailed?: boolean
  holdDelete?: boolean
}

// All data responses and DELETEs are intercepted. No existing content is used.
// This spec uses the repository's existing chromium and iphone projects.
async function setup(page: Page, baseURL: string | undefined, options: Options = {}) {
  if (!baseURL) throw new Error('Content-delete E2E requires the configured application baseURL')
  const appOrigin = new URL(baseURL).origin
  await page.addInitScript(({ userId }) => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test',
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
      created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z' }
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`,
      refresh_token: 'e2e-refresh-token', token_type: 'bearer', expires_in: 2_000_000_000, expires_at: 4102444800, user,
    }))
  }, { userId: USER_ID })
  let deleted = false
  let deleteCount = 0
  const forbiddenWrites: string[] = []
  let releaseCheck!: () => void
  let releaseDelete!: () => void
  const checkGate = new Promise<void>((resolve) => { releaseCheck = resolve })
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve })
  const post = {
    id: POST_ID, owner_id: USER_ID, category_id: 'ai-column', display_id: 'AI-901', series_no: 901,
    briefing_date: null, published_on: null, title, summary: '격리된 테스트 요약', html_body: null,
    slug: 'isolated-content-delete', content_status: options.archived ? 'archived' : 'draft',
    wordpress_url: 'https://wordpress.example.test/retained-remote-post',
    image_prompt: null, image_alt: null, image_prompt_version: 1, image_prompt_updated_at: null,
    created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z',
  }
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
    const isWordPressPosts = /\/wp-json\/wp\/v2\/posts(?:\/|$)/u.test(url.pathname)
      || /^\/wp\/v2\/posts(?:\/|$)/u.test(url.searchParams.get('rest_route') ?? '')
    const isDraftFunction = /^\/functions\/v1\/wordpress-draft-create(?:\/|$)/u.test(url.pathname)
    // Check destination semantics before allowing even the application's own origin.
    if (isWrite && (isWordPressPosts || isDraftFunction)) {
      forbiddenWrites.push(request.url())
      await route.abort('blockedbyclient')
      return
    }
    if (url.origin === appOrigin) {
      await route.continue()
      return
    }
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.origin !== SUPABASE_ORIGIN) {
      if (request.method() !== 'GET') forbiddenWrites.push(request.url())
      await route.abort('blockedbyclient')
      return
    }
    if (url.pathname.startsWith('/auth/v1/') && request.method() === 'GET') {
      await json({ user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (request.method() === 'DELETE' && url.pathname === '/rest/v1/posts') {
      deleteCount += 1
      expect(url.searchParams.get('id')).toBe(`eq.${POST_ID}`)
      expect(url.searchParams.get('owner_id')).toBe(`eq.${USER_ID}`)
      if (options.holdDelete) await deleteGate
      if (options.deleteFailed) {
        await json({ code: '23503', message: 'wordpress_publication_attempts_post_owner_fkey' }, 409)
      } else {
        deleted = true
        await json([{ id: POST_ID }])
      }
      return
    }
    if (request.method() !== 'GET' || !url.pathname.startsWith('/rest/v1/')) {
      forbiddenWrites.push(request.url())
      await route.abort('blockedbyclient')
      return
    }
    const table = url.pathname.slice('/rest/v1/'.length)
    if (table === 'import_job_items' || table === 'wordpress_publication_attempts') {
      if (options.checking && url.searchParams.has('limit')) await checkGate
      if (options.checkFailed && url.searchParams.has('limit')) {
        await json({ code: '42501', message: 'eligibility unavailable' }, 403)
        return
      }
      await json((table === 'import_job_items' ? options.importHistory : options.wordpressHistory)
        ? [{ id: '5d000000-0000-4000-8000-000000000201', operation: 'create_draft', status: 'failed_safe' }] : [])
      return
    }
    await json(table === 'posts' ? deleted ? [] : [post] : table === 'categories' ? [{
      id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', sort_order: 10,
      display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column',
    }] : [])
  })
  await page.goto(`/content/${POST_ID}`)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return { get deleteCount() { return deleteCount }, forbiddenWrites, releaseCheck, releaseDelete }
}

for (const [name, options, message] of [
  ['Import', { importHistory: true }, 'Import 이력 보존'],
  ['WordPress', { wordpressHistory: true }, 'WordPress 발행 시도 이력 보존'],
  ['multiple', { importHistory: true, wordpressHistory: true }, 'Import 이력과 WordPress 발행 시도 이력 보존'],
  ['check failure', { checkFailed: true }, '삭제 가능 여부를 확인하지 못했습니다.'],
] as const) {
  test(`protected deletion: ${name}`, async ({ page, baseURL }) => {
    const backend = await setup(page, baseURL, options)
    await expect(page.getByText(message, { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeDisabled()
    expect(backend.deleteCount).toBe(0)
    expect(backend.forbiddenWrites).toEqual([])
  })
}

test('checking remains disabled until both reads finish; cancel has no effect', async ({ page, baseURL }) => {
  const backend = await setup(page, baseURL, { checking: true })
  await expect(page.getByText('삭제 가능 여부를 확인하고 있습니다.')).toBeVisible()
  const button = page.getByRole('button', { name: '삭제', exact: true })
  await expect(button).toBeDisabled()
  backend.releaseCheck()
  await expect(button).toBeEnabled()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(title)
    expect(dialog.message()).toContain('WordPress에 생성된 게시물은 삭제되지 않습니다.')
    await dialog.dismiss()
  })
  await button.click()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`))
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  expect(backend.deleteCount).toBe(0)
  expect(backend.forbiddenWrites).toEqual([])
})

for (const archived of [false, true]) {
  test(`eligible deletion, list feedback and deleted-route not-found (archived=${archived})`, async ({ page, baseURL }) => {
    const backend = await setup(page, baseURL, { archived })
    const button = page.getByRole('button', { name: '삭제', exact: true })
    await expect(button).toBeEnabled()
    page.once('dialog', (dialog) => dialog.accept())
    await button.click()
    await expect(page).toHaveURL(/\/content$/u)
    await expect(page.getByText('콘텐츠를 삭제했습니다.')).toBeVisible()
    expect(backend.deleteCount).toBe(1)
    await page.goto(`/content/${POST_ID}`)
    await expect(page.getByRole('heading', { name: '콘텐츠를 찾을 수 없습니다' })).toBeVisible()
    expect(backend.forbiddenWrites).toEqual([])
  })
}

test('FK failure keeps content visible and does not retry', async ({ page, baseURL }) => {
  const backend = await setup(page, baseURL, { deleteFailed: true })
  const button = page.getByRole('button', { name: '삭제', exact: true })
  await expect(button).toBeEnabled()
  page.once('dialog', (dialog) => dialog.accept())
  await button.click()
  await expect(page.getByRole('alert')).toContainText('이력 보존')
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/content/${POST_ID}$`))
  await expect(button).toBeEnabled()
  expect(backend.deleteCount).toBe(1)
  expect(backend.forbiddenWrites).toEqual([])
})

test('rapid repeated interaction produces one local DELETE and no WordPress writes', async ({ page, baseURL }) => {
  const backend = await setup(page, baseURL, { holdDelete: true })
  const button = page.getByRole('button', { name: '삭제', exact: true })
  await expect(button).toBeEnabled()
  let confirmations = 0
  page.on('dialog', async (dialog) => { confirmations += 1; await dialog.accept() })
  await button.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('Expected delete button')
    element.click(); element.click()
  })
  await expect(page.getByRole('button', { name: '삭제 중' })).toBeDisabled()
  await expect.poll(() => backend.deleteCount).toBe(1)
  expect(confirmations).toBe(1)
  backend.releaseDelete()
  await expect(page).toHaveURL(/\/content$/u)
  expect(backend.deleteCount).toBe(1)
  expect(backend.forbiddenWrites).toEqual([])
})
