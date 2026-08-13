import {
  NON_NEWS_RESPONSE_HEADINGS,
  type NonNewsResponseCandidate,
  type NonNewsResponseIssue,
  type NonNewsResponseIssueCode,
  type NonNewsResponseParseResult,
} from './nonNewsResponseImport.types'

function issue(code: NonNewsResponseIssueCode, message: string, path: string): NonNewsResponseIssue {
  return { code, status: 'invalid', message, path }
}

function normalizeDocument(input: string) {
  return input.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trim()
}

function parseList(
  value: string,
  malformedCode: NonNewsResponseIssueCode,
  countCode: NonNewsResponseIssueCode,
  path: string,
  minimum: number,
  maximum: number,
  issues: NonNewsResponseIssue[],
) {
  const lines = value.trim().split('\n')
  if (!value.trim() || lines.some((line) => !line.startsWith('- ') || !line.slice(2).trim())) {
    issues.push(issue(malformedCode, '각 항목은 비어 있지 않은 `- ` 목록이어야 합니다.', path))
    return []
  }
  const values = lines.map((line) => line.slice(2).trim())
  if (values.length < minimum || values.length > maximum) {
    issues.push(issue(countCode, `${minimum === maximum ? `${minimum}개` : `${minimum}~${maximum}개`} 항목이 필요합니다.`, path))
  }
  return values
}

function parseHtmlFence(value: string, issues: NonNewsResponseIssue[]) {
  const lines = value.trim().split('\n')
  const fenceLines = lines.filter((line) => line.startsWith('```'))
  if (fenceLines.length > 2) {
    issues.push(issue('NON_NEWS_HTML_MULTIPLE_CODE_BLOCKS', 'HTML section에는 코드 블록 하나만 허용됩니다.', 'wordpressHtml'))
    return ''
  }
  if (fenceLines.length === 2 && (lines[0] !== fenceLines[0] || lines.at(-1) !== fenceLines[1])) {
    issues.push(issue('NON_NEWS_HTML_TEXT_OUTSIDE_FENCE', 'HTML code fence 앞뒤에는 다른 text를 둘 수 없습니다.', 'wordpressHtml'))
    return ''
  }
  if (lines[0] !== '```html' || lines.at(-1) !== '```' || fenceLines.length !== 2) {
    issues.push(issue('NON_NEWS_HTML_FENCE_MALFORMED', 'HTML은 정확한 소문자 `html` fenced code block 하나여야 합니다.', 'wordpressHtml'))
    return ''
  }
  if (lines.slice(1, -1).some((line) => line.startsWith('```'))) {
    issues.push(issue('NON_NEWS_HTML_MULTIPLE_CODE_BLOCKS', 'HTML section에는 중첩되거나 추가된 코드 블록을 사용할 수 없습니다.', 'wordpressHtml'))
    return ''
  }
  const html = lines.slice(1, -1).join('\n')
  if (!html.trim()) issues.push(issue('NON_NEWS_REQUIRED_FIELD_EMPTY', 'WordPress HTML이 비어 있습니다.', 'wordpressHtml'))
  return html
}

function findSections(documentText: string, issues: NonNewsResponseIssue[]) {
  const lines = documentText.split('\n')
  const found: Array<{ headingIndex: number; lineIndex: number }> = []
  lines.forEach((line, lineIndex) => {
    const normalizedLine = line.replace(/^[\t ]+|[\t ]+$/gu, '')
    const headingIndex = NON_NEWS_RESPONSE_HEADINGS.indexOf(normalizedLine as typeof NON_NEWS_RESPONSE_HEADINGS[number])
    if (headingIndex >= 0) found.push({ headingIndex, lineIndex })
    else if (/^(?:#{1,6}[\t ]*)?\d+\.[\t ]+\S/u.test(normalizedLine)) {
      issues.push(issue('NON_NEWS_UNKNOWN_STRUCTURAL_SECTION', '정확한 canonical section 제목만 사용할 수 있습니다.', `line.${lineIndex + 1}`))
    }
  })

  for (let index = 0; index < NON_NEWS_RESPONSE_HEADINGS.length; index += 1) {
    const matches = found.filter((entry) => entry.headingIndex === index)
    if (!matches.length) issues.push(issue('NON_NEWS_MISSING_SECTION', `${NON_NEWS_RESPONSE_HEADINGS[index]} section이 없습니다.`, `sections.${index + 1}`))
    if (matches.length > 1) issues.push(issue('NON_NEWS_DUPLICATE_SECTION', `${NON_NEWS_RESPONSE_HEADINGS[index]} section이 중복되었습니다.`, `sections.${index + 1}`))
  }
  const firstOccurrences = found.filter((entry, index) => found.findIndex((candidate) => candidate.headingIndex === entry.headingIndex) === index)
  if (firstOccurrences.some((entry, index) => index > 0 && entry.headingIndex <= firstOccurrences[index - 1].headingIndex)) {
    issues.push(issue('NON_NEWS_SECTION_ORDER_INVALID', '10개 section은 canonical 순서를 따라야 합니다.', 'sections'))
  }
  if (found[0]?.lineIndex !== 0) {
    issues.push(issue('NON_NEWS_UNKNOWN_STRUCTURAL_SECTION', '첫 section 앞에는 preamble을 둘 수 없습니다.', 'preamble'))
  }
  return { lines, found }
}

const protectedFieldPattern = /(?:^|[\s{"'])(?:owner_id|user_id|session_id|auth_id|post_id|category_uuid|created_at|updated_at|status|source_import_type|provenance|service_role|supabase_(?:key|token)|wordpress_(?:password|credential)|api_(?:key|token)|rls)(?:[\s"'])*(?::|=)/imu

export function parseNonNewsResponse(input: string): NonNewsResponseParseResult {
  const issues: NonNewsResponseIssue[] = []
  const normalized = normalizeDocument(input)
  if (!normalized) return { candidate: null, issues: [issue('NON_NEWS_EMPTY_INPUT', '붙여넣은 응답이 비어 있습니다.', 'input')] }
  if (protectedFieldPattern.test(normalized)) {
    issues.push(issue('NON_NEWS_PROTECTED_FIELD_MARKER', '보호되거나 서버가 소유하는 필드는 응답에서 가져올 수 없습니다.', 'input'))
  }

  const { lines, found } = findSections(normalized, issues)
  const uniqueOrdered = NON_NEWS_RESPONSE_HEADINGS.map((_, headingIndex) => found.find((entry) => entry.headingIndex === headingIndex) ?? null)
  if (uniqueOrdered.some((entry) => entry === null)) return { candidate: null, issues }

  const sections = uniqueOrdered.map((entry, index) => {
    const start = entry!.lineIndex + 1
    const next = uniqueOrdered[index + 1]
    return lines.slice(start, next?.lineIndex ?? lines.length).join('\n').trim()
  })

  const scalarPaths = ['representativeTitle', '', 'metaDescription', 'slug', 'focusKeyword', '', '', 'imagePrompt', 'imageAlt'] as const
  scalarPaths.forEach((path, index) => {
    if (path && !sections[index].trim()) issues.push(issue('NON_NEWS_REQUIRED_FIELD_EMPTY', '필수 section 값이 비어 있습니다.', path))
  })
  for (const [index, path] of [[0, 'representativeTitle'], [2, 'metaDescription'], [3, 'slug'], [4, 'focusKeyword'], [8, 'imageAlt']] as const) {
    if (sections[index].trim().includes('\n')) issues.push(issue('NON_NEWS_REQUIRED_FIELD_EMPTY', '이 필드는 한 줄 값이어야 합니다.', path))
  }

  const alternativeTitles = parseList(sections[1], 'NON_NEWS_ALTERNATIVE_TITLE_LIST_MALFORMED', 'NON_NEWS_ALTERNATIVE_TITLE_COUNT_INVALID', 'alternativeTitles', 4, 4, issues)
  const tags = parseList(sections[5], 'NON_NEWS_TAG_LIST_MALFORMED', 'NON_NEWS_TAG_COUNT_INVALID', 'tags', 5, 8, issues)
  const wordpressHtml = parseHtmlFence(sections[6], issues)
  const checklist = parseList(sections[9], 'NON_NEWS_CHECKLIST_MALFORMED', 'NON_NEWS_CHECKLIST_MALFORMED', 'checklist', 1, Number.MAX_SAFE_INTEGER, issues)

  if (issues.length) return { candidate: null, issues }
  const candidate: NonNewsResponseCandidate = {
    representativeTitle: sections[0].trim(),
    alternativeTitles: alternativeTitles as [string, string, string, string],
    metaDescription: sections[2].trim(),
    slug: sections[3].trim(),
    focusKeyword: sections[4].trim(),
    tags,
    wordpressHtml,
    imagePrompt: sections[7].trim(),
    imageAlt: sections[8].trim(),
    checklist,
    sources: [],
  }
  return { candidate, issues: [] }
}
