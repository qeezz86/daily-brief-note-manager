import { describe, expect, it } from 'vitest'
import type { ImportCategory } from './importValidation.types'
import type { NewsResponseCandidate } from './newsResponseImport.types'
import { extractNewsResponseSources, validateNewsResponse } from './validateNewsResponse'

const category: ImportCategory = { id: 'economy', contentGroup: 'news', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD', enabled: true }
const html = '<div class="daily-brief-note news-briefing economy"><h1>경제 흐름 대표 제목</h1><section id="sources"><p data-source-name="한국은행" data-source-title="통화정책 자료" data-checked-point="기준금리 확인"><a href="https://example.com/report/">통화정책 자료</a></p></section></div>'
function candidate(overrides: Partial<NewsResponseCandidate> = {}): NewsResponseCandidate {
  const document = new DOMParser().parseFromString(overrides.wordpressHtml ?? html, 'text/html')
  return { representativeTitle: '경제 흐름 대표 제목', alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'], metaDescription: '가'.repeat(120), slug: 'economy-briefing-2026-08-13', focusKeyword: '경제 흐름', tags: ['금리', '환율', '물가', '산업', '정책'], wordpressHtml: overrides.wordpressHtml ?? html, imagePrompt: '서울 금융 지구 편집 이미지', imageAlt: '서울 금융 지구', checklist: ['제목 확인'], sources: extractNewsResponseSources(document), ...overrides }
}
function issueCodes(value: NewsResponseCandidate, setting: ImportCategory | null = category, date = '2026-08-13') { return validateNewsResponse(value, setting, date).issues.map((item) => item.code) }

describe('validateNewsResponse', () => {
  it('uses explicit date with applyCategoryPattern and creates the exact news draft payload allowlist', () => {
    const result = validateNewsResponse(candidate(), category, '2026-08-13')
    expect(result.status).toBe('valid')
    expect(result.derived).toMatchObject({ displayId: '#2026-08-13-ECO', authoritativeSlug: 'economy-briefing-2026-08-13', briefingDate: '2026-08-13', title: '경제 흐름 대표 제목' })
    expect(result.persistencePayload?.content).toEqual({ content_group: 'news', category_id: 'economy', display_id: '#2026-08-13-ECO', series_no: null, title: '경제 흐름 대표 제목', summary: '가'.repeat(120), slug: 'economy-briefing-2026-08-13', published_on: '2026-08-13', published_at: null, wordpress_url: null })
    expect(result.persistencePayload?.sources[0].source_url).toBe('https://example.com/report')
    expect(JSON.stringify(result.persistencePayload)).not.toMatch(/checklist|topic|tracking|owner|auth|session|provenance/iu)
  })

  it.each(['', '2026-02-30', '2026-8-13', '2026-08-13T00:00:00+09:00'])('requires a semantic date-only value: %s', (date) => expect(issueCodes(candidate(), category, date)).toContain('NEWS_BRIEFING_DATE_INVALID'))
  it('accepts only enabled news categories with complete case-sensitive date patterns', () => {
    expect(issueCodes(candidate(), { ...category, enabled: false })).toContain('NEWS_UNSUPPORTED_CATEGORY')
    expect(issueCodes(candidate(), { ...category, contentGroup: 'ai' })).toContain('NEWS_UNSUPPORTED_CATEGORY')
    expect(issueCodes(candidate(), { ...category, displayIdPattern: '#yyyy-mm-dd-ECO' })).toContain('NEWS_CATEGORY_PATTERN_INVALID')
    expect(issueCodes(candidate(), { ...category, slugPattern: '' })).toContain('NEWS_CATEGORY_PATTERN_INVALID')
    expect(issueCodes(candidate(), { ...category, wrapperClass: '' })).toContain('NEWS_CATEGORY_PATTERN_INVALID')
  })

  it.each([null, ''] as const)('rejects a missing or empty display-ID pattern: %s', (displayIdPattern) => {
    const result = validateNewsResponse(candidate(), { ...category, displayIdPattern }, '2026-08-13')
    expect(result.status).toBe('invalid')
    expect(result.issues.map((item) => item.code)).toContain('NEWS_CATEGORY_PATTERN_INVALID')
    expect(result.persistencePayload).toBeNull()
  })

  it('enforces authoritative slug and normalized h1/representative-title equality', () => {
    expect(issueCodes(candidate({ slug: 'edited-slug' }))).toContain('NEWS_SLUG_PATTERN_MISMATCH')
    expect(issueCodes(candidate({ wordpressHtml: html.replace('경제 흐름 대표 제목', '다른 제목'), sources: candidate().sources }))).toContain('NEWS_HTML_H1_TITLE_MISMATCH')
    expect(issueCodes(candidate({ wordpressHtml: html.replace('경제 흐름 대표 제목', '  경제   흐름 대표 제목  '), sources: candidate().sources }))).not.toContain('NEWS_HTML_H1_TITLE_MISMATCH')
    expect(issueCodes(candidate({ imageAlt: '첫 줄\n둘째 줄' }))).toContain('NEWS_SCALAR_MULTILINE')
  })

  it.each([
    ['<script>x</script>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<iframe></iframe>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<object></object>', 'NEWS_HTML_EXECUTABLE_CONTENT'],
    ['<embed>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<form></form>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<style>x</style>', 'NEWS_HTML_EXECUTABLE_CONTENT'],
    ['<link href="x">', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<meta>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<base href="x">', 'NEWS_HTML_EXECUTABLE_CONTENT'],
    ['<p onclick="x">x</p>', 'NEWS_HTML_EXECUTABLE_CONTENT'], ['<a href="javascript:x">x</a>', 'NEWS_HTML_ACTIVE_URL_SCHEME'],
    ['<img src="data:image/png,x">', 'NEWS_HTML_ACTIVE_URL_SCHEME'], ['<a href="vbscript:x">x</a>', 'NEWS_HTML_ACTIVE_URL_SCHEME'],
  ])('blocks frozen HTML security case %s', (fragment, expected) => {
    const unsafe = html.replace('<section id="sources">', `${fragment}<section id="sources">`)
    expect(issueCodes(candidate({ wordpressHtml: unsafe, sources: extractNewsResponseSources(new DOMParser().parseFromString(unsafe, 'text/html')) }))).toContain(expected)
  })

  it('requires one exact wrapper div, one h1, and prompt outside HTML', () => {
    expect(issueCodes(candidate({ wordpressHtml: `${html}<p>x</p>` }))).toContain('NEWS_HTML_TOP_LEVEL_INVALID')
    expect(issueCodes(candidate({ wordpressHtml: html.replace(' economy"', ' economy extra"') }))).toContain('NEWS_CATEGORY_WRAPPER_MISMATCH')
    expect(issueCodes(candidate({ wordpressHtml: html.replace('<h1>', '<h1>x</h1><h1>') }))).toContain('NEWS_HTML_H1_COUNT_INVALID')
    expect(issueCodes(candidate({ wordpressHtml: html.replace('</div>', '<p>서울 금융 지구 편집 이미지</p></div>') }))).toContain('NEWS_IMAGE_PROMPT_IN_HTML')
    const reordered = html.replace('daily-brief-note news-briefing economy', 'economy daily-brief-note news-briefing')
    expect(issueCodes(candidate({ wordpressHtml: reordered, sources: extractNewsResponseSources(new DOMParser().parseFromString(reordered, 'text/html')) }))).not.toContain('NEWS_CATEGORY_WRAPPER_MISMATCH')
  })

  it('rejects otherwise valid HTML with zero h1 elements', () => {
    const withoutH1 = html.replace('<h1>경제 흐름 대표 제목</h1>', '')
    expect(issueCodes(candidate({ wordpressHtml: withoutH1, sources: extractNewsResponseSources(new DOMParser().parseFromString(withoutH1, 'text/html')) }))).toContain('NEWS_HTML_H1_COUNT_INVALID')
  })

  it('rejects a wrapper belonging to a different selected category', () => {
    const wrongWrapper = html.replace('daily-brief-note news-briefing economy', 'daily-brief-note news-briefing global')
    expect(issueCodes(candidate({ wordpressHtml: wrongWrapper, sources: extractNewsResponseSources(new DOMParser().parseFromString(wrongWrapper, 'text/html')) }))).toContain('NEWS_CATEGORY_WRAPPER_MISMATCH')
  })

  it('validates SEO title, meta warning, tags, brand/category and near duplicates', () => {
    expect(issueCodes(candidate({ alternativeTitles: ['경제 흐름 대표 제목', '2', '3', '4'] }))).toContain('NEWS_SEO_TITLE_DUPLICATE')
    expect(issueCodes(candidate({ metaDescription: '짧음' }))).toContain('NEWS_META_DESCRIPTION_LENGTH_WARNING')
    expect(issueCodes(candidate({ tags: ['금리', '금리', '물가', '산업', '정책'] }))).toContain('NEWS_SEO_TAG_INVALID')
    expect(issueCodes(candidate({ tags: ['경제', 'Daily Brief Note', '물가', '산업', '정책'] }))).toContain('NEWS_SEO_TAG_INVALID')
  })

  it('extracts sources from #sources only and blocks missing, foreign, invalid, duplicate normalized rows', () => {
    const outside = '<div class="daily-brief-note news-briefing economy"><h1>경제 흐름 대표 제목</h1><section id="source-check"><a href="https://example.com/report">원문</a></section></div>'
    expect(extractNewsResponseSources(new DOMParser().parseFromString(outside, 'text/html'))).toEqual([])
    expect(issueCodes(candidate({ sources: [] }))).toContain('NEWS_SOURCE_REQUIRED')
    expect(issueCodes(candidate({ sources: [{ ...candidate().sources[0], sourceUrl: 'https://other.example/item' }] }))).toContain('NEWS_SOURCE_INVALID')
    expect(issueCodes(candidate({ sources: [{ ...candidate().sources[0], sourcePublishedAt: 'bad' }] }))).toContain('NEWS_SOURCE_INVALID')
    expect(issueCodes(candidate({ sources: [candidate().sources[0], { ...candidate().sources[0], sourceUrl: 'https://example.com/report/#part' }] }))).toContain('NEWS_SOURCE_DUPLICATE')
    const homepage = html.replace('https://example.com/report/', 'https://example.com/')
    expect(issueCodes(candidate({ wordpressHtml: homepage, sources: extractNewsResponseSources(new DOMParser().parseFromString(homepage, 'text/html')) }))).toContain('NEWS_SOURCE_URL_WARNING')
  })
})
