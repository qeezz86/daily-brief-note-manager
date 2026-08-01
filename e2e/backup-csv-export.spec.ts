import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page, type Route } from '@playwright/test'

const SUPABASE_ORIGIN = 'https://e2e.supabase.co'
const USER_ID = '5f000000-0000-4000-8000-000000000001'
const POST_ID = '5f000000-0000-4000-8000-000000000101'
const TOPIC_ID = '5f000000-0000-4000-8000-000000000102'
const UPDATE_ID = '5f000000-0000-4000-8000-000000000103'
const SOURCE_ID = '5f000000-0000-4000-8000-000000000104'
const FOLLOWUP_ID = '5f000000-0000-4000-8000-000000000105'
const CREATED_AT = '2026-07-15T00:00:00Z'

const populatedData = {
  posts: [{
    id: POST_ID, categoryId: 'economy', seriesNo: null, briefingDate: '2026-07-15', publishedOn: '2026-07-15',
    displayId: '#2026-07-15-ECO', title: '=SUM(A1:A2)', summary: '경제, "뉴스"',
    htmlBody: '<div class="daily-brief-note news-briefing economy"><h1>안전한 fixture</h1></div>',
    slug: 'economy-briefing-2026-07-15', wordpressUrl: 'https://example.test/economy-briefing-2026-07-15',
    contentStatus: 'published', publishedAt: CREATED_AT, sourceImportType: 'manual_entry',
    imagePrompt: '경제 뉴스 삽화', imageAlt: '경제 뉴스', imagePromptVersion: 1,
    imagePromptUpdatedAt: CREATED_AT, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  }],
  seoData: [{ postId: POST_ID, representativeTitle: '대표 제목', alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'], metaDescription: '메타 설명', focusKeyword: '경제', createdAt: CREATED_AT, updatedAt: CREATED_AT }],
  tags: [{ id: '5f000000-0000-4000-8000-000000000106', name: '경제', normalizedName: '경제', createdAt: CREATED_AT }],
  postTags: [{ postId: POST_ID, tagId: '5f000000-0000-4000-8000-000000000106' }],
  sources: [{ id: SOURCE_ID, postId: POST_ID, newsUpdateId: UPDATE_ID, sourceName: '기관', sourceTitle: '원문', sourceUrl: 'https://source.example.test/article', sourcePublishedAt: CREATED_AT, checkedAt: CREATED_AT, checkedPoint: '핵심 사실', sortOrder: 0, createdAt: CREATED_AT, updatedAt: CREATED_AT }],
  aiMetadata: [],
  infoDbMetadata: [],
  chineseMetadata: [],
  seriesCounters: [{ categoryId: 'economy', lastIssuedNo: 0, updatedAt: CREATED_AT }],
  newsTopics: [{ id: TOPIC_ID, categoryId: 'economy', topicKey: 'rates', canonicalTitle: '금리', topicSummary: '금리 동향', status: 'active', closedReason: null, firstSeenAt: '2026-07-15', lastSeenAt: '2026-07-15', createdAt: CREATED_AT, updatedAt: CREATED_AT }],
  newsStatusHistory: [{ id: '5f000000-0000-4000-8000-000000000107', topicId: TOPIC_ID, fromStatus: null, toStatus: 'active', reason: null, changedAt: CREATED_AT }],
  newsUpdates: [{ id: UPDATE_ID, postId: POST_ID, topicId: TOPIC_ID, itemOrder: 1, updateType: 'new', headline: '새 소식', factSummary: '사실', importanceSummary: null, impactSummary: null, changeSummary: null, previousUpdateId: null, createdAt: CREATED_AT, updatedAt: CREATED_AT }],
  newsFollowups: [{ id: FOLLOWUP_ID, topicId: TOPIC_ID, checkText: '다음 발표 확인', status: 'pending', dueDate: null, priority: 'normal', resolutionNote: null, resolvedAt: null, createdAt: CREATED_AT, updatedAt: CREATED_AT }],
  generatedPrompts: [{ id: '5f000000-0000-4000-8000-000000000108', categoryId: 'economy', requestedPostCount: 5, actualPostCount: 1, promptMode: 'standard', referenceDate: '2026-07-15', closedLookbackDays: 90, contextSchemaVersion: 1, contextSnapshot: { schemaVersion: 1 }, promptText: '안전한 fixture prompt', isPinned: false, generatedAt: CREATED_AT }],
  wordpressTaxonomyMappings: [],
}

function snapshot(data = populatedData) {
  const sectionCounts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]))
  return {
    profile: 'core', snapshotSchemaVersion: 1,
    categoryManifest: [{ id: 'economy', contentGroup: 'news', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD', sortOrder: 10, enabled: true }],
    sectionCounts,
    totalRecords: Object.values(sectionCounts).reduce((sum, count) => sum + count, 0),
    includesOperationalHistory: false,
    relationshipCheck: 'passed',
    data,
  }
}

function emptySnapshot() {
  return snapshot({
    posts: [], seoData: [], tags: [], postTags: [], sources: [], aiMetadata: [],
    infoDbMetadata: [], chineseMetadata: [], seriesCounters: [], newsTopics: [],
    newsStatusHistory: [], newsUpdates: [], newsFollowups: [], generatedPrompts: [],
    wordpressTaxonomyMappings: [],
  })
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(({ userId, createdAt }) => {
    const base64url = (value: unknown) => btoa(JSON.stringify(value))
      .replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
      sub: userId, role: 'authenticated', exp: 4102444800,
    })}.e2e-signature`
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: accessToken, refresh_token: 'e2e-refresh-token', expires_in: 2_000_000_000,
      expires_at: 4_102_444_800, token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: createdAt, updated_at: createdAt },
    }))
  }, { userId: USER_ID, createdAt: CREATED_AT })
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
}

async function installBackupBackend(page: Page, backupSnapshot: unknown) {
  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/auth/v1/')) {
      await fulfillJson(route, { user: { id: USER_ID, email: 'admin@example.test' } })
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_user_backup_estimate') {
      await fulfillJson(route, { profile: 'core', sectionCounts: {}, totalRecords: 0, categoryManifestCount: 1, includesOperationalHistory: false, includesNormalizedPayload: false })
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_user_backup_snapshot') {
      await fulfillJson(route, backupSnapshot)
      return
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      await fulfillJson(route, [])
      return
    }
    await route.abort('blockedbyclient')
  })
}

async function openVerifiedBackup(page: Page, backupSnapshot: unknown = snapshot()) {
  await installAuthenticatedSession(page)
  await installBackupBackend(page, backupSnapshot)
  await page.goto('/backups')
  await page.getByRole('button', { name: '백업 생성' }).click()
  await expect(page.getByRole('heading', { name: '백업 manifest' })).toBeVisible()
}

async function readDownload(download: Download): Promise<Buffer> {
  const path = await download.path()
  if (!path) throw new Error('Playwright download path를 확인할 수 없습니다.')
  return readFile(path)
}

test('populated verified snapshot exposes four CSV downloads', async ({ page }) => {
  await openVerifiedBackup(page)
  await expect(page.getByRole('button', { name: /^(posts|news topics|follow-ups|sources) CSV 다운로드$/u })).toHaveCount(4)
})

test('each dataset download uses its exact filename identifier', async ({ page }) => {
  await openVerifiedBackup(page)
  const controls = [
    ['posts CSV 다운로드', /^daily-brief-note-posts-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u],
    ['news topics CSV 다운로드', /^daily-brief-note-news-topics-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u],
    ['follow-ups CSV 다운로드', /^daily-brief-note-follow-ups-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u],
    ['sources CSV 다운로드', /^daily-brief-note-sources-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u],
  ] as const
  for (const [name, pattern] of controls) {
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name }).click()
    expect((await downloadPromise).suggestedFilename()).toMatch(pattern)
  }
})

test('posts CSV contains BOM, stable header, escaping and formula protection', async ({ page }) => {
  await openVerifiedBackup(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'posts CSV 다운로드' }).click()
  const bytes = await readDownload(await downloadPromise)
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const csv = bytes.toString('utf8')
  expect(csv).toContain('id,categoryId,seriesNo,briefingDate,publishedOn,displayId,title,summary,htmlBody')
  expect(csv).toContain("'=SUM(A1:A2)")
  expect(csv).toContain('"경제, ""뉴스"""')
  expect(csv.endsWith('\r\n')).toBe(true)
})

test('empty dataset download contains only BOM and header', async ({ page }) => {
  await openVerifiedBackup(page, emptySnapshot())
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'sources CSV 다운로드' }).click()
  const csv = (await readDownload(await downloadPromise)).toString('utf8')
  expect(csv).toBe('\uFEFFid,postId,newsUpdateId,sourceName,sourceTitle,sourceUrl,sourcePublishedAt,checkedAt,checkedPoint,sortOrder,createdAt,updatedAt\r\n')
})

test('invalid snapshot prevents every CSV download', async ({ page }) => {
  await installAuthenticatedSession(page)
  await installBackupBackend(page, { invalid: true })
  await page.goto('/backups')
  await page.getByRole('button', { name: '백업 생성' }).click()
  await expect(page.getByRole('alert')).toContainText('무결성 검증에 실패했습니다.')
  await expect(page.getByRole('button', { name: /CSV 다운로드$/u })).toHaveCount(0)
})

test('desktop and iPhone layouts keep CSV controls usable without horizontal overflow', async ({ page }, testInfo) => {
  await openVerifiedBackup(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  const sources = page.getByRole('button', { name: 'sources CSV 다운로드' })
  await expect(sources).toBeVisible()
  await expect(sources).toBeEnabled()
  expect(['chromium', 'iphone']).toContain(testInfo.project.name)
})
