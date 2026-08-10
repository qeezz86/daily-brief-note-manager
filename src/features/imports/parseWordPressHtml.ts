import type { ImportCategory } from './importValidation.types'
import { normalizeSourceUrl } from '../posts/publicationFields'
import {
  WORDPRESS_HTML_MAX_INPUT_BYTES,
  type WordPressCandidate,
  type WordPressChinesePreview,
  type WordPressExtractedSource,
  type WordPressHtmlIssue,
  type WordPressHtmlParserResult,
  type WordPressNewsIssuePreview,
} from './wordPressHtmlImport.types'

function normalizedText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function trimmedText(value: string | null | undefined) {
  return (value ?? '').trim()
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function candidate<T>(values: T[]): WordPressCandidate<T> {
  const distinct = unique(values)
  if (distinct.length === 0) return { state: 'missing', values: [], value: null }
  if (distinct.length > 1) return { state: 'ambiguous', values: distinct, value: null }
  return { state: 'detected', values: distinct, value: distinct[0] }
}

function compareCodePoints(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function candidateByKey<T>(
  values: T[],
  equivalenceKey: (value: T) => string,
  representative: (values: T[], key: string) => T,
): WordPressCandidate<T> {
  const groups = new Map<string, T[]>()
  values.forEach((value) => {
    const key = equivalenceKey(value)
    groups.set(key, [...(groups.get(key) ?? []), value])
  })
  const representatives = [...groups.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([key, group]) => representative(group, key))
  return candidate(representatives)
}

function classTokens(value: string) {
  return value.split(/\s+/).map((token) => token.trim()).filter(Boolean)
}

function hasWrapper(element: Element, wrapperClass: string) {
  const actual = new Set(classTokens(element.getAttribute('class') ?? ''))
  return classTokens(wrapperClass).every((token) => actual.has(token))
}

function valuesFrom(elements: Element[]) {
  return elements.map((element) => normalizedText(element.textContent)).filter(Boolean)
}

function normalizedLabel(value: string | null | undefined) {
  return normalizedText(value).replace(/\s*[:：]\s*$/, '').toLocaleLowerCase('en-US')
}

function matchesLabel(value: string | null | undefined, labels: readonly string[]) {
  const normalized = normalizedLabel(value)
  return labels.some((label) => normalized === normalizedLabel(label))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function valuesFromLabelledElement(element: Element | null, preferHref: boolean) {
  if (!element) return []
  const anchors = [
    ...(element.matches('a[href]') ? [element as HTMLAnchorElement] : []),
    ...element.querySelectorAll<HTMLAnchorElement>('a[href]'),
  ]
  const hrefs = preferHref
    ? anchors.map((anchor) => anchor.getAttribute('href')?.trim() ?? '').filter(Boolean)
    : []
  if (hrefs.length > 0) return hrefs
  const value = trimmedText((element as HTMLElement).dataset.value ?? element.textContent)
  return value ? [value] : []
}

function labelledValues(root: Element | Document, labels: readonly string[], preferHref = false) {
  const values: string[] = []
  for (const dataField of root.querySelectorAll<HTMLElement>('[data-field]')) {
    if (!matchesLabel(dataField.dataset.field, labels)) continue
    values.push(...valuesFromLabelledElement(dataField, preferHref))
  }

  for (const row of root.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('th, td')
    if (cells.length < 2 || !matchesLabel(cells[0].textContent, labels)) continue
    values.push(...valuesFromLabelledElement(cells[1], preferHref))
  }

  for (const term of root.querySelectorAll('dt')) {
    if (!matchesLabel(term.textContent, labels)) continue
    values.push(...valuesFromLabelledElement(term.nextElementSibling, preferHref))
  }

  const text = root instanceof Document ? root.documentElement.textContent ?? '' : root.textContent ?? ''
  for (const label of labels) {
    const labelPattern = label.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
    const matches = text.matchAll(new RegExp(`(?:^|\\n)\\s*${labelPattern}\\s*[:：]\\s*([^\\n]+)`, 'gim'))
    for (const match of matches) {
      const value = trimmedText(match[1])
      if (value) values.push(value)
    }
  }
  return values
}

function sectionValue(section: Element, labels: string[]) {
  for (const label of labels) {
    const labelled = [...section.querySelectorAll<HTMLElement>('[data-label], h3, h4, strong, dt')]
      .find((element) => normalizedText(element.dataset.label ?? element.textContent).includes(label))
    if (!labelled) continue
    const dataValue = labelled.dataset.value
    if (dataValue) return normalizedText(dataValue)
    const sibling = labelled.nextElementSibling
    if (sibling) return normalizedText(sibling.textContent)
    const parentText = normalizedText(labelled.parentElement?.textContent)
    if (parentText.startsWith(label)) return normalizedText(parentText.slice(label.length).replace(/^\s*[:：-]\s*/, ''))
  }
  return ''
}

function extractSources(document: Document): { sources: WordPressExtractedSource[]; issues: WordPressHtmlIssue[] } {
  const issues: WordPressHtmlIssue[] = []
  const sources: WordPressExtractedSource[] = []
  const containers = [...document.querySelectorAll('#sources, #source-check')]
  containers.forEach((container) => {
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      const sourceUrl = anchor.getAttribute('href')?.trim() ?? ''
      if (!sourceUrl) return
      let sourceName: string
      try { sourceName = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { sourceName = normalizedText(container.querySelector('.source-name')?.textContent) }
      const context = normalizedText(anchor.closest('li, p, article, section')?.textContent ?? anchor.textContent)
      sources.push({
        sourceName,
        sourceTitle: normalizedText(anchor.textContent) || context,
        sourceUrl,
        sourcePublishedAt: null,
        checkedPoint: context || normalizedText(container.textContent),
      })
    })
  })
  const byUrl = new Map<string, WordPressExtractedSource[]>()
  sources.forEach((source) => byUrl.set(source.sourceUrl, [...(byUrl.get(source.sourceUrl) ?? []), source]))
  byUrl.forEach((matches, url) => {
    const signatures = unique(matches.map((source) => `${source.sourceTitle}\u0000${source.checkedPoint}`))
    if (signatures.length > 1) issues.push({ code: 'SOURCE_CANDIDATE_AMBIGUOUS', severity: 'error', message: '같은 URL에 서로 다른 출처 후보가 있습니다. 저장 전에 하나로 정리해 주세요.', path: url })
  })
  return { sources, issues }
}

function extractNews(document: Document): WordPressNewsIssuePreview[] {
  return [...document.querySelectorAll<HTMLElement>('section[id^="issue-"]')].map((section) => ({
    id: section.id,
    heading: normalizedText(section.querySelector('h2')?.textContent),
    whatHappened: sectionValue(section, ['무엇이 있었나']),
    whyImportant: sectionValue(section, ['왜 중요한가']),
    impact: sectionValue(section, ['우리에게 미치는 영향']),
    watchPoint: sectionValue(section, ['앞으로 볼 포인트']),
    updateLabel: normalizedText(section.querySelector('.update-label')?.textContent),
  }))
}

function booleanCandidate(values: string[]) {
  const normalized = values.flatMap((value) => /^(true|예|포함)$/i.test(value.trim())
    ? [true]
    : /^(false|아니오|미포함)$/i.test(value.trim()) ? [false] : [])
  return candidateByKey(normalized, String, (_group, key) => key === 'true')
}

function chineseTextCandidate(document: Document, labels: readonly string[]) {
  const values = labelledValues(document, labels).map(trimmedText).filter(Boolean)
  return candidateByKey(values, (value) => value, (_group, key) => key)
}

function chineseUrlCandidate(roots: Element[], labels: readonly string[]) {
  const values = roots.flatMap((root) => labelledValues(root, labels, true))
    .map(normalizeSourceUrl)
    .filter(Boolean)
  return candidateByKey(values, (value) => value, (_group, key) => key)
}

function timestampEquivalenceKey(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `date:${trimmed}`
  if (!/(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return `local:${trimmed}`
  const timestamp = Date.parse(trimmed)
  return Number.isNaN(timestamp) ? `raw:${trimmed}` : `instant:${new Date(timestamp).toISOString()}`
}

function chineseTimestampCandidate(document: Document, labels: readonly string[]) {
  const values = labelledValues(document, labels).map(trimmedText).filter(Boolean)
  return candidateByKey(values, timestampEquivalenceKey, (_group, key) => key.slice(key.indexOf(':') + 1))
}

const CHINESE_LABEL_ALIASES = {
  programName: ['programName', '프로그램', '프로그램명', 'CCTV 프로그램명'],
  originalTitle: ['originalTitle', '원문 제목', 'CCTV 원문 제목'],
  originalUrl: ['originalUrl', '원문 URL', '개별 원문', '개별 원문 URL', '개별 기사 또는 영상 URL', '개별 기사·영상 URL', 'CCTV 개별 원문 URL'],
  originalPublishedAt: ['originalPublishedAt', '원문 게시 시각', '게시·업데이트 시간', '원문 게시·업데이트 시각', '게시일 또는 업데이트 시간', '방송일·게시일·업데이트 시간'],
  episodeListIncluded: ['episodeListIncluded', '본편 목록 포함', '본편 목록 포함 여부'],
  verifiedCoreFact: ['verifiedCoreFact', '검증 핵심 사실', '확인한 핵심 사실', '확인한 핵심 내용', '확인한 핵심 문장 또는 사실'],
} as const

const CHINESE_LABELS = Object.values(CHINESE_LABEL_ALIASES).flat()

function hasRecognizedChineseLabel(root: Element) {
  if ([...root.querySelectorAll<HTMLElement>('[data-field]')]
    .some((element) => matchesLabel(element.dataset.field, CHINESE_LABELS))) return true
  if ([...root.querySelectorAll('tr')]
    .some((row) => matchesLabel(row.querySelector('th, td')?.textContent, CHINESE_LABELS))) return true
  if ([...root.querySelectorAll('dt')]
    .some((term) => matchesLabel(term.textContent, CHINESE_LABELS))) return true

  const text = root.textContent ?? ''
  return CHINESE_LABELS.some((label) => {
    const labelPattern = label.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
    return new RegExp(`(?:^|\\n)\\s*${labelPattern}\\s*[:：]`, 'im').test(text)
  })
}

function extractChinese(document: Document): { chinese: WordPressChinesePreview; issues: WordPressHtmlIssue[] } {
  const sourceChecks = [...document.querySelectorAll('#source-check')].filter(hasRecognizedChineseLabel)
  const fields = {
    programName: chineseTextCandidate(document, CHINESE_LABEL_ALIASES.programName),
    originalTitle: chineseTextCandidate(document, CHINESE_LABEL_ALIASES.originalTitle),
    originalUrl: chineseUrlCandidate(sourceChecks, CHINESE_LABEL_ALIASES.originalUrl),
    originalPublishedAt: chineseTimestampCandidate(document, CHINESE_LABEL_ALIASES.originalPublishedAt),
    episodeListIncluded: booleanCandidate(labelledValues(document, CHINESE_LABEL_ALIASES.episodeListIncluded)),
    verifiedCoreFact: chineseTextCandidate(document, CHINESE_LABEL_ALIASES.verifiedCoreFact),
  }
  const issues = Object.entries(fields).flatMap(([field, value]) => value.state === 'ambiguous'
    ? [{
        code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS',
        severity: 'error' as const,
        message: '서로 다른 CCTV source-check 후보가 있습니다. 저장 전에 값을 직접 확정해 주세요.',
        path: `metadata.${field}`,
      }]
    : [])
  return {
    chinese: {
      programName: fields.programName.value ?? '',
      originalTitle: fields.originalTitle.value ?? '',
      originalUrl: fields.originalUrl.value ?? '',
      originalPublishedAt: fields.originalPublishedAt.value ?? '',
      episodeListIncluded: fields.episodeListIncluded.value,
      verifiedCoreFact: fields.verifiedCoreFact.value ?? '',
    },
    issues,
  }
}

function addAmbiguityIssue(issues: WordPressHtmlIssue[], value: WordPressCandidate<unknown>, code: string, message: string, path: string) {
  if (value.state === 'ambiguous') issues.push({ code, severity: 'error', message, path })
}

export function parseWordPressHtml(rawHtml: string, categories: ImportCategory[]): WordPressHtmlParserResult {
  const byteLength = new TextEncoder().encode(rawHtml).byteLength
  const issues: WordPressHtmlIssue[] = []
  const empty = !rawHtml.trim()
  if (empty) issues.push({ code: 'WORDPRESS_HTML_EMPTY', severity: 'error', message: '붙여넣을 WordPress HTML이 필요합니다.', path: '$' })
  if (byteLength > WORDPRESS_HTML_MAX_INPUT_BYTES) issues.push({ code: 'WORDPRESS_HTML_TOO_LARGE', severity: 'error', message: 'WordPress HTML은 UTF-8 기준 20 MiB 이하여야 합니다.', path: '$' })

  const blankResult = (): WordPressHtmlParserResult => ({
    rawHtml, byteLength, issues, categoryMatches: [], wrapperClasses: [],
    title: candidate([]), summary: candidate([]), publishedOn: candidate([]), displayId: candidate([]), seriesNo: candidate([]), slug: candidate([]), wordpressUrl: candidate([]),
    sources: [], newsIssues: [], changeLog: '', watchPoints: '', previousContentLinks: [], contentNotes: [],
    chinese: { programName: '', originalTitle: '', originalUrl: '', originalPublishedAt: '', episodeListIncluded: null, verifiedCoreFact: '' },
  })
  if (empty || byteLength > WORDPRESS_HTML_MAX_INPUT_BYTES) return blankResult()

  const document = new DOMParser().parseFromString(rawHtml, 'text/html')
  const wrappers = [...document.querySelectorAll<HTMLElement>('.daily-brief-note')]
  const categoryMatches = categories.filter((category) => category.enabled && wrappers.some((wrapper) => hasWrapper(wrapper, category.wrapperClass)))
  if (!wrappers.length) issues.push({ code: 'WORDPRESS_WRAPPER_MISSING', severity: 'error', message: '최상위 Daily Brief Note wrapper를 찾지 못했습니다.', path: 'htmlBody' })
  if (wrappers.length > 1) issues.push({ code: 'WORDPRESS_WRAPPER_AMBIGUOUS', severity: 'error', message: 'Daily Brief Note wrapper가 여러 개입니다.', path: 'htmlBody' })
  if (categoryMatches.length === 0) issues.push({ code: 'WORDPRESS_CATEGORY_UNKNOWN', severity: 'error', message: '활성 카테고리 설정과 일치하는 wrapper가 없습니다.', path: 'categoryId' })
  if (categoryMatches.length > 1) issues.push({ code: 'WORDPRESS_CATEGORY_AMBIGUOUS', severity: 'error', message: '여러 카테고리 wrapper가 감지되었습니다. 카테고리를 직접 선택해 주세요.', path: 'categoryId' })

  const title = candidate(valuesFrom([...document.querySelectorAll('h1')]))
  if (title.state === 'missing') issues.push({ code: 'WORDPRESS_TITLE_MISSING', severity: 'error', message: 'h1 제목 후보가 없습니다.', path: 'title' })
  if (title.state === 'ambiguous') issues.push({ code: 'WORDPRESS_TITLE_AMBIGUOUS', severity: 'error', message: '서로 다른 h1 제목 후보가 여러 개입니다.', path: 'title' })
  const summary = candidate(valuesFrom([...document.querySelectorAll('.intro, .summary-box')]))
  const briefMeta = valuesFrom([...document.querySelectorAll('.brief-meta')])
  const dateValues = unique(briefMeta.flatMap((text) => text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []))
  const displayValues = unique(briefMeta.flatMap((text) => text.match(/#[A-Za-z0-9-]+/g) ?? []))
  const seriesValues = unique(valuesFrom([...document.querySelectorAll('h1')]).flatMap((text) => {
    const match = text.match(/#\s*(\d+)\b/)
    return match ? [Number(match[1])] : []
  }))
  const canonicalUrls = unique([...document.querySelectorAll<HTMLLinkElement>('link[rel~="canonical"][href]')].map((link) => link.getAttribute('href')?.trim() ?? '').filter(Boolean))
  const explicitSlugs = unique([
    ...[...document.querySelectorAll<HTMLElement>('[data-slug]')].map((element) => element.dataset.slug?.trim() ?? ''),
    ...canonicalUrls.flatMap((url) => { try { return [new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? ''] } catch { return [] } }),
  ].filter(Boolean))
  const sourceResult = extractSources(document)
  issues.push(...sourceResult.issues)
  const chineseResult = categoryMatches.length === 1 && categoryMatches[0].contentGroup === 'chinese'
    ? extractChinese(document)
    : { chinese: blankResult().chinese, issues: [] }
  issues.push(...chineseResult.issues)

  const publishedOn = candidate(dateValues)
  const displayId = candidate(displayValues)
  const seriesNo = candidate(seriesValues)
  const slug = candidate(explicitSlugs)
  const wordpressUrl = candidate(canonicalUrls)
  addAmbiguityIssue(issues, publishedOn, 'WORDPRESS_DATE_AMBIGUOUS', '서로 다른 발행일 후보가 여러 개입니다.', 'publishedOn')
  addAmbiguityIssue(issues, displayId, 'WORDPRESS_DISPLAY_ID_AMBIGUOUS', '서로 다른 표시 ID 후보가 여러 개입니다.', 'displayId')
  addAmbiguityIssue(issues, seriesNo, 'WORDPRESS_SERIES_NO_AMBIGUOUS', '서로 다른 시리즈 번호 후보가 여러 개입니다.', 'seriesNo')
  addAmbiguityIssue(issues, slug, 'WORDPRESS_SLUG_AMBIGUOUS', '서로 다른 slug 후보가 여러 개입니다.', 'slug')
  addAmbiguityIssue(issues, wordpressUrl, 'WORDPRESS_URL_AMBIGUOUS', '서로 다른 WordPress URL 후보가 여러 개입니다.', 'wordpressUrl')

  if (document.querySelector('script')) issues.push({ code: 'HTML_SCRIPT_NOT_ALLOWED', severity: 'error', message: 'script 요소는 저장할 수 없습니다.', path: 'htmlBody' })
  if (document.querySelector('iframe')) issues.push({ code: 'HTML_IFRAME_NOT_ALLOWED', severity: 'error', message: 'iframe 요소는 저장할 수 없습니다.', path: 'htmlBody' })
  if ([...document.querySelectorAll('*')].some((element) => [...element.attributes].some((attribute) => /^on/i.test(attribute.name)))) issues.push({ code: 'HTML_EVENT_HANDLER_NOT_ALLOWED', severity: 'error', message: 'inline event handler는 저장할 수 없습니다.', path: 'htmlBody' })
  if ([...document.querySelectorAll('[href], [src]')].some((element) => /^(?:\s)*javascript:/i.test(element.getAttribute('href') ?? element.getAttribute('src') ?? ''))) issues.push({ code: 'HTML_JAVASCRIPT_URL_NOT_ALLOWED', severity: 'error', message: 'javascript: URL은 저장할 수 없습니다.', path: 'htmlBody' })
  if (document.querySelector('[style]')) issues.push({ code: 'HTML_INLINE_STYLE', severity: 'warning', message: 'legacy mode에서는 inline style을 경고로 표시합니다.', path: 'htmlBody' })

  const registeredTokens = new Set(categories.flatMap((category) => classTokens(category.wrapperClass)))
  const structuralTokens = new Set(['intro', 'summary-box', 'brief-meta', 'content-note', 'update-label', 'source-name'])
  const unknownClass = [...document.querySelectorAll<HTMLElement>('[class]')].flatMap((element) => classTokens(element.className)).find((token) => !registeredTokens.has(token) && !structuralTokens.has(token))
  if (unknownClass) issues.push({ code: 'HTML_UNKNOWN_CLASS', severity: 'warning', message: `등록되지 않은 class(${unknownClass})는 legacy mode 경고입니다.`, path: 'htmlBody' })

  return {
    rawHtml,
    byteLength,
    issues,
    categoryMatches,
    wrapperClasses: wrappers.map((wrapper) => wrapper.className),
    title,
    summary,
    publishedOn,
    displayId,
    seriesNo,
    slug,
    wordpressUrl,
    sources: sourceResult.sources,
    newsIssues: extractNews(document),
    changeLog: normalizedText(document.querySelector('#change-log')?.textContent),
    watchPoints: normalizedText(document.querySelector('#watch-points')?.textContent),
    previousContentLinks: unique([...document.querySelectorAll<HTMLAnchorElement>('a[href*="previous"], .previous-content a[href]')].map((anchor) => anchor.getAttribute('href')?.trim() ?? '').filter(Boolean)),
    contentNotes: valuesFrom([...document.querySelectorAll('.content-note')]),
    chinese: chineseResult.chinese,
  }
}
