import { describe, expect, it } from 'vitest'
import { NEWS_RESPONSE_HEADINGS } from './newsResponseImport.types'
import { parseNewsResponse } from './parseNewsResponse'

const sections = [
  '경제 흐름 대표 제목', '- 대안 하나\n- 대안 둘\n- 대안 셋\n- 대안 넷', '가'.repeat(120), 'economy-briefing-2026-08-13', '경제 흐름',
  '- 금리\n- 환율\n- 물가\n- 산업\n- 정책', '```html\n<div class="daily-brief-note news-briefing economy"><h1>경제 흐름 대표 제목</h1></div>\n```',
  '서울의 금융 지구를 표현한 사실적인 편집 이미지\n텍스트와 로고 없음', '서울 금융 지구 전경', '- 제목 확인\n- 출처 확인',
]
function response(overrides: Partial<Record<number, string>> = {}) { return NEWS_RESPONSE_HEADINGS.map((heading, index) => `${heading}\n${overrides[index] ?? sections[index]}`).join('\n\n') }
function codes(value: string) { return parseNewsResponse(value).issues.map((item) => item.code) }

describe('parseNewsResponse', () => {
  it.each([response(), `\uFEFF${response()}`, response().replace(/\n/gu, '\r\n')])('parses canonical, BOM, and CRLF input deterministically', (input) => {
    const result = parseNewsResponse(input)
    expect(result.issues).toEqual([])
    expect(result.candidate?.alternativeTitles).toHaveLength(4)
    expect(result.candidate?.imagePrompt).toContain('\n')
  })

  it('normalizes bare CR separators to the same canonical semantic content as LF', () => {
    const canonical = parseNewsResponse(response())
    const bareCr = parseNewsResponse(response().replace(/\n/gu, '\r'))
    expect(bareCr.issues).toEqual([])
    expect(bareCr.candidate).toEqual(canonical.candidate)
  })

  it('rejects missing, duplicate, wrong-order, fuzzy, and unknown structural headings', () => {
    expect(codes(response().replace(`${NEWS_RESPONSE_HEADINGS[1]}\n${sections[1]}\n\n`, ''))).toContain('NEWS_MISSING_SECTION')
    expect(codes(response().replace(NEWS_RESPONSE_HEADINGS[2], `${NEWS_RESPONSE_HEADINGS[1]}\nx\n\n${NEWS_RESPONSE_HEADINGS[2]}`))).toContain('NEWS_DUPLICATE_SECTION')
    const first = `${NEWS_RESPONSE_HEADINGS[0]}\n${sections[0]}`
    const second = `${NEWS_RESPONSE_HEADINGS[1]}\n${sections[1]}`
    expect(codes(response().replace(`${first}\n\n${second}`, `${second}\n\n${first}`))).toContain('NEWS_SECTION_ORDER_INVALID')
    expect(codes(response().replace(NEWS_RESPONSE_HEADINGS[0], '1. SEO 대표 제목'))).toEqual(expect.arrayContaining(['NEWS_MISSING_SECTION', 'NEWS_UNKNOWN_STRUCTURAL_SECTION']))
    expect(codes(response().replace(NEWS_RESPONSE_HEADINGS[5], '11. 알 수 없는 구조'))).toContain('NEWS_UNKNOWN_STRUCTURAL_SECTION')
  })

  it('rejects preamble and epilogue', () => {
    expect(codes(`설명\n${response()}`)).toContain('NEWS_PREAMBLE_INVALID')
    expect(codes(`${response()}\n마침`)).toEqual(expect.arrayContaining(['NEWS_LIST_MALFORMED', 'NEWS_EPILOGUE_INVALID']))
  })

  it.each([[1, '- 1\n- 2\n- 3'], [1, '- 1\n- 2\n- 3\n- 4\n- 5'], [5, '- 1\n- 2\n- 3\n- 4'], [5, '- 1\n- 2\n- 3\n- 4\n- 5\n- 6\n- 7\n- 8\n- 9']])('rejects frozen list count boundaries for section %i', (index, value) => {
    expect(codes(response({ [index]: value }))).toContain(index === 1 ? 'NEWS_ALTERNATIVE_TITLE_COUNT_INVALID' : 'NEWS_TAG_COUNT_INVALID')
  })

  it('rejects empty list items, blank list lines, and a zero checklist', () => {
    expect(codes(response({ 1: '- one\n- \n- three\n- four' }))).toContain('NEWS_LIST_MALFORMED')
    expect(codes(response({ 5: '- one\n\n- two\n- three\n- four\n- five' }))).toContain('NEWS_LIST_MALFORMED')
    expect(codes(response({ 9: '' }))).toContain('NEWS_CHECKLIST_REQUIRED')
  })

  it.each([
    ['```html\n<div></div>\n```\n```html\n<div></div>\n```', 'NEWS_HTML_MULTIPLE_CODE_BLOCKS'],
    ['```HTML\n<div></div>\n```', 'NEWS_HTML_FENCE_MALFORMED'],
    ['```\n<div></div>\n```', 'NEWS_HTML_FENCE_MALFORMED'],
    ['앞 prose\n```html\n<div></div>\n```', 'NEWS_HTML_TEXT_OUTSIDE_FENCE'],
  ])('rejects malformed HTML fence: %s', (value, expected) => expect(codes(response({ 6: value }))).toContain(expected))

  it('rejects multiline scalar fields while preserving prose blank lines', () => {
    expect(codes(response({ 0: '첫 줄\n둘째 줄' }))).toContain('NEWS_SCALAR_MULTILINE')
    expect(parseNewsResponse(response({ 7: '첫 문단\n\n둘째 문단' })).candidate?.imagePrompt).toBe('첫 문단\n\n둘째 문단')
  })
})
