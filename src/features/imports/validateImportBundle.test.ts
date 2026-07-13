import { describe, expect, it } from 'vitest'
import { emptyImportReferenceData, importCategories, validImportBundle, validNewsPost } from './imports.fixtures'
import type { ImportPost } from './importValidation.types'
import { validateImportBundle } from './validateImportBundle'

function validate(input: unknown = validImportBundle()) {
  return validateImportBundle(input, emptyImportReferenceData)
}
function codes(input: unknown) {
  const result = validate(input)
  return [...result.bundleIssues, ...result.items.flatMap((item) => item.issues)].map((issue) => issue.code)
}
function withPost(changes: Partial<ImportPost>) {
  return validImportBundle([validNewsPost(changes)])
}

describe('validateImportBundle bundle 검증', () => {
  it('올바른 format의 정상 bundle을 검증한다', () => { const result = validate(); expect(result.status).toBe('valid'); expect(result.summary.ready).toBe(1) })
  it.each([
    [null, 'BUNDLE_NOT_OBJECT'],
    [[], 'BUNDLE_NOT_OBJECT'],
    [{ schemaVersion: 1, posts: [] }, 'MISSING_IMPORT_FORMAT'],
    [{ format: 'other-import', schemaVersion: 1, posts: [] }, 'UNSUPPORTED_IMPORT_FORMAT'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 2, posts: [] }, 'UNSUPPORTED_SCHEMA_VERSION'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 1 }, 'BUNDLE_POSTS_REQUIRED'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 1, posts: [] }, 'BUNDLE_POSTS_EMPTY'],
    [{ schemaVersion: 1, data: { posts: [] } }, 'BACKUP_BUNDLE_NOT_SUPPORTED'],
    [{ format: 'daily-brief-note-backup', schemaVersion: 1, data: { posts: [] } }, 'BACKUP_BUNDLE_NOT_SUPPORTED'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 1, posts: [], extra: true }, 'BUNDLE_UNKNOWN_FIELD'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 1, exportedAt: 'no', posts: [] }, 'BUNDLE_EXPORTED_AT_INVALID'],
    [{ format: 'daily-brief-note-content-import', schemaVersion: 1, validationMode: 'loose', posts: [] }, 'BUNDLE_VALIDATION_MODE_INVALID'],
  ])('bundle 오류를 판정한다 %#', (input, code) => expect(codes(input)).toContain(code))
})

describe('공통 게시물 검증', () => {
  it.each([
    [{ title: '' }, 'POST_TITLE_REQUIRED'],
    [{ summary: '' }, 'POST_SUMMARY_REQUIRED'],
    [{ categoryId: '' }, 'POST_CATEGORY_REQUIRED'],
    [{ categoryId: 'missing' }, 'POST_CATEGORY_UNKNOWN'],
    [{ categoryId: 'disabled-news', slug: 'disabled-2026-07-12', displayId: '#2026-07-12-OFF' }, 'POST_CATEGORY_INACTIVE'],
    [{ slug: 'Bad Slug' }, 'POST_SLUG_INVALID'],
    [{ publishedOn: '2026-02-30' }, 'POST_DATE_INVALID'],
    [{ publishedAt: 'invalid' }, 'POST_DATETIME_INVALID'],
    [{ wordpressUrl: 'javascript:alert(1)' }, 'POST_WORDPRESS_URL_INVALID'],
    [{ publishedOn: null }, 'POST_PUBLISHED_ON_REQUIRED'],
    [{ briefingDate: null }, 'NEWS_BRIEFING_DATE_REQUIRED'],
    [{ seriesNo: 1 }, 'NEWS_SERIES_NOT_ALLOWED'],
    [{ displayId: '#BAD' }, 'NEWS_DISPLAY_ID_INVALID'],
    [{ slug: 'economy-other' }, 'POST_SLUG_PATTERN_MISMATCH'],
    [{ newsTracking: { topicKey: 'BAD KEY', updates: [{}] } }, 'NEWS_TOPIC_KEY_INVALID'],
    [{ newsTracking: { topicKey: 'economy-core', updates: [] } }, 'NEWS_UPDATES_REQUIRED'],
  ])('필드 오류를 판정한다 %#', (changes, code) => expect(codes(withPost(changes as Partial<ImportPost>))).toContain(code))
  it('draft는 빈 HTML과 SEO를 허용한다', () => {
    const post = validNewsPost({ status: 'draft', htmlBody: null, seo: undefined, image: undefined, tags: [], sources: [], newsTracking: null })
    expect(validate(validImportBundle([post])).items[0].issues.some((issue) => issue.code === 'HTML_REQUIRED')).toBe(false)
  })
})

describe('HTML 검증 재사용', () => {
  const cases: Array<[string, string]> = [
    ['<div class="daily-brief-note news-briefing economy"><p>x</p></div>', 'HTML_H1_MISSING'],
    ['<h1>x</h1>', 'HTML_WRAPPER_MISSING'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1><script>x</script></div>', 'HTML_SCRIPT_FORBIDDEN'],
    ['<div class="daily-brief-note news-briefing economy" style="x"><h1>x</h1></div>', 'HTML_INLINE_STYLE'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1><a href="jav&#x61;script:alert(1)">x</a></div>', 'HTML_JAVASCRIPT_URL'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1><template><script>x</script></template></div>', 'HTML_SCRIPT_FORBIDDEN'],
    ['<div class="daily-brief-note news-briefing economy"><h1 id="x">x</h1><p id="x">y</p></div>', 'HTML_DUPLICATE_ID'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1>\n## markdown\n</div>', 'HTML_MARKDOWN_MIXED'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1>', 'HTML_WRAPPER_NOT_CLOSED'],
    ['<div class="daily-brief-note news-briefing economy"><h1>x</h1><iframe></iframe></div>', 'HTML_IFRAME_FORBIDDEN'],
    ['<div class="daily-brief-note news-briefing economy"><h1 onclick="x">x</h1></div>', 'HTML_EVENT_HANDLER'],
    ['<div class="daily-brief-note news-briefing economy"><h1 class="new-class">x</h1></div>', 'HTML_UNKNOWN_CLASS'],
  ]
  it.each(cases)('위험·구조 HTML을 차단한다 %#', (htmlBody, code) => expect(codes(withPost({ htmlBody }))).toContain(code))
  it('legacy mode에서도 보안 오류는 error다', () => {
    const bundle = { ...withPost({ htmlBody: '<div class="daily-brief-note news-briefing economy"><h1>x</h1><script>x</script></div>' }), validationMode: 'legacy' as const }
    expect(validate(bundle).items[0].issues.find((issue) => issue.code === 'HTML_SCRIPT_FORBIDDEN')?.severity).toBe('error')
  })
  it('legacy mode의 미등록 class는 warning이다', () => {
    const bundle = { ...withPost({ htmlBody: '<div class="daily-brief-note news-briefing economy"><h1 class="old">x</h1></div>' }), validationMode: 'legacy' as const }
    expect(validate(bundle).items[0].issues.find((issue) => issue.code === 'HTML_UNKNOWN_CLASS')?.severity).toBe('warning')
  })
})

describe('SEO, 태그, 출처 검증', () => {
  it.each([
    [{ tags: ['a', 'b', 'c', 'd'] }, 'FORM_VALIDATION_ERROR'],
    [{ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }, 'FORM_VALIDATION_ERROR'],
    [{ tags: ['경제', 'a', 'b', 'c', 'd'] }, 'FORM_VALIDATION_ERROR'],
    [{ tags: ['Daily Brief Note', 'a', 'b', 'c', 'd'] }, 'FORM_VALIDATION_ERROR'],
    [{ tags: ['금리', ' 금리 ', 'a', 'b', 'c'] }, 'DUPLICATE_TAG'],
    [{ sources: [] }, 'SOURCE_REQUIRED'],
    [{ sources: [{ sourceName: '', sourceTitle: '', sourceUrl: 'bad', sourcePublishedAt: null, checkedPoint: '' }] }, 'SOURCE_FIELDS_REQUIRED'],
    [{ sources: [{ sourceName: 'x', sourceTitle: 'x', sourceUrl: 'bad', sourcePublishedAt: null, checkedPoint: 'x' }] }, 'SOURCE_URL_INVALID'],
  ])('SEO·태그·출처 오류를 판정한다 %#', (changes, code) => expect(codes(withPost(changes as Partial<ImportPost>))).toContain(code))
  it('메타 설명 길이는 warning이다', () => expect(codes(withPost({ seo: { ...validNewsPost().seo!, metaDescription: '짧음' } }))).toContain('SEO_META_DESCRIPTION_LENGTH'))
  it('홈페이지 URL은 warning이다', () => expect(codes(withPost({ sources: [{ sourceName: 'x', sourceTitle: 'x', sourceUrl: 'https://example.com/', sourcePublishedAt: null, checkedPoint: 'x' }] }))).toContain('SOURCE_URL_POSSIBLY_LISTING'))
  it('HTML 출처 불일치를 차단한다', () => expect(codes(withPost({ sources: [{ sourceName: 'x', sourceTitle: 'x', sourceUrl: 'https://other.test/article', sourcePublishedAt: null, checkedPoint: 'x' }] }))).toContain('HTML_SOURCE_MISMATCH'))
})

describe('카테고리 metadata', () => {
  it('AI 정상 metadata를 검증한다', () => {
    const post = validNewsPost({ categoryId: 'ai-column', seriesNo: 1, briefingDate: null, displayId: 'AI-001', slug: 'ai-001', status: 'draft', htmlBody: null, newsTracking: null, metadata: { fieldName: '생성형 AI', difficulty: 'beginner', estimatedReadMin: 10 } })
    expect(validate(validImportBundle([post])).items[0].status).toBe('ready')
  })
  it.each([
    [{ fieldName: 'AI', difficulty: 'wrong', estimatedReadMin: 10 }, 'METADATA_DIFFICULTY_INVALID'],
    [{ fieldName: 'AI', difficulty: 'beginner', estimatedReadMin: 0 }, 'METADATA_READ_MIN_INVALID'],
    [{ fieldName: 'AI', difficulty: 'beginner', estimatedReadMin: 601 }, 'METADATA_READ_MIN_INVALID'],
  ])('AI metadata 오류를 판정한다 %#', (metadata, code) => {
    const post = validNewsPost({ categoryId: 'ai-column', seriesNo: 1, briefingDate: null, displayId: 'AI-001', slug: 'ai-001', newsTracking: null, htmlBody: '<div class="daily-brief-note ai-column"><h1>AI</h1></div>', metadata })
    expect(codes(validImportBundle([post]))).toContain(code)
  })
  it('정보DB 기준일 누락은 warning이다', () => {
    const post = validNewsPost({ categoryId: 'info-db', seriesNo: 1, briefingDate: null, displayId: '정보DB-001', slug: 'info-db-001', newsTracking: null, htmlBody: '<div class="daily-brief-note info-db"><h1>정보</h1></div>', metadata: { fieldName: '과학', difficulty: 'beginner', estimatedReadMin: 10 } })
    expect(codes(validImportBundle([post]))).toContain('INFO_REFERENCE_DATE_EMPTY')
  })
  it.each(['programName', 'originalUrl', 'verifiedCoreFact'])('중국어 %s 누락을 차단한다', (field) => {
    const metadata = { learningTopic: '경제', programName: 'CCTV', originalTitle: '제목', originalUrl: 'https://news.cctv.com/a', originalPublishedAt: '2026-07-12T00:00:00+08:00', episodeListIncluded: false, verifiedCoreFact: '확인' }
    delete metadata[field as keyof typeof metadata]
    const post = validNewsPost({ categoryId: 'chinese-study', seriesNo: 1, briefingDate: null, displayId: null, slug: 'cctv-chinese-news-study-001', newsTracking: null, htmlBody: '<div class="daily-brief-note chinese-study"><h1>중국어</h1></div>', metadata, sources: [{ sourceName: 'CCTV', sourceTitle: '제목', sourceUrl: 'https://news.cctv.com/a', sourcePublishedAt: '2026-07-12T00:00:00+08:00', checkedPoint: '확인' }] })
    expect(validate(validImportBundle([post])).items[0].status).toBe('invalid')
  })
  it('중국어 display ID를 차단한다', () => {
    const post = validNewsPost({ categoryId: 'chinese-study', seriesNo: 1, briefingDate: null, displayId: 'BAD', slug: 'cctv-chinese-news-study-001', status: 'draft', newsTracking: null })
    expect(codes(validImportBundle([post]))).toContain('CHINESE_DISPLAY_ID_NOT_ALLOWED')
  })
})

describe('결정적 중복', () => {
  it.each([
    ['externalKey', 'DUPLICATE_EXTERNAL_KEY'],
    ['slug', 'DUPLICATE_SLUG'],
    ['displayId', 'DUPLICATE_DISPLAY_ID'],
    ['briefingDate', 'DUPLICATE_NEWS_DATE'],
  ])('%s 내부 중복을 찾는다', (_field, code) => {
    const first = validNewsPost()
    const second = validNewsPost({ title: '다른 제목' })
    expect(codes(validImportBundle([first, second]))).toContain(code)
  })
  it('제목+날짜 exact 중복은 warning이다', () => expect(codes(validImportBundle([validNewsPost(), validNewsPost({ slug: 'other', externalKey: 'other', displayId: '#OTHER', briefingDate: '2026-07-13', publishedOn: '2026-07-12' })]))).toContain('POSSIBLE_DUPLICATE_TITLE_DATE'))
  it('DB slug 중복을 duplicate로 판정한다', () => {
    const reference = { ...emptyImportReferenceData, posts: [{ categoryId: 'economy', title: '기존', slug: 'economy-briefing-2026-07-12', displayId: null, seriesNo: null, briefingDate: null, publishedOn: '2026-07-12', wordpressUrl: null }] }
    const result = validateImportBundle(validImportBundle(), reference)
    expect(result.items[0].status).toBe('duplicate'); expect(result.items[0].issues.some((issue) => issue.existingRecordSummary)).toBe(true)
  })
  it('DB 조회 실패는 warning이며 구조 검증은 계속한다', () => {
    const result = validateImportBundle(validImportBundle(), emptyImportReferenceData, 'unavailable')
    expect(result.items[0].status).toBe('warning'); expect(codesFrom(result)).toContain('DB_DUPLICATE_CHECK_UNAVAILABLE')
  })
  it('DB 일부 조회 실패는 warning이며 확인된 중복 결과를 유지한다', () => {
    const reference = { ...emptyImportReferenceData, posts: [{ categoryId: 'economy', title: '기존', slug: 'economy-briefing-2026-07-12', displayId: null, seriesNo: null, briefingDate: null, publishedOn: '2026-07-12', wordpressUrl: null }] }
    const result = validateImportBundle(validImportBundle(), reference, 'partial')
    expect(result.databaseCheck).toBe('partial')
    expect(result.items[0].status).toBe('duplicate')
    expect(codesFrom(result)).toContain('DB_DUPLICATE_CHECK_PARTIAL')
  })
  it('동일 입력은 동일 결과를 만든다', () => expect(validate()).toEqual(validate()))
})

function codesFrom(result: ReturnType<typeof validateImportBundle>) {
  return result.items.flatMap((item) => item.issues.map((issue) => issue.code))
}

it('fixture 카테고리가 준비되어 있다', () => expect(importCategories.length).toBeGreaterThan(4))
