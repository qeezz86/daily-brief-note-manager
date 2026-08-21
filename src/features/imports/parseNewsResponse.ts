import { NEWS_RESPONSE_HEADINGS, type NewsResponseCandidate, type NewsResponseIssue, type NewsResponseIssueCode, type NewsResponseParseResult } from './newsResponseImport.types'

function issue(code: NewsResponseIssueCode, message: string, path: string): NewsResponseIssue {
  return { code, status: 'invalid', message, path }
}

function normalizeDocument(input: string) {
  return input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim()
}

function parseList(value: string, path: string, minimum: number, maximum: number, countCode: NewsResponseIssueCode, issues: NewsResponseIssue[]) {
  const trimmed = value.trim()
  const lines = trimmed ? trimmed.split('\n') : []
  if (!lines.length || lines.some((line) => !line.startsWith('- ') || !line.slice(2).trim())) {
    issues.push(issue(path === 'checklist' && !lines.length ? 'NEWS_CHECKLIST_REQUIRED' : 'NEWS_LIST_MALFORMED', '각 항목은 비어 있지 않은 정확한 `- ` 목록이어야 하며 목록 안에 빈 줄을 둘 수 없습니다.', path))
    return []
  }
  const values = lines.map((line) => line.slice(2).trim())
  if (values.length < minimum || values.length > maximum) issues.push(issue(countCode, minimum === maximum ? `${minimum}개 항목이 필요합니다.` : `${minimum}~${maximum}개 항목이 필요합니다.`, path))
  return values
}

function parseHtmlFence(value: string, issues: NewsResponseIssue[]) {
  const lines = value.trim().split('\n')
  const fenceIndexes = lines.map((line, index) => line.startsWith('```') ? index : -1).filter((index) => index >= 0)
  if (fenceIndexes.length > 2) {
    issues.push(issue('NEWS_HTML_MULTIPLE_CODE_BLOCKS', 'HTML section에는 소문자 html code block 하나만 허용됩니다.', 'wordpressHtml'))
    return ''
  }
  if (fenceIndexes.length === 2 && (fenceIndexes[0] !== 0 || fenceIndexes[1] !== lines.length - 1)) {
    issues.push(issue('NEWS_HTML_TEXT_OUTSIDE_FENCE', 'HTML fence 앞뒤에는 다른 prose를 둘 수 없습니다.', 'wordpressHtml'))
    return ''
  }
  if (fenceIndexes.length !== 2 || lines[0] !== '```html' || lines.at(-1) !== '```') {
    issues.push(issue('NEWS_HTML_FENCE_MALFORMED', 'HTML은 정확한 소문자 `html` fenced code block 하나여야 합니다.', 'wordpressHtml'))
    return ''
  }
  const html = lines.slice(1, -1).join('\n')
  if (!html.trim()) issues.push(issue('NEWS_REQUIRED_FIELD_EMPTY', 'WordPress HTML이 비어 있습니다.', 'wordpressHtml'))
  return html
}

export function parseNewsResponse(input: string): NewsResponseParseResult {
  const issues: NewsResponseIssue[] = []
  const normalized = normalizeDocument(input)
  if (!normalized) return { candidate: null, issues: [issue('NEWS_EMPTY_INPUT', '붙여넣은 응답이 비어 있습니다.', 'input')] }
  const lines = normalized.split('\n')
  const found: Array<{ headingIndex: number; lineIndex: number }> = []
  lines.forEach((line, lineIndex) => {
    const heading = line.replace(/^[\t ]+|[\t ]+$/gu, '')
    const headingIndex = NEWS_RESPONSE_HEADINGS.indexOf(heading as typeof NEWS_RESPONSE_HEADINGS[number])
    if (headingIndex >= 0) found.push({ headingIndex, lineIndex })
    else if (/^\d+\.[\t ]*\S/u.test(heading)) issues.push(issue('NEWS_UNKNOWN_STRUCTURAL_SECTION', '정확한 canonical section 제목만 사용할 수 있습니다.', `line.${lineIndex + 1}`))
  })
  NEWS_RESPONSE_HEADINGS.forEach((heading, headingIndex) => {
    const matches = found.filter((entry) => entry.headingIndex === headingIndex)
    if (!matches.length) issues.push(issue('NEWS_MISSING_SECTION', `${heading} section이 없습니다.`, `sections.${headingIndex + 1}`))
    if (matches.length > 1) issues.push(issue('NEWS_DUPLICATE_SECTION', `${heading} section이 중복되었습니다.`, `sections.${headingIndex + 1}`))
  })
  if (found[0]?.lineIndex !== 0) issues.push(issue('NEWS_PREAMBLE_INVALID', '첫 section 앞에는 preamble을 둘 수 없습니다.', 'preamble'))
  if (found.some((entry, index) => index > 0 && entry.headingIndex <= found[index - 1].headingIndex)) issues.push(issue('NEWS_SECTION_ORDER_INVALID', '10개 section은 canonical 순서를 따라야 합니다.', 'sections'))
  const ordered = NEWS_RESPONSE_HEADINGS.map((_, headingIndex) => found.find((entry) => entry.headingIndex === headingIndex) ?? null)
  if (ordered.some((entry) => entry === null) || issues.some((item) => item.code === 'NEWS_DUPLICATE_SECTION' || item.code === 'NEWS_SECTION_ORDER_INVALID' || item.code === 'NEWS_PREAMBLE_INVALID' || item.code === 'NEWS_UNKNOWN_STRUCTURAL_SECTION')) return { candidate: null, issues }
  const sections = ordered.map((entry, index) => lines.slice(entry!.lineIndex + 1, ordered[index + 1]?.lineIndex ?? lines.length).join('\n').trim())
  for (const [index, path] of [[0, 'representativeTitle'], [2, 'metaDescription'], [3, 'slug'], [4, 'focusKeyword'], [8, 'imageAlt']] as const) {
    if (!sections[index]) issues.push(issue('NEWS_REQUIRED_FIELD_EMPTY', '필수 section 값이 비어 있습니다.', path))
    else if (sections[index].includes('\n')) issues.push(issue('NEWS_SCALAR_MULTILINE', '이 필드는 정확히 한 줄이어야 합니다.', path))
  }
  if (!sections[7]) issues.push(issue('NEWS_REQUIRED_FIELD_EMPTY', '대표 이미지 프롬프트가 비어 있습니다.', 'imagePrompt'))
  const alternativeTitles = parseList(sections[1], 'alternativeTitles', 4, 4, 'NEWS_ALTERNATIVE_TITLE_COUNT_INVALID', issues)
  const tags = parseList(sections[5], 'tags', 5, 8, 'NEWS_TAG_COUNT_INVALID', issues)
  const wordpressHtml = parseHtmlFence(sections[6], issues)
  const checklist = parseList(sections[9], 'checklist', 1, Number.MAX_SAFE_INTEGER, 'NEWS_CHECKLIST_REQUIRED', issues)
  if (sections[9].trim() && !sections[9].trim().split('\n').every((line) => line.startsWith('- '))) issues.push(issue('NEWS_EPILOGUE_INVALID', '마지막 checklist 뒤에는 epilogue를 둘 수 없습니다.', 'epilogue'))
  if (issues.length) return { candidate: null, issues }
  return { candidate: {
    representativeTitle: sections[0], alternativeTitles: alternativeTitles as NewsResponseCandidate['alternativeTitles'], metaDescription: sections[2],
    slug: sections[3], focusKeyword: sections[4], tags, wordpressHtml, imagePrompt: sections[7], imageAlt: sections[8], checklist, sources: [],
  }, issues: [] }
}
