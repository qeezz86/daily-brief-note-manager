import { describe, expect, it } from 'vitest'
import {
  CHATGPT_PASTE_MAX_INPUT_BYTES,
  CHATGPT_PASTE_MAX_JSON_DEPTH,
  CHATGPT_PASTE_MAX_JSON_STRING_BYTES,
  parseChatGptPaste,
} from './parseChatGptPaste'

function validPaste(overrides: { content?: string; seo?: string; html?: string; tracking?: string; extra?: string } = {}) {
  const content = overrides.content ?? JSON.stringify({
    contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO',
    title: '경제 브리핑', summary: '경제 핵심 흐름 요약', slug: 'economy-briefing-2026-08-01',
    publishedOn: '2026-08-01', publishedAt: null, seriesNo: null, wordpressUrl: null,
  }, null, 2)
  const seo = overrides.seo ?? JSON.stringify({
    representativeTitle: '경제 브리핑 대표 제목', alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'],
    metaDescription: '가'.repeat(120), focusKeyword: '경제 브리핑', tags: ['금리', '환율', '물가', '산업', '정책'],
  }, null, 2)
  const html = overrides.html ?? '<div class="daily-brief-note news-briefing economy">\n<h1>경제 브리핑</h1>\n</div>'
  const tracking = overrides.tracking === undefined ? '' : `\n[NEWS_TRACKING_JSON]\n${overrides.tracking}\n[/NEWS_TRACKING_JSON]`
  return `[CONTENT_META_JSON]\n${content}\n[/CONTENT_META_JSON]\n\n[SEO_JSON]\n${seo}\n[/SEO_JSON]\n\n[IMAGE_PROMPT_JSON]\n{"prompt":"경제 뉴스 장면","alt":"경제 뉴스 장면"}\n[/IMAGE_PROMPT_JSON]\n\n[SOURCES_JSON]\n[{"sourceName":"기관","sourceTitle":"원문","sourceUrl":"https://example.com/article","sourcePublishedAt":null,"checkedPoint":"핵심 확인"}]\n[/SOURCES_JSON]\n\n[WORDPRESS_HTML]\n${html}\n[/WORDPRESS_HTML]${tracking}${overrides.extra ?? ''}`
}

function issueCodes(text: string) {
  return parseChatGptPaste(text).blockingIssues.map((issue) => issue.code)
}

const contentFields = {
  contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO',
  title: '경제 브리핑', slug: 'economy-briefing-2026-08-01',
  publishedOn: '2026-08-01', publishedAt: null,
}

function contentJsonWithMembers(members: string) {
  const base = JSON.stringify(contentFields)
  return `${base.slice(0, -1)},${members}}`
}

function unknownSectionAtInputBytes(byteLength: number) {
  const prefix = '[UNKNOWN_SECTION]\n'
  const suffix = '\n[/UNKNOWN_SECTION]'
  return prefix + 'x'.repeat(byteLength - prefix.length - suffix.length) + suffix
}

function nestedObject(containerCount: number) {
  let value: unknown = 'leaf'
  for (let index = 0; index < containerCount; index += 1) value = { nested: value }
  return value
}

function contentAtParserDepth(depth: number) {
  return JSON.stringify({ ...contentFields, unsupported: nestedObject(depth - 1) })
}

function contentWithJsonStringBytes(byteLength: number) {
  return JSON.stringify({ ...contentFields, unsupported: 'x'.repeat(byteLength) })
}

describe('parseChatGptPaste', () => {
  it('parses a valid structured paste into an allowlisted single-post payload', () => {
    const result = parseChatGptPaste(validPaste())
    expect(result.saveEligibility).toEqual({ isEligible: true, requiresWarningAcknowledgement: false })
    expect(result.preview).toMatchObject({ category: 'economy', title: '경제 브리핑' })
    expect(result.persistencePayload?.content).toEqual({
      content_group: 'news', category_id: 'economy', display_id: '#2026-08-01-ECO', series_no: null,
      title: '경제 브리핑', summary: '경제 핵심 흐름 요약', slug: 'economy-briefing-2026-08-01',
      published_on: '2026-08-01', published_at: null, wordpress_url: null,
    })
  })

  it.each([['empty', ''], ['whitespace', '  \n\t']])('rejects %s input', (_name, input) => {
    expect(issueCodes(input)).toContain('EMPTY_INPUT')
  })

  it('reports a missing required section', () => {
    expect(issueCodes(validPaste().replace(/\[IMAGE_PROMPT_JSON\][\s\S]*?\[\/IMAGE_PROMPT_JSON\]\n\n/, ''))).toContain('MISSING_REQUIRED_SECTION')
  })

  it('reports missing required fields and invalid values', () => {
    const missing = validPaste({ content: '{"contentGroup":"news","category":"economy"}' })
    expect(issueCodes(missing)).toContain('MISSING_REQUIRED_FIELD')
    const invalid = validPaste({ content: '{"contentGroup":"unknown","category":"economy","displayId":null,"title":"x","slug":"Bad Slug","publishedOn":"no","publishedAt":null}' })
    expect(issueCodes(invalid)).toContain('INVALID_FIELD_VALUE')
  })

  it('rejects malformed JSON, duplicate sections, and duplicate JSON keys', () => {
    expect(issueCodes(validPaste({ content: '{' }))).toContain('MALFORMED_JSON')
    expect(issueCodes(`${validPaste()}\n[SEO_JSON]\n{}\n[/SEO_JSON]`)).toContain('DUPLICATE_SECTION')
    expect(issueCodes(validPaste({ content: '{"contentGroup":"news","contentGroup":"ai"}' }))).toContain('DUPLICATE_JSON_KEY')
  })

  it('reports the section name when an opening section is not closed', () => {
    expect(parseChatGptPaste('[CONTENT_META_JSON]\n{}').blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'SECTION_GRAMMAR_INVALID', path: 'CONTENT_META_JSON' }),
    )
  })

  it('surfaces unknown sections and unsupported fields as ignored warnings', () => {
    const content = JSON.stringify({ contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title: '경제 브리핑', slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null, extraField: 'ignored' })
    const result = parseChatGptPaste(validPaste({ content, extra: '\n[UNSUPPORTED_JSON]\n{}\n[/UNSUPPORTED_JSON]' }))
    expect(result.warnings.map((issue) => issue.code)).toEqual(expect.arrayContaining(['UNKNOWN_SECTION_IGNORED', 'UNSUPPORTED_FIELD_IGNORED']))
    expect(result.persistencePayload).not.toHaveProperty('extraField')
  })

  it('recognizes NEWS_TRACKING_JSON but excludes it from persistence', () => {
    const result = parseChatGptPaste(validPaste({ tracking: '{"updates":[{"headline":"x"}],"followups":[{"check":"y"}]}' }))
    expect(result.newsTracking).toEqual({ present: true, updateCount: 1, followupCount: 1, persisted: false })
    expect(result.persistencePayload).not.toHaveProperty('newsTracking')
    expect(JSON.stringify(result.persistencePayload)).not.toContain('headline')
  })

  it('preserves multiline HTML and escaped multiline JSON strings as inert text', () => {
    const html = '<div class="daily-brief-note news-briefing economy">\n<h1>&lt;script&gt;not executed&lt;/script&gt;</h1>\n<p>둘째 줄</p>\n</div>'
    const content = JSON.stringify({ contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title: '첫째 줄\n둘째 줄', slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null })
    const result = parseChatGptPaste(validPaste({ content, html }))
    expect(result.preview?.wordpressHtml).toBe(html)
    expect(result.preview?.title).toBe('첫째 줄\n둘째 줄')
  })

  it('keeps section-marker-like text inside WORDPRESS_HTML when it is not an exact delimiter', () => {
    const html = '<div class="daily-brief-note news-briefing economy">\n<h1>경제 브리핑</h1>\n[SEO_JSON] 본문에 남아야 하는 표시\n</div>'
    const result = parseChatGptPaste(validPaste({ html }))

    expect(result.blockingIssues).toEqual([])
    expect(result.preview?.wordpressHtml).toBe(html)
  })

  it('blocks a duplicate JSON key nested below an unsupported field', () => {
    const content = contentJsonWithMembers('"unsupported":{"nested":{"duplicate":1,"duplicate":2}}')
    const result = parseChatGptPaste(validPaste({ content }))

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_JSON_KEY', path: 'CONTENT_META_JSON.unsupported.nested.duplicate' }),
    ]))
    expect(result.persistencePayload).toBeNull()
  })

  it('blocks a top-level __proto__ key without producing persistence output', () => {
    const content = contentJsonWithMembers('"__proto__":{"polluted":true}')
    const result = parseChatGptPaste(validPaste({ content }))

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FORBIDDEN_FIELD', path: 'CONTENT_META_JSON.__proto__' }),
    ]))
    expect(result.persistencePayload).toBeNull()
  })

  it('blocks a nested constructor key without unsafe persistence output', () => {
    const content = contentJsonWithMembers('"unsupported":{"constructor":{"polluted":true}}')
    const result = parseChatGptPaste(validPaste({ content }))

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FORBIDDEN_FIELD', path: 'CONTENT_META_JSON.unsupported.constructor' }),
    ]))
    expect(result.persistencePayload).toBeNull()
  })

  it('blocks a nested prototype key without unsafe persistence output', () => {
    const content = contentJsonWithMembers('"unsupported":{"nested":{"prototype":{"polluted":true}}}')
    const result = parseChatGptPaste(validPaste({ content }))

    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FORBIDDEN_FIELD', path: 'CONTENT_META_JSON.unsupported.nested.prototype' }),
    ]))
    expect(result.persistencePayload).toBeNull()
  })

  it('uses UTF-8 bytes rather than JavaScript character count for large Unicode input', () => {
    const prefix = '[UNKNOWN_SECTION]\n'
    const suffix = '\n[/UNKNOWN_SECTION]'
    const unicodeCount = Math.floor((CHATGPT_PASTE_MAX_INPUT_BYTES - prefix.length - suffix.length) / 3) + 1
    const input = prefix + '가'.repeat(unicodeCount) + suffix

    expect(input.length).toBeLessThan(CHATGPT_PASTE_MAX_INPUT_BYTES)
    expect(new TextEncoder().encode(input).byteLength).toBeGreaterThan(CHATGPT_PASTE_MAX_INPUT_BYTES)
    expect(issueCodes(input)).toContain('INPUT_LIMIT_EXCEEDED')
  })

  it('accepts input at the exact 20 MiB UTF-8 boundary', () => {
    const input = unknownSectionAtInputBytes(CHATGPT_PASTE_MAX_INPUT_BYTES)

    expect(new TextEncoder().encode(input)).toHaveLength(CHATGPT_PASTE_MAX_INPUT_BYTES)
    expect(issueCodes(input)).not.toContain('INPUT_LIMIT_EXCEEDED')
  })

  it('blocks input one byte above the 20 MiB UTF-8 boundary', () => {
    const input = unknownSectionAtInputBytes(CHATGPT_PASTE_MAX_INPUT_BYTES + 1)

    expect(new TextEncoder().encode(input)).toHaveLength(CHATGPT_PASTE_MAX_INPUT_BYTES + 1)
    expect(issueCodes(input)).toContain('INPUT_LIMIT_EXCEEDED')
  })

  it('accepts a decoded JSON string at the exact 5 MiB boundary', () => {
    const result = parseChatGptPaste(validPaste({
      content: contentWithJsonStringBytes(CHATGPT_PASTE_MAX_JSON_STRING_BYTES),
    }))

    expect(result.blockingIssues.map((issue) => issue.code)).not.toContain('JSON_STRING_LIMIT_EXCEEDED')
  })

  it('blocks a decoded JSON string one byte above the 5 MiB boundary', () => {
    const result = parseChatGptPaste(validPaste({
      content: contentWithJsonStringBytes(CHATGPT_PASTE_MAX_JSON_STRING_BYTES + 1),
    }))

    expect(result.blockingIssues.map((issue) => issue.code)).toContain('JSON_STRING_LIMIT_EXCEEDED')
    expect(result.persistencePayload).toBeNull()
  })

  it('accepts JSON containers at the exact nesting depth of 30', () => {
    const result = parseChatGptPaste(validPaste({ content: contentAtParserDepth(CHATGPT_PASTE_MAX_JSON_DEPTH) }))

    expect(result.blockingIssues.map((issue) => issue.code)).not.toContain('JSON_NESTING_LIMIT_EXCEEDED')
  })

  it('blocks JSON containers one level above nesting depth 30', () => {
    const result = parseChatGptPaste(validPaste({ content: contentAtParserDepth(CHATGPT_PASTE_MAX_JSON_DEPTH + 1) }))

    expect(result.blockingIssues.map((issue) => issue.code)).toContain('JSON_NESTING_LIMIT_EXCEEDED')
    expect(result.persistencePayload).toBeNull()
  })

  it('does not create or terminate a section for escaped marker-like text in a JSON string', () => {
    const title = '문자열 안의\n[SEO_JSON]\n표시'
    const result = parseChatGptPaste(validPaste({ content: JSON.stringify({ ...contentFields, title }) }))

    expect(result.blockingIssues).toEqual([])
    expect(result.preview?.title).toBe(title)
  })

  it('keeps deterministic issue order across multiple boundary violations', () => {
    const content = contentJsonWithMembers('"unsupported":{"duplicate":1,"duplicate":2}')
    const seo = JSON.stringify({
      representativeTitle: '대표 제목', alternativeTitles: ['1', '2', '3', '4'],
      metaDescription: '가'.repeat(120), focusKeyword: '경제', tags: ['금리', '환율', '물가', '산업', '정책'],
      unsupported: nestedObject(CHATGPT_PASTE_MAX_JSON_DEPTH),
    })
    const input = validPaste({ content, seo })
    const first = parseChatGptPaste(input).blockingIssues.map(({ code, path }) => ({ code, path }))
    const second = parseChatGptPaste(input).blockingIssues.map(({ code, path }) => ({ code, path }))

    expect(first.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'DUPLICATE_JSON_KEY', 'JSON_NESTING_LIMIT_EXCEEDED',
    ]))
    expect(second).toEqual(first)
  })

  it('accepts the 20 MiB boundary and rejects input above it', () => {
    const prefix = '[UNKNOWN_SECTION]\n'
    const suffix = '\n[/UNKNOWN_SECTION]'
    const boundary = prefix + 'x'.repeat(CHATGPT_PASTE_MAX_INPUT_BYTES - prefix.length - suffix.length) + suffix
    expect(issueCodes(boundary)).not.toContain('INPUT_LIMIT_EXCEEDED')
    expect(issueCodes(`${boundary}x`)).toContain('INPUT_LIMIT_EXCEEDED')
  })

  it('accepts a 5 MiB JSON string and rejects one byte above it', () => {
    const base = { contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title: '경제', slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null }
    const atBoundary = validPaste({ content: JSON.stringify({ ...base, unsupported: 'x'.repeat(CHATGPT_PASTE_MAX_JSON_STRING_BYTES) }) })
    const overBoundary = validPaste({ content: JSON.stringify({ ...base, unsupported: 'x'.repeat(CHATGPT_PASTE_MAX_JSON_STRING_BYTES + 1) }) })
    expect(issueCodes(atBoundary)).not.toContain('JSON_STRING_LIMIT_EXCEEDED')
    expect(issueCodes(overBoundary)).toContain('JSON_STRING_LIMIT_EXCEEDED')
  })

  it('rejects nesting deeper than 30 levels', () => {
    let nested: unknown = 'leaf'
    for (let index = 0; index < CHATGPT_PASTE_MAX_JSON_DEPTH + 1; index += 1) nested = { nested }
    const content = JSON.stringify({ contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title: '경제', slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null, unsupported: nested })
    expect(issueCodes(validPaste({ content }))).toContain('JSON_NESTING_LIMIT_EXCEEDED')
  })

  it('returns equivalent normalized output and issue order for identical input', () => {
    const input = validPaste({ tracking: '{"updates":[],"followups":[]}', extra: '\n[UNKNOWN]\ntext\n[/UNKNOWN]' })
    expect(parseChatGptPaste(input)).toEqual(parseChatGptPaste(input))
  })

  it('uses an exact persistence allowlist and excludes raw paste, owner, auth, and session fields', () => {
    const valid = parseChatGptPaste(validPaste())
    expect(Object.keys(valid.persistencePayload ?? {}).sort()).toEqual(['content', 'html_body', 'image', 'seo', 'sources'])
    const forbidden = parseChatGptPaste(validPaste({ content: '{"contentGroup":"news","category":"economy","displayId":null,"title":"x","slug":"x","publishedOn":"2026-08-01","publishedAt":null,"ownerId":"owner","auth":{"uid":"x"},"session":"secret","rawPaste":"raw"}' }))
    expect(forbidden.blockingIssues.filter((issue) => issue.code === 'FORBIDDEN_FIELD').length).toBeGreaterThanOrEqual(4)
    expect(forbidden.persistencePayload).toBeNull()
  })
})
