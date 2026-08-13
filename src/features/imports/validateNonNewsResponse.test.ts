import { describe, expect, it } from 'vitest'
import type { ImportCategory } from './importValidation.types'
import type { NonNewsResponseCandidate } from './nonNewsResponseImport.types'
import { validateNonNewsResponse } from './validateNonNewsResponse'

const categories: Record<string, ImportCategory> = {
  'ai-column': { id: 'ai-column', contentGroup: 'ai', name: 'AI 칼럼', code: 'AI', wrapperClass: 'daily-brief-note ai-column', displayIdPattern: 'AI-###', slugPattern: 'ai-###', enabled: true },
  'info-db': { id: 'info-db', contentGroup: 'info_db', name: '정보DB', code: 'INFO', wrapperClass: 'daily-brief-note info-db', displayIdPattern: '정보DB-###', slugPattern: 'info-db-###', enabled: true },
  'chinese-study': { id: 'chinese-study', contentGroup: 'chinese', name: '중국어 학습', code: 'CHINESE', wrapperClass: 'daily-brief-note chinese-study', displayIdPattern: null, slugPattern: 'cctv-chinese-news-###', enabled: true },
}

function candidate(categoryId = 'ai-column'): NonNewsResponseCandidate {
  const wrapper = categories[categoryId].wrapperClass
  const title = categoryId === 'chinese-study' ? 'CCTV 뉴스로 배우는 중국어 #[번호]' : '새로운 업무 설계'
  return {
    representativeTitle: title,
    alternativeTitles: ['대안 제목 하나', '대안 제목 둘', '대안 제목 셋', '대안 제목 넷'],
    metaDescription: '가'.repeat(120),
    slug: categories[categoryId].slugPattern,
    focusKeyword: '업무 설계',
    tags: ['인공지능', '업무혁신', '생산성', '자동화', '디지털전환'],
    wordpressHtml: `<div class="${wrapper}"><h1>${title}</h1><section id="sources"><p data-source-name="기관" data-source-title="원문" data-checked-point="핵심 확인"><a href="https://example.com/article">원문</a></p></section></div>`,
    imagePrompt: '사무실에서 협업하는 사람들의 미니멀한 장면',
    imageAlt: '사무실에서 협업하는 사람들',
    checklist: ['제목 확인', '출처 확인'],
    sources: [],
  }
}

function issueCodes(result: ReturnType<typeof validateNonNewsResponse>) {
  return result.issues.map((item) => item.code)
}

describe('validateNonNewsResponse', () => {
  it.each([['ai-column', 'AI-007', 'ai-007'], ['info-db', '정보DB-007', 'info-db-007']] as const)('resolves explicit series identifiers for %s using active settings', (categoryId, displayId, slug) => {
    const result = validateNonNewsResponse(candidate(categoryId), categories[categoryId], 7)
    expect(result.status).toBe('valid')
    expect(result.derived).toMatchObject({ seriesNo: 7, displayId })
    expect(result.candidate.slug).toBe(slug)
    expect(result.persistencePayload?.content.slug).toBe(slug)
  })

  it('resolves Chinese [번호], keeps display ID null, and derives title from h1', () => {
    const result = validateNonNewsResponse(candidate('chinese-study'), categories['chinese-study'], 12)
    expect(result.derived).toMatchObject({ seriesNo: 12, displayId: null, title: 'CCTV 뉴스로 배우는 중국어 #12' })
    expect(JSON.stringify(result.persistencePayload)).not.toMatch(/\[번호\]|###/u)
    expect(result.persistencePayload?.content.slug).toBe('cctv-chinese-news-012')
  })

  it('blocks a missing explicit positive series number', () => {
    expect(issueCodes(validateNonNewsResponse(candidate(), categories['ai-column'], null))).toContain('NON_NEWS_REQUIRED_IDENTIFIER_UNRESOLVED')
  })

  it('rejects unsupported or inactive categories without inferring from HTML', () => {
    expect(issueCodes(validateNonNewsResponse(candidate(), null, 1))).toContain('NON_NEWS_UNSUPPORTED_CATEGORY')
    expect(issueCodes(validateNonNewsResponse(candidate(), { ...categories['ai-column'], enabled: false }, 1))).toContain('NON_NEWS_UNSUPPORTED_CATEGORY')
  })

  it('rejects the wrong wrapper, zero h1, and multiple h1', () => {
    expect(issueCodes(validateNonNewsResponse({ ...candidate(), wordpressHtml: candidate().wordpressHtml.replace('daily-brief-note ai-column', 'daily-brief-note info-db') }, categories['ai-column'], 1))).toContain('NON_NEWS_CATEGORY_WRAPPER_MISMATCH')
    expect(issueCodes(validateNonNewsResponse({ ...candidate(), wordpressHtml: candidate().wordpressHtml.replace(/<h1>.*?<\/h1>/u, '') }, categories['ai-column'], 1))).toContain('NON_NEWS_HTML_H1_COUNT_INVALID')
    expect(issueCodes(validateNonNewsResponse({ ...candidate(), wordpressHtml: candidate().wordpressHtml.replace('</h1>', '</h1><h1>둘째</h1>') }, categories['ai-column'], 1))).toContain('NON_NEWS_HTML_H1_COUNT_INVALID')
  })

  it('rejects a wrapper whose final closing tag is missing even when DOMParser repairs it', () => {
    const base = candidate()
    expect(issueCodes(validateNonNewsResponse({ ...base, wordpressHtml: base.wordpressHtml.replace(/<\/div>$/u, '') }, categories['ai-column'], 1))).toContain('NON_NEWS_HTML_TOP_LEVEL_INVALID')
  })

  it('uses the sole normalized h1 as persisted title independent of the SEO title', () => {
    const result = validateNonNewsResponse({ ...candidate(), representativeTitle: 'SEO 전용 제목', wordpressHtml: candidate().wordpressHtml.replace('새로운 업무 설계', '  본문   제목  ') }, categories['ai-column'], 1)
    expect(result.derived?.title).toBe('본문 제목')
    expect(result.persistencePayload?.seo.representative_title).toBe('SEO 전용 제목')
  })

  it('blocks image prompts embedded in HTML and protected-field injection', () => {
    const base = candidate()
    expect(issueCodes(validateNonNewsResponse({ ...base, wordpressHtml: base.wordpressHtml.replace('</div>', `<p>${base.imagePrompt}</p></div>`) }, categories['ai-column'], 1))).toContain('NON_NEWS_IMAGE_PROMPT_IN_HTML')
    expect(issueCodes(validateNonNewsResponse({ ...base, focusKeyword: 'owner_id: attacker' }, categories['ai-column'], 1))).toContain('NON_NEWS_PROTECTED_FIELD_MARKER')
  })

  it.each(['<script>alert(1)</script>', '<iframe src="https://example.com"></iframe>', '<img src=x onerror="alert(1)">', '<template><form action="https://example.com"></form></template>'])('blocks executable HTML while keeping it inert: %s', (unsafe) => {
    const base = candidate()
    const result = validateNonNewsResponse({ ...base, wordpressHtml: base.wordpressHtml.replace('</div>', `${unsafe}</div>`) }, categories['ai-column'], 1)
    expect(issueCodes(result)).toContain('NON_NEWS_HTML_EXECUTABLE_CONTENT')
  })

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'vbscript:msgbox(1)'])('blocks active URL scheme %s', (url) => {
    const base = candidate()
    const result = validateNonNewsResponse({ ...base, wordpressHtml: base.wordpressHtml.replace('https://example.com/article', url) }, categories['ai-column'], 1)
    expect(issueCodes(result)).toContain('NON_NEWS_HTML_ACTIVE_URL_SCHEME')
  })

  it('blocks invalid and category-pattern-mismatched slugs', () => {
    expect(issueCodes(validateNonNewsResponse({ ...candidate(), slug: 'Bad Slug' }, categories['ai-column'], 1))).toEqual(expect.arrayContaining(['NON_NEWS_SLUG_INVALID', 'NON_NEWS_SLUG_PATTERN_MISMATCH']))
  })

  it('requires valid sources and only emits the exact persistence allowlist', () => {
    const result = validateNonNewsResponse(candidate(), categories['ai-column'], 1)
    expect(Object.keys(result.persistencePayload ?? {})).toEqual(['content', 'seo', 'image', 'sources', 'html_body'])
    expect(JSON.stringify(result.persistencePayload)).not.toMatch(/checklist|owner|user|auth|raw|status|provenance/iu)
    expect(result.persistencePayload?.sources).toEqual([{ source_name: '기관', source_title: '원문', source_url: 'https://example.com/article', source_published_at: null, checked_point: '핵심 확인' }])
  })
})
