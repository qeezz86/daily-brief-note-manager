import { describe, expect, it } from 'vitest'
import { NON_NEWS_RESPONSE_HEADINGS } from './nonNewsResponseImport.types'
import { parseNonNewsResponse } from './parseNonNewsResponse'

function response({
  title = 'AI 시대의 업무 설계',
  alternatives = ['AI 업무 대안 1', 'AI 업무 대안 2', 'AI 업무 대안 3', 'AI 업무 대안 4'],
  tags = ['인공지능', '업무혁신', '생산성', '자동화', '디지털전환'],
  wrapper = 'daily-brief-note ai-column',
  slug = 'ai-###',
  htmlExtra = '',
} = {}) {
  const sections = [
    title,
    alternatives.map((item) => `- ${item}`).join('\n'),
    '업무 현장에서 인공지능을 안전하게 적용하는 방법을 설명하는 메타 설명입니다.',
    slug,
    'AI 업무 혁신',
    tags.map((item) => `- ${item}`).join('\n'),
    `\`\`\`html\n<div class="${wrapper}"><h1>${title}</h1>${htmlExtra}<section id="sources"><p data-source-name="기관" data-checked-point="핵심 확인"><a href="https://example.com/article">원문</a></p></section></div>\n\`\`\``,
    '미니멀한 사무 공간과 협업하는 사람들을 담은 대표 이미지',
    'AI 도구로 협업하는 사무실 장면',
    '- 제목과 본문 확인\n- 출처 링크 확인',
  ]
  return NON_NEWS_RESPONSE_HEADINGS.map((heading, index) => `${heading}\n${sections[index]}`).join('\n\n')
}

function codes(input: string) {
  return parseNonNewsResponse(input).issues.map((item) => item.code)
}

describe('parseNonNewsResponse', () => {
  it('parses the exact ten-section AI-column response', () => {
    const result = parseNonNewsResponse(response())
    expect(result.issues).toEqual([])
    expect(result.candidate).toMatchObject({ representativeTitle: 'AI 시대의 업무 설계', slug: 'ai-###', tags: ['인공지능', '업무혁신', '생산성', '자동화', '디지털전환'] })
  })

  it('parses a valid InfoDB response without inferring its category', () => {
    const result = parseNonNewsResponse(response({ wrapper: 'daily-brief-note info-db', slug: 'info-db-###' }))
    expect(result.candidate?.wordpressHtml).toContain('daily-brief-note info-db')
    expect(result.candidate).not.toHaveProperty('category')
  })

  it('keeps the Chinese [번호] placeholder in a valid raw parse', () => {
    const result = parseNonNewsResponse(response({ title: 'CCTV 뉴스로 배우는 중국어 #[번호]', wrapper: 'daily-brief-note chinese-study', slug: 'cctv-chinese-news-###' }))
    expect(result.candidate?.representativeTitle).toContain('[번호]')
    expect(result.candidate?.wordpressHtml).toContain('[번호]')
  })

  it('reports a missing section with a stable code', () => {
    expect(codes(response().replace(`${NON_NEWS_RESPONSE_HEADINGS[2]}\n업무 현장에서 인공지능을 안전하게 적용하는 방법을 설명하는 메타 설명입니다.\n\n`, ''))).toContain('NON_NEWS_MISSING_SECTION')
  })

  it('reports duplicate and out-of-order sections', () => {
    expect(codes(`${response()}\n\n${NON_NEWS_RESPONSE_HEADINGS[0]}\n중복`)).toContain('NON_NEWS_DUPLICATE_SECTION')
    const swapped = response().replace(NON_NEWS_RESPONSE_HEADINGS[0], '__FIRST__').replace(NON_NEWS_RESPONSE_HEADINGS[1], NON_NEWS_RESPONSE_HEADINGS[0]).replace('__FIRST__', NON_NEWS_RESPONSE_HEADINGS[1])
    expect(codes(swapped)).toContain('NON_NEWS_SECTION_ORDER_INVALID')
  })

  it('requires exactly four alternative-title list items', () => {
    expect(codes(response({ alternatives: ['대안 1', '대안 2', '대안 3'] }))).toContain('NON_NEWS_ALTERNATIVE_TITLE_COUNT_INVALID')
    expect(codes(response().replace('- AI 업무 대안 1', 'AI 업무 대안 1'))).toContain('NON_NEWS_ALTERNATIVE_TITLE_LIST_MALFORMED')
  })

  it('requires five through eight exact tag list items', () => {
    expect(codes(response({ tags: ['하나', '둘', '셋', '넷'] }))).toContain('NON_NEWS_TAG_COUNT_INVALID')
    expect(codes(response({ tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }))).toContain('NON_NEWS_TAG_COUNT_INVALID')
    expect(codes(response().replace('- 인공지능', '인공지능'))).toContain('NON_NEWS_TAG_LIST_MALFORMED')
  })

  it('rejects malformed, missing, or multiple HTML fences', () => {
    expect(codes(response().replace('```html', '```HTML'))).toContain('NON_NEWS_HTML_FENCE_MALFORMED')
    expect(codes(response().replace('```html', '<!-- no fence -->'))).toContain('NON_NEWS_HTML_FENCE_MALFORMED')
    expect(codes(response().replace('</div>\n```', '</div>\n```\n```html\n<div></div>\n```'))).toContain('NON_NEWS_HTML_MULTIPLE_CODE_BLOCKS')
    expect(codes(response().replace('```html\n', '설명 문장\n```html\n'))).toContain('NON_NEWS_HTML_TEXT_OUTSIDE_FENCE')
  })

  it('rejects checklist prose and protected structural markers', () => {
    expect(codes(response().replace('- 제목과 본문 확인', '제목과 본문 확인'))).toContain('NON_NEWS_CHECKLIST_MALFORMED')
    for (const marker of ['owner_id: attacker', 'post_id: 00000000-0000-4000-8000-000000000001', 'api_token=secret']) {
      expect(codes(response().replace('AI 업무 혁신', marker))).toContain('NON_NEWS_PROTECTED_FIELD_MARKER')
    }
  })

  it('normalizes BOM and CRLF deterministically without rewriting section content', () => {
    const crlf = `\uFEFF  ${response({ htmlExtra: '\n<p>줄바꿈 보존</p>\n' })}  `.replace(/\n/gu, '\r\n')
    const parsed = parseNonNewsResponse(crlf)
    expect(parsed).toEqual(parseNonNewsResponse(crlf))
    expect(parsed.issues).toEqual([])
    expect(parsed.candidate?.wordpressHtml).toContain('</h1>\n<p>줄바꿈 보존</p>\n<section')
    expect(parsed.candidate?.wordpressHtml).not.toContain('\r')
    expect(parseNonNewsResponse(response()).candidate?.wordpressHtml).toContain('</h1><section')
  })

  it('does not recover fuzzy, Markdown, translated, or colon-suffixed headings', () => {
    for (const heading of ['# 1. SEO 입력용 대표 제목', '1. SEO 입력용 대표 타이틀', '1. Representative title', '1. SEO 입력용 대표 제목:']) {
      expect(codes(response().replace(NON_NEWS_RESPONSE_HEADINGS[0], heading))).toContain('NON_NEWS_UNKNOWN_STRUCTURAL_SECTION')
    }
  })
})
