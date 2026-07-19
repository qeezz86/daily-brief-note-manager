import { expect, test, type Page, type Route } from '@playwright/test'
import {
  blockedPlan,
  checkedAt,
  localCategories,
  localTags,
  POST_ID,
  readyPlan,
  sourcePost,
  sourceSeo,
  sourceTags,
  SUPABASE_ORIGIN,
  taxonomyCatalog,
  taxonomyMappings,
  USER_ID,
  warningPlan,
} from './fixtures/wordpress-publication'

type PublicationPlanFixture = typeof readyPlan | typeof blockedPlan | typeof warningPlan

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@example.test',
      email_confirmed_at: '2026-07-18T00:00:00.000Z',
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    }
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: accessToken,
      refresh_token: 'e2e-refresh-token',
      expires_in: 2_000_000_000,
      expires_at: 4_102_444_800,
      token_type: 'bearer',
      user,
    }))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { sessionStorage.setItem('e2e-copied-payload', text) } },
    })
  }, { userId: USER_ID })
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
}

async function installBackend(page: Page, plan: PublicationPlanFixture, options: { holdPreview?: boolean; holdMappingSave?: boolean; holdDraft?: boolean; draftOutcome?: 'success' | 'uncertain' } = {}) {
  const previewGate = deferred()
  const mappingSaveGate = deferred()
  const draftGate = deferred()
  const functionActions: string[] = []
  const restMutations: Array<{ method: string; table: string }> = []
  let mappingRemoved = false
  let wordpressPostCount = 0
  let attemptRows: unknown[] = []

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/functions/v1/wordpress-publication-preview') {
      const body = request.postDataJSON() as { action?: string }
      functionActions.push(body.action ?? 'unknown')
      if (body.action === 'prepare-publication') {
        if (options.holdPreview) await previewGate.promise
        await fulfillJson(route, plan)
        return
      }
      if (body.action === 'get-taxonomy-catalog') {
        await fulfillJson(route, taxonomyCatalog)
        return
      }
      await fulfillJson(route, { schemaVersion: 1, ok: false, error: { code: 'INVALID_ACTION', message: '지원하지 않는 action입니다.', retryable: false } }, 400)
      return
    }
    if (url.pathname === '/functions/v1/wordpress-draft-create') {
      const body = request.postDataJSON() as Record<string, unknown>
      functionActions.push(String(body.action ?? 'unknown'))
      expect(Object.keys(body).sort()).toEqual(['action', 'confirmation', 'contentId', 'expectedPayloadFingerprint', 'expectedSourceUpdatedAt', 'idempotencyKey'])
      expect(body).not.toHaveProperty('payload')
      expect(body).not.toHaveProperty('status')
      if (options.holdDraft) await draftGate.promise
      wordpressPostCount += 1
      const attemptId = '50000000-0000-4000-8000-000000000001'
      if (options.draftOutcome === 'uncertain') {
        attemptRows = [{ id: attemptId, operation: 'create_draft', status: 'uncertain', started_at: checkedAt, completed_at: checkedAt, created_at: checkedAt, wordpress_post_id: null, wordpress_post_status: null, wordpress_post_slug: null, wordpress_post_link: null, error_code: 'WORDPRESS_DRAFT_RESULT_UNCERTAIN', actual_payload_fingerprint: readyPlan.payloadFingerprint }]
        await fulfillJson(route, { schemaVersion: 1, ok: false, error: { code: 'WORDPRESS_DRAFT_RESULT_UNCERTAIN', message: 'WordPress 초안 생성 결과가 불명확합니다.', retryable: false, attemptId } }, 502)
        return
      }
      attemptRows = [{ id: attemptId, operation: 'create_draft', status: 'succeeded', started_at: checkedAt, completed_at: checkedAt, created_at: checkedAt, wordpress_post_id: 901, wordpress_post_status: 'draft', wordpress_post_slug: sourcePost.slug, wordpress_post_link: 'https://wordpress.example.com/?p=901', error_code: null, actual_payload_fingerprint: readyPlan.payloadFingerprint }]
      await fulfillJson(route, { schemaVersion: 1, ok: true, operation: 'create-draft', created: true, idempotentReplay: false, attemptId, source: { contentId: POST_ID, sourceUpdatedAt: sourcePost.updated_at, payloadFingerprint: readyPlan.payloadFingerprint }, wordpress: { postId: 901, status: 'draft', slug: sourcePost.slug, link: 'https://wordpress.example.com/?p=901' } }, 201)
      return
    }
    if (!url.pathname.startsWith('/rest/v1/')) {
      await route.abort('blockedbyclient')
      return
    }

    const table = url.pathname.slice('/rest/v1/'.length)
    if (request.method() !== 'GET' && request.method() !== 'HEAD') {
      restMutations.push({ method: request.method(), table })
    }
    if (table === 'wordpress_taxonomy_mappings' && request.method() === 'POST') {
      if (options.holdMappingSave) await mappingSaveGate.promise
      const input = request.postDataJSON() as Record<string, unknown>
      await fulfillJson(route, {
        id: taxonomyMappings[0].id,
        site_origin: taxonomyCatalog.site.origin,
        mapping_kind: input.mapping_kind,
        local_key: input.local_key,
        wordpress_taxonomy: input.wordpress_taxonomy,
        wordpress_term_id: input.wordpress_term_id,
        wordpress_term_slug: input.wordpress_term_slug,
        wordpress_term_name: input.wordpress_term_name,
        verified_at: input.verified_at,
        created_at: taxonomyMappings[0].created_at,
        updated_at: taxonomyMappings[0].updated_at,
      })
      return
    }
    if (table === 'wordpress_taxonomy_mappings' && request.method() === 'DELETE') {
      mappingRemoved = true
      await route.fulfill({ status: 204, body: '' })
      return
    }

    const rows: unknown[] = table === 'posts' ? [sourcePost]
      : table === 'seo_data' ? [sourceSeo]
        : table === 'categories' ? localCategories
          : table === 'post_tags' ? sourceTags
            : table === 'tags' ? localTags
              : table === 'wordpress_taxonomy_mappings' ? (mappingRemoved ? taxonomyMappings.slice(0, 1) : taxonomyMappings)
                : table === 'wordpress_publication_attempts' ? attemptRows
                : []
    await fulfillJson(route, rows)
  })

  return {
    functionActions,
    restMutations,
    releasePreview: previewGate.resolve,
    releaseMappingSave: mappingSaveGate.resolve,
    releaseDraft: draftGate.resolve,
    wordpressPostCount: () => wordpressPostCount,
  }
}

function captureBrowserErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { consoleErrors, pageErrors }
}

async function expectNoWriteButtons(page: Page) {
  for (const name of ['게시', '발행', 'WordPress 전송', '업로드', '생성 후 게시', '업데이트', '삭제', '미디어']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
}

test('Chromium: ready preview confirms and creates exactly one WordPress draft', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const errors = captureBrowserErrors(page)
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, readyPlan, { holdPreview: true, holdDraft: true })

  await page.goto(`/content/${POST_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: sourcePost.title })).toBeVisible()
  const dryRunLink = page.getByRole('link', { name: 'WordPress Dry Run' })
  await expect(dryRunLink).toBeVisible()
  await dryRunLink.click()
  await expect(page).toHaveURL(`/content/${POST_ID}/wordpress-preview`)

  await page.getByRole('button', { name: 'Dry Run 실행' }).click()
  await expect(page.getByText('WordPress GET-only 검사를 실행하고 있습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dry Run 실행 중' })).toBeDisabled()
  backend.releasePreview()

  await expect(page.getByRole('heading', { name: 'Draft 생성 준비 완료' })).toBeVisible()
  await expect(page.getByText('dry-run', { exact: true })).toBeVisible()
  await expect(page.getByText('아니요', { exact: true })).toBeVisible()
  await expect(page.getByText(readyPlan.payloadFingerprint).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Category mapping' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tag mapping' })).toBeVisible()
  await expect(page.getByText('동일 slug 글이 없습니다.')).toBeVisible()

  const payload = page.locator('.wordpress-payload')
  await expect(payload).toContainText(`"status": "draft"`)
  await expect(payload).toContainText(readyPlan.payload.title)
  await expect(payload).toContainText(readyPlan.payload.slug)
  await expect(payload).toContainText(readyPlan.payload.excerpt)
  await page.getByRole('button', { name: 'Payload 복사' }).click()
  await expect(page.getByText('Payload를 복사했습니다.')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('e2e-copied-payload'))).toBe(JSON.stringify(readyPlan.payload, null, 2))

  await page.getByRole('button', { name: 'WordPress 초안 생성 준비' }).click()
  const dialog = page.getByRole('dialog', { name: 'WordPress 외부 변경 확인' })
  await expect(dialog).toBeVisible()
  const finalButton = dialog.getByRole('button', { name: '초안 1건 생성' })
  await expect(finalButton).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await finalButton.click()
  await expect(dialog.getByRole('button', { name: '초안 생성 요청 중' })).toBeDisabled()
  backend.releaseDraft()
  await expect(page.getByRole('heading', { name: 'WordPress 초안 생성 완료' })).toBeVisible()
  await expect(page.getByText('901', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'WordPress 초안 생성 완료' }).locator('..')).toContainText('draft')
  await expect(page.getByRole('link', { name: 'WordPress에서 초안 확인' })).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByRole('button', { name: 'WordPress 초안 생성 준비' })).toBeDisabled()
  expect(backend.wordpressPostCount()).toBe(1)

  await expectNoWriteButtons(page)
  expect(backend.functionActions).toEqual(['prepare-publication', 'create-draft'])
  expect(backend.restMutations).toEqual([])
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})

test('Chromium: uncertain result blocks retry and requires manual reconciliation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const errors = captureBrowserErrors(page)
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, readyPlan, { draftOutcome: 'uncertain' })
  await page.goto(`/content/${POST_ID}/wordpress-preview`)
  await page.getByRole('button', { name: 'Dry Run 실행' }).click()
  await page.getByRole('button', { name: 'WordPress 초안 생성 준비' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '초안 1건 생성' }).click()
  await expect(page.getByText('다시 생성하지 마세요.')).toBeVisible()
  await expect(page.getByText(/WordPress 관리자에서/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /재시도/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'WordPress 초안 생성 준비' })).toBeDisabled()
  expect(backend.wordpressPostCount()).toBe(1)
  expect(errors.pageErrors).toEqual([])
})

test('Chromium: blocked plan exposes blockers and minimal duplicate metadata with taxonomy navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const errors = captureBrowserErrors(page)
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, blockedPlan)
  await page.goto(`/content/${POST_ID}/wordpress-preview`)
  await page.getByRole('button', { name: 'Dry Run 실행' }).click()

  await expect(page.getByRole('heading', { name: '차단 사유 확인 필요' })).toBeVisible()
  for (const code of ['CATEGORY_MAPPING_MISSING', 'TAG_MAPPING_MISSING', 'WORDPRESS_DUPLICATE_SLUG']) {
    await expect(page.getByText(code, { exact: true })).toBeVisible()
  }
  const duplicateSection = page.locator('section.wordpress-panel').filter({ has: page.getByRole('heading', { name: 'Duplicate slug' }) })
  await expect(duplicateSection).toContainText('#901')
  await expect(duplicateSection).toContainText(sourcePost.slug)
  await expect(duplicateSection).not.toContainText('content')
  await expect(duplicateSection).not.toContainText('excerpt')
  await expectNoWriteButtons(page)

  await page.getByRole('link', { name: 'Taxonomy 매핑 수정' }).click()
  await expect(page).toHaveURL('/settings/wordpress')
  expect(backend.functionActions).toEqual(['prepare-publication'])
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})

test('Chromium: taxonomy catalog supports mapping interaction without WordPress taxonomy writes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium')
  const errors = captureBrowserErrors(page)
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, readyPlan, { holdMappingSave: true })
  await page.goto('/settings/wordpress')
  await page.getByRole('button', { name: 'WordPress taxonomy 새로고침' }).click()

  await expect(page.getByRole('heading', { name: 'Taxonomy 매핑' })).toBeVisible()
  await expect(page.getByText(/category 2개 · tag 3개/)).toBeVisible()
  const economyRow = page.locator('.wordpress-taxonomy__row').filter({ hasText: '경제economy' })
  await expect(economyRow.getByText('stale', { exact: true })).toBeVisible()
  await expect(economyRow.getByRole('option', { name: '경제 (economy)' })).toHaveCount(1)
  await expect(economyRow.getByRole('option', { name: '국제 (global)' })).toHaveCount(1)
  await economyRow.getByLabel('WordPress category').selectOption('2')
  await economyRow.getByRole('button', { name: '매핑 저장' }).click()
  await expect(economyRow.getByRole('button', { name: '매핑 저장' })).toBeDisabled()
  backend.releaseMappingSave()
  await expect(page.getByText('경제 매핑을 저장했습니다. WordPress에는 아무 것도 쓰지 않았습니다.')).toBeVisible()

  await page.getByLabel('로컬 태그 검색').fill('워드프레스')
  const tagRow = page.locator('.wordpress-taxonomy__row').filter({ hasText: '워드프레스 연동' })
  await expect(tagRow).toBeVisible()
  await expect(page.locator('.wordpress-taxonomy__row > div:first-child > strong', { hasText: 'AI 도구' })).toHaveCount(0)
  let confirmation = ''
  page.once('dialog', async (dialog) => { confirmation = dialog.message(); await dialog.accept() })
  await tagRow.getByRole('button', { name: '매핑 제거' }).click()
  await expect(page.getByText('워드프레스 연동 매핑을 제거했습니다.')).toBeVisible()
  expect(confirmation).toContain('매핑을 제거하시겠습니까?')

  await expectNoWriteButtons(page)
  await expect(page.getByRole('button', { name: /taxonomy.*생성|카테고리 생성|태그 생성/i })).toHaveCount(0)
  expect(backend.functionActions).toEqual(['get-taxonomy-catalog'])
  expect(backend.restMutations).toEqual([
    { method: 'POST', table: 'wordpress_taxonomy_mappings' },
    { method: 'DELETE', table: 'wordpress_taxonomy_mappings' },
  ])
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})

test('iPhone: warning preview remains readable, scroll-safe, and touch-copyable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone')
  const errors = captureBrowserErrors(page)
  await installAuthenticatedSession(page)
  const backend = await installBackend(page, warningPlan)
  await page.goto(`/content/${POST_ID}/wordpress-preview`)
  await page.getByRole('button', { name: 'Dry Run 실행' }).click()

  await expect(page.getByRole('heading', { name: 'Draft 생성 준비 완료' })).toBeVisible()
  await expect(page.getByText('SEO_TAG_POSSIBLE_NEAR_DUPLICATE', { exact: true })).toBeVisible()
  await expect(page.getByText(/원문 태그.*워드프레스 연동.*워드프레스 연동법/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Category mapping' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tag mapping' })).toBeVisible()
  await expect(page.locator('.wordpress-payload')).toBeVisible()
  await expect(page.getByText(warningPlan.payloadFingerprint).first()).toBeVisible()

  const copyButton = page.getByRole('button', { name: 'Payload 복사' })
  const copyBox = await copyButton.boundingBox()
  expect(copyBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  await copyButton.click()
  await expect(page.getByText('Payload를 복사했습니다.')).toBeVisible()
  await page.getByRole('button', { name: 'WordPress 초안 생성 준비' }).click()
  const confirmation = page.getByRole('dialog', { name: 'WordPress 외부 변경 확인' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '초안 1건 생성' })).toBeDisabled()
  const confirmationButtonBox = await confirmation.getByRole('button', { name: '초안 1건 생성' }).boundingBox()
  expect(confirmationButtonBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  await confirmation.getByRole('button', { name: '취소' }).click()
  await expectNoWriteButtons(page)

  const layout = await page.evaluate(() => {
    const header = document.querySelector('header')?.getBoundingClientRect()
    const main = document.querySelector('main')?.getBoundingClientRect()
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      headerBottom: header?.bottom ?? 0,
      mainTop: main?.top ?? 0,
    }
  })
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.mainTop).toBeGreaterThanOrEqual(layout.headerBottom - 1)
  expect(backend.functionActions).toEqual(['prepare-publication'])
  expect(backend.restMutations).toEqual([])
  expect(errors.consoleErrors).toEqual([])
  expect(errors.pageErrors).toEqual([])
})
