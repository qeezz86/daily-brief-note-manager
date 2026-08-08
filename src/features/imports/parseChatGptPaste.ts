import type {
  ChatGptPasteBlockingIssue,
  ChatGptPasteIgnoredField,
  ChatGptPasteNormalizedPreview,
  ChatGptPasteParserResult,
  ChatGptPastePersistencePayload,
  ChatGptPasteWarning,
} from './chatGptPaste.types'

export const CHATGPT_PASTE_MAX_INPUT_BYTES = 20 * 1024 * 1024
export const CHATGPT_PASTE_MAX_JSON_STRING_BYTES = 5 * 1024 * 1024
export const CHATGPT_PASTE_MAX_JSON_DEPTH = 30

const recognizedSections = [
  'CONTENT_META_JSON',
  'SEO_JSON',
  'IMAGE_PROMPT_JSON',
  'SOURCES_JSON',
  'WORDPRESS_HTML',
  'NEWS_TRACKING_JSON',
] as const
const requiredSections = recognizedSections.slice(0, 5)
type RecognizedSection = (typeof recognizedSections)[number]

const forbiddenFieldKeys = new Set([
  'owner', 'ownerid', 'userid', 'auth', 'authuid', 'session', 'accesstoken',
  'refreshtoken', 'rawpaste', 'sourceimporttype', 'provenance',
])
const forbiddenPropertyKeys = new Set(['__proto__', 'constructor', 'prototype'])

interface SectionBlock {
  name: string
  body: string
}

class JsonInspectionError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function blocking(code: string, message: string, path: string): ChatGptPasteBlockingIssue {
  return { kind: 'blocking', code, message, path }
}

function warning(code: string, message: string, path: string): ChatGptPasteWarning {
  return { kind: 'warning', code, message, path }
}

function normalizeKey(key: string) {
  return key.replace(/[_-]/g, '').toLocaleLowerCase('en-US')
}

function isForbiddenKey(key: string) {
  return forbiddenPropertyKeys.has(key) || forbiddenFieldKeys.has(normalizeKey(key))
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: ChatGptPasteBlockingIssue[],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForbiddenFields(item, `${path}[${index}]`, issues))
    return
  }
  if (!isRecord(value)) return
  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`
    if (isForbiddenKey(key)) {
      issues.push(blocking('FORBIDDEN_FIELD', '소유자, 인증, 세션, 원문, provenance 또는 안전하지 않은 예약 필드는 입력할 수 없습니다.', childPath))
    }
    inspectForbiddenFields(child, childPath, issues)
  })
}

function collectUnsupportedFields(
  section: string,
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  ignoredFields: ChatGptPasteIgnoredField[],
  warnings: ChatGptPasteWarning[],
) {
  Object.keys(value).sort().forEach((field) => {
    if (allowed.has(field) || isForbiddenKey(field)) return
    const fieldPath = `${path}.${field}`
    ignoredFields.push({ section, path: fieldPath, field })
    warnings.push(warning('UNSUPPORTED_FIELD_IGNORED', '지원 범위 밖 필드는 미리보기에만 알리고 저장에서 제외합니다.', fieldPath))
  })
}

function inspectJsonGrammar(source: string, section: string) {
  let index = 0
  const encoder = new TextEncoder()

  function fail(code: string, message: string, path = section): never {
    throw new JsonInspectionError(code, path, message)
  }

  function skipWhitespace() {
    while (index < source.length && /\s/.test(source[index])) index += 1
  }

  function parseString(path: string) {
    if (source[index] !== '"') fail('MALFORMED_JSON', 'JSON 문자열 문법이 올바르지 않습니다.', path)
    const start = index
    index += 1
    let escaped = false
    while (index < source.length) {
      const character = source[index]
      if (!escaped && character === '"') {
        index += 1
        let decoded: unknown
        try {
          decoded = JSON.parse(source.slice(start, index))
        } catch {
          fail('MALFORMED_JSON', 'JSON 문자열 escape가 올바르지 않습니다.', path)
        }
        if (typeof decoded !== 'string') fail('MALFORMED_JSON', 'JSON 문자열을 해석하지 못했습니다.', path)
        if (encoder.encode(decoded).byteLength > CHATGPT_PASTE_MAX_JSON_STRING_BYTES) {
          fail('JSON_STRING_LIMIT_EXCEEDED', '개별 JSON 문자열은 5 MiB 이하여야 합니다.', path)
        }
        return decoded
      }
      if (!escaped && character.charCodeAt(0) < 0x20) fail('MALFORMED_JSON', 'JSON 문자열에 허용되지 않는 제어 문자가 있습니다.', path)
      if (!escaped && character === '\\') escaped = true
      else escaped = false
      index += 1
    }
    fail('MALFORMED_JSON', '닫히지 않은 JSON 문자열이 있습니다.', path)
  }

  function parseNumber(path: string) {
    const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!match) fail('MALFORMED_JSON', 'JSON 숫자 문법이 올바르지 않습니다.', path)
    index += match[0].length
  }

  function parseValue(depth: number, path: string): void {
    skipWhitespace()
    if (index >= source.length) fail('MALFORMED_JSON', 'JSON 값이 누락되었습니다.', path)
    const character = source[index]
    if (character === '"') {
      parseString(path)
      return
    }
    if (character === '{') {
      if (depth > CHATGPT_PASTE_MAX_JSON_DEPTH) fail('JSON_NESTING_LIMIT_EXCEEDED', 'JSON 중첩은 30단계 이하여야 합니다.', path)
      index += 1
      skipWhitespace()
      const keys = new Set<string>()
      if (source[index] === '}') { index += 1; return }
      while (index < source.length) {
        const key = parseString(path)
        const keyPath = `${path}.${key}`
        if (keys.has(key)) fail('DUPLICATE_JSON_KEY', '같은 object 안의 JSON 키를 중복해서 사용할 수 없습니다.', keyPath)
        keys.add(key)
        skipWhitespace()
        if (source[index] !== ':') fail('MALFORMED_JSON', 'JSON object의 콜론이 누락되었습니다.', keyPath)
        index += 1
        parseValue(depth + 1, keyPath)
        skipWhitespace()
        if (source[index] === '}') { index += 1; return }
        if (source[index] !== ',') fail('MALFORMED_JSON', 'JSON object 구분자가 올바르지 않습니다.', path)
        index += 1
        skipWhitespace()
      }
      fail('MALFORMED_JSON', '닫히지 않은 JSON object가 있습니다.', path)
    }
    if (character === '[') {
      if (depth > CHATGPT_PASTE_MAX_JSON_DEPTH) fail('JSON_NESTING_LIMIT_EXCEEDED', 'JSON 중첩은 30단계 이하여야 합니다.', path)
      index += 1
      skipWhitespace()
      if (source[index] === ']') { index += 1; return }
      let itemIndex = 0
      while (index < source.length) {
        parseValue(depth + 1, `${path}[${itemIndex}]`)
        skipWhitespace()
        if (source[index] === ']') { index += 1; return }
        if (source[index] !== ',') fail('MALFORMED_JSON', 'JSON 배열 구분자가 올바르지 않습니다.', path)
        index += 1
        itemIndex += 1
      }
      fail('MALFORMED_JSON', '닫히지 않은 JSON 배열이 있습니다.', path)
    }
    if (source.startsWith('true', index)) { index += 4; return }
    if (source.startsWith('false', index)) { index += 5; return }
    if (source.startsWith('null', index)) { index += 4; return }
    if (character === '-' || /\d/.test(character)) { parseNumber(path); return }
    fail('MALFORMED_JSON', '지원하지 않는 JSON token이 있습니다.', path)
  }

  parseValue(1, section)
  skipWhitespace()
  if (index !== source.length) fail('MALFORMED_JSON', 'JSON 뒤에 해석할 수 없는 문자가 있습니다.', section)
}

function parseJsonSection(
  block: SectionBlock | undefined,
  blockingIssues: ChatGptPasteBlockingIssue[],
): unknown {
  if (!block) return null
  try {
    inspectJsonGrammar(block.body, block.name)
    return JSON.parse(block.body) as unknown
  } catch (error) {
    if (error instanceof JsonInspectionError) {
      blockingIssues.push(blocking(error.code, error.message, error.path))
    } else {
      blockingIssues.push(blocking('MALFORMED_JSON', '표준 JSON 형식으로 해석할 수 없습니다.', block.name))
    }
    return null
  }
}

function extractSections(
  input: string,
  blockingIssues: ChatGptPasteBlockingIssue[],
  warnings: ChatGptPasteWarning[],
  ignoredFields: ChatGptPasteIgnoredField[],
) {
  const sections = new Map<string, SectionBlock>()
  const tagPattern = /^\[(\/)?([A-Za-z][A-Za-z0-9_]*)\][ \t\r]*$/gm
  const tags = [...input.matchAll(tagPattern)]
  let cursor = 0
  let active: { name: string; bodyStart: number } | null = null

  for (const tag of tags) {
    const tagStart = tag.index ?? 0
    const tagEnd = tagStart + tag[0].length
    const isClosing = Boolean(tag[1])
    const name = tag[2]
    if (!active) {
      if (input.slice(cursor, tagStart).trim()) {
        blockingIssues.push(blocking('SECTION_GRAMMAR_INVALID', '구조화 section 밖의 텍스트는 허용하지 않습니다.', '$'))
      }
      if (isClosing) {
        blockingIssues.push(blocking('SECTION_GRAMMAR_INVALID', '대응하는 시작 태그가 없는 종료 태그입니다.', name))
        cursor = tagEnd
        continue
      }
      active = { name, bodyStart: tagEnd }
      continue
    }
    if (!isClosing || name !== active.name) {
      blockingIssues.push(blocking('SECTION_GRAMMAR_INVALID', 'section은 중첩할 수 없고 시작·종료 태그가 일치해야 합니다.', active.name))
      active = null
      cursor = tagEnd
      continue
    }
    let body = input.slice(active.bodyStart, tagStart)
    body = body.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    if (sections.has(name)) {
      blockingIssues.push(blocking('DUPLICATE_SECTION', '같은 section을 두 번 사용할 수 없습니다.', name))
    } else {
      sections.set(name, { name, body })
      if (!recognizedSections.includes(name as RecognizedSection)) {
        ignoredFields.push({ section: name, path: name, field: name })
        warnings.push(warning('UNKNOWN_SECTION_IGNORED', '지원하지 않는 section은 저장에서 제외합니다.', name))
      }
    }
    active = null
    cursor = tagEnd
  }

  if (active) blockingIssues.push(blocking('SECTION_GRAMMAR_INVALID', '종료 태그가 없는 section이 있습니다.', active.name))
  if (!active && input.slice(cursor).trim()) blockingIssues.push(blocking('SECTION_GRAMMAR_INVALID', '구조화 section 밖의 텍스트는 허용하지 않습니다.', '$'))
  return sections
}

function requireOwnField(
  value: Record<string, unknown>,
  field: string,
  section: string,
  issues: ChatGptPasteBlockingIssue[],
) {
  if (!Object.hasOwn(value, field)) issues.push(blocking('MISSING_REQUIRED_FIELD', '필수 필드가 누락되었습니다.', `${section}.${field}`))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validateInertWordPressHtml(htmlBody: string, issues: ChatGptPasteBlockingIssue[]) {
  if (!htmlBody.trim()) return
  const document = new DOMParser().parseFromString(htmlBody, 'text/html')
  const topLevelElements = [...document.body.children]
  if (topLevelElements.length !== 1 || !topLevelElements[0].classList.contains('daily-brief-note')) {
    issues.push(blocking('INVALID_WORDPRESS_WRAPPER', 'Daily Brief Note 최상위 wrapper는 정확히 하나여야 합니다.', 'WORDPRESS_HTML'))
  }
  if (!topLevelElements[0]?.querySelector('h1')) {
    issues.push(blocking('MISSING_HTML_HEADING', 'WORDPRESS_HTML에는 h1이 필요합니다.', 'WORDPRESS_HTML'))
  }
  const unsafeElement = document.body.querySelector('script, iframe')
  const unsafeAttribute = [...document.body.querySelectorAll('*')].some((element) =>
    [...element.attributes].some((attribute) =>
      attribute.name.toLocaleLowerCase('en-US').startsWith('on')
      || attribute.value.trim().toLocaleLowerCase('en-US').startsWith('javascript:'),
    ),
  )
  if (unsafeElement || unsafeAttribute) {
    issues.push(blocking('UNSAFE_HTML', 'script, iframe, event handler 또는 javascript URL을 저장할 수 없습니다.', 'WORDPRESS_HTML'))
  }
}

function sortResult(result: ChatGptPasteParserResult) {
  const compare = (left: { path: string; code: string }, right: { path: string; code: string }) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  result.blockingIssues.sort(compare)
  result.warnings.sort(compare)
  result.ignoredFields.sort((left, right) => left.path.localeCompare(right.path) || left.field.localeCompare(right.field))
  return result
}

export function parseChatGptPaste(input: string): ChatGptPasteParserResult {
  const blockingIssues: ChatGptPasteBlockingIssue[] = []
  const warnings: ChatGptPasteWarning[] = []
  const ignoredFields: ChatGptPasteIgnoredField[] = []
  const baseResult: ChatGptPasteParserResult = {
    preview: null,
    persistencePayload: null,
    blockingIssues,
    warnings,
    ignoredFields,
    newsTracking: { present: false, updateCount: 0, followupCount: 0, persisted: false },
    saveEligibility: { isEligible: false, requiresWarningAcknowledgement: false },
  }

  const byteLength = new TextEncoder().encode(input).byteLength
  if (byteLength > CHATGPT_PASTE_MAX_INPUT_BYTES) {
    blockingIssues.push(blocking('INPUT_LIMIT_EXCEEDED', '전체 붙여넣기 입력은 20 MiB 이하여야 합니다.', '$'))
    return sortResult(baseResult)
  }
  if (!input.trim()) {
    blockingIssues.push(blocking('EMPTY_INPUT', '구조화 ChatGPT 응답을 붙여넣어 주세요.', '$'))
    return sortResult(baseResult)
  }

  const sections = extractSections(input, blockingIssues, warnings, ignoredFields)
  requiredSections.forEach((name) => {
    if (!sections.has(name)) blockingIssues.push(blocking('MISSING_REQUIRED_SECTION', '필수 section이 누락되었습니다.', name))
  })

  const contentValue = parseJsonSection(sections.get('CONTENT_META_JSON'), blockingIssues)
  const seoValue = parseJsonSection(sections.get('SEO_JSON'), blockingIssues)
  const imageValue = parseJsonSection(sections.get('IMAGE_PROMPT_JSON'), blockingIssues)
  const sourcesValue = parseJsonSection(sections.get('SOURCES_JSON'), blockingIssues)
  const trackingValue = parseJsonSection(sections.get('NEWS_TRACKING_JSON'), blockingIssues)
  const htmlBody = sections.get('WORDPRESS_HTML')?.body ?? ''

  ;[
    ['CONTENT_META_JSON', contentValue],
    ['SEO_JSON', seoValue],
    ['IMAGE_PROMPT_JSON', imageValue],
    ['SOURCES_JSON', sourcesValue],
    ['NEWS_TRACKING_JSON', trackingValue],
  ].forEach(([section, value]) => {
    if (value !== null) inspectForbiddenFields(value, String(section), blockingIssues)
  })

  if (!isRecord(contentValue)) blockingIssues.push(blocking('INVALID_SECTION_SHAPE', 'CONTENT_META_JSON은 object여야 합니다.', 'CONTENT_META_JSON'))
  if (!isRecord(seoValue)) blockingIssues.push(blocking('INVALID_SECTION_SHAPE', 'SEO_JSON은 object여야 합니다.', 'SEO_JSON'))
  if (!isRecord(imageValue)) blockingIssues.push(blocking('INVALID_SECTION_SHAPE', 'IMAGE_PROMPT_JSON은 object여야 합니다.', 'IMAGE_PROMPT_JSON'))
  if (!Array.isArray(sourcesValue)) blockingIssues.push(blocking('INVALID_SECTION_SHAPE', 'SOURCES_JSON은 배열이어야 합니다.', 'SOURCES_JSON'))
  if (sections.has('WORDPRESS_HTML') && !htmlBody.trim()) blockingIssues.push(blocking('MISSING_REQUIRED_FIELD', 'WORDPRESS_HTML 본문이 비어 있습니다.', 'WORDPRESS_HTML'))
  validateInertWordPressHtml(htmlBody, blockingIssues)

  if (isRecord(contentValue)) {
    const allowed = new Set(['contentGroup', 'category', 'displayId', 'title', 'slug', 'publishedOn', 'publishedAt', 'summary', 'seriesNo', 'wordpressUrl'])
    collectUnsupportedFields('CONTENT_META_JSON', contentValue, allowed, 'CONTENT_META_JSON', ignoredFields, warnings)
    ;['contentGroup', 'category', 'displayId', 'title', 'slug', 'publishedOn', 'publishedAt'].forEach((field) => requireOwnField(contentValue, field, 'CONTENT_META_JSON', blockingIssues))
    if (!['news', 'ai', 'info_db', 'chinese'].includes(String(contentValue.contentGroup))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '지원하는 contentGroup이 아닙니다.', 'CONTENT_META_JSON.contentGroup'))
    if (!nonEmptyString(contentValue.category)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'category는 비어 있지 않은 문자열이어야 합니다.', 'CONTENT_META_JSON.category'))
    if (!nullableString(contentValue.displayId)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'displayId는 문자열 또는 null이어야 합니다.', 'CONTENT_META_JSON.displayId'))
    if (!nonEmptyString(contentValue.title)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'title은 비어 있지 않은 문자열이어야 합니다.', 'CONTENT_META_JSON.title'))
    if (!nonEmptyString(contentValue.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contentValue.slug)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'slug 형식이 올바르지 않습니다.', 'CONTENT_META_JSON.slug'))
    if (!nonEmptyString(contentValue.publishedOn) || !validDate(contentValue.publishedOn)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'publishedOn은 YYYY-MM-DD 날짜여야 합니다.', 'CONTENT_META_JSON.publishedOn'))
    if (!nullableString(contentValue.publishedAt) || typeof contentValue.publishedAt === 'string' && Number.isNaN(Date.parse(contentValue.publishedAt))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'publishedAt은 datetime 문자열 또는 null이어야 합니다.', 'CONTENT_META_JSON.publishedAt'))
    if (Object.hasOwn(contentValue, 'summary') && !nonEmptyString(contentValue.summary)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'summary는 제공할 경우 비어 있지 않아야 합니다.', 'CONTENT_META_JSON.summary'))
    if (Object.hasOwn(contentValue, 'seriesNo') && contentValue.seriesNo !== null && (typeof contentValue.seriesNo !== 'number' || !Number.isInteger(contentValue.seriesNo) || contentValue.seriesNo < 1)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'seriesNo는 양의 정수 또는 null이어야 합니다.', 'CONTENT_META_JSON.seriesNo'))
    if (Object.hasOwn(contentValue, 'wordpressUrl') && contentValue.wordpressUrl !== null && (!nonEmptyString(contentValue.wordpressUrl) || !/^https?:\/\/\S+$/i.test(contentValue.wordpressUrl))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'wordpressUrl은 HTTP(S) URL 또는 null이어야 합니다.', 'CONTENT_META_JSON.wordpressUrl'))
  }

  if (isRecord(seoValue)) {
    const allowed = new Set(['representativeTitle', 'alternativeTitles', 'metaDescription', 'focusKeyword', 'tags'])
    collectUnsupportedFields('SEO_JSON', seoValue, allowed, 'SEO_JSON', ignoredFields, warnings)
    ;[...allowed].forEach((field) => requireOwnField(seoValue, field, 'SEO_JSON', blockingIssues))
    if (!nonEmptyString(seoValue.representativeTitle)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '대표 제목이 필요합니다.', 'SEO_JSON.representativeTitle'))
    if (!Array.isArray(seoValue.alternativeTitles) || seoValue.alternativeTitles.length !== 4 || seoValue.alternativeTitles.some((title) => !nonEmptyString(title))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '대안 제목은 비어 있지 않은 문자열 4개여야 합니다.', 'SEO_JSON.alternativeTitles'))
    if (!nonEmptyString(seoValue.metaDescription)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '메타 설명이 필요합니다.', 'SEO_JSON.metaDescription'))
    else if (seoValue.metaDescription.length < 120 || seoValue.metaDescription.length > 160) warnings.push(warning('SEO_META_LENGTH_WARNING', '메타 설명은 120–160자를 권장합니다.', 'SEO_JSON.metaDescription'))
    if (!nonEmptyString(seoValue.focusKeyword)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '포커스 키워드가 필요합니다.', 'SEO_JSON.focusKeyword'))
    if (!Array.isArray(seoValue.tags) || seoValue.tags.some((tag) => !nonEmptyString(tag))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'tags는 비어 있지 않은 문자열 배열이어야 합니다.', 'SEO_JSON.tags'))
    else {
      if (seoValue.tags.length < 5 || seoValue.tags.length > 8) warnings.push(warning('SEO_TAG_COUNT_WARNING', '태그는 5–8개를 권장합니다.', 'SEO_JSON.tags'))
      const normalizedTags = seoValue.tags.map((tag) => tag.trim().toLocaleLowerCase('ko-KR'))
      if (new Set(normalizedTags).size !== normalizedTags.length) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '완전히 같은 태그를 중복할 수 없습니다.', 'SEO_JSON.tags'))
    }
  }

  if (isRecord(imageValue)) {
    const allowed = new Set(['prompt', 'alt'])
    collectUnsupportedFields('IMAGE_PROMPT_JSON', imageValue, allowed, 'IMAGE_PROMPT_JSON', ignoredFields, warnings)
    ;[...allowed].forEach((field) => requireOwnField(imageValue, field, 'IMAGE_PROMPT_JSON', blockingIssues))
    if (!nonEmptyString(imageValue.prompt)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '이미지 prompt가 필요합니다.', 'IMAGE_PROMPT_JSON.prompt'))
    if (!nonEmptyString(imageValue.alt)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', '이미지 ALT가 필요합니다.', 'IMAGE_PROMPT_JSON.alt'))
  }

  if (Array.isArray(sourcesValue)) {
    sourcesValue.forEach((source, index) => {
      const path = `SOURCES_JSON[${index}]`
      if (!isRecord(source)) { blockingIssues.push(blocking('INVALID_SECTION_SHAPE', '각 source는 object여야 합니다.', path)); return }
      const allowed = new Set(['sourceName', 'sourceTitle', 'sourceUrl', 'sourcePublishedAt', 'checkedPoint'])
      collectUnsupportedFields('SOURCES_JSON', source, allowed, path, ignoredFields, warnings)
      ;[...allowed].forEach((field) => requireOwnField(source, field, path, blockingIssues))
      ;['sourceName', 'sourceTitle', 'checkedPoint'].forEach((field) => {
        if (!nonEmptyString(source[field])) blockingIssues.push(blocking('INVALID_FIELD_VALUE', `${field} 값이 필요합니다.`, `${path}.${field}`))
      })
      if (!nonEmptyString(source.sourceUrl) || !/^https?:\/\/\S+$/i.test(source.sourceUrl)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'sourceUrl은 개별 HTTP(S) URL이어야 합니다.', `${path}.sourceUrl`))
      if (!nullableString(source.sourcePublishedAt) || typeof source.sourcePublishedAt === 'string' && Number.isNaN(Date.parse(source.sourcePublishedAt))) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'sourcePublishedAt은 datetime 문자열 또는 null이어야 합니다.', `${path}.sourcePublishedAt`))
    })
  }

  if (sections.has('NEWS_TRACKING_JSON')) {
    baseResult.newsTracking.present = true
    if (!isRecord(trackingValue)) blockingIssues.push(blocking('INVALID_SECTION_SHAPE', 'NEWS_TRACKING_JSON은 object여야 합니다.', 'NEWS_TRACKING_JSON'))
    else {
      const allowed = new Set(['updates', 'followups'])
      collectUnsupportedFields('NEWS_TRACKING_JSON', trackingValue, allowed, 'NEWS_TRACKING_JSON', ignoredFields, warnings)
      if (Object.hasOwn(trackingValue, 'updates') && !Array.isArray(trackingValue.updates)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'updates는 배열이어야 합니다.', 'NEWS_TRACKING_JSON.updates'))
      if (Object.hasOwn(trackingValue, 'followups') && !Array.isArray(trackingValue.followups)) blockingIssues.push(blocking('INVALID_FIELD_VALUE', 'followups는 배열이어야 합니다.', 'NEWS_TRACKING_JSON.followups'))
      baseResult.newsTracking.updateCount = Array.isArray(trackingValue.updates) ? trackingValue.updates.length : 0
      baseResult.newsTracking.followupCount = Array.isArray(trackingValue.followups) ? trackingValue.followups.length : 0
      warnings.push(warning('NEWS_TRACKING_NOT_PERSISTED', 'NEWS_TRACKING_JSON은 인식하지만 이번 저장에는 포함하지 않습니다.', 'NEWS_TRACKING_JSON'))
    }
  }

  if (blockingIssues.length || !isRecord(contentValue) || !isRecord(seoValue) || !isRecord(imageValue) || !Array.isArray(sourcesValue)) {
    baseResult.saveEligibility.requiresWarningAcknowledgement = warnings.length > 0
    return sortResult(baseResult)
  }

  const typedSources = sourcesValue.filter(isRecord)
  const preview: ChatGptPasteNormalizedPreview = {
    contentGroup: contentValue.contentGroup as ChatGptPasteNormalizedPreview['contentGroup'],
    category: String(contentValue.category).trim(),
    displayId: typeof contentValue.displayId === 'string' ? contentValue.displayId.trim() || null : null,
    seriesNo: typeof contentValue.seriesNo === 'number' ? contentValue.seriesNo : null,
    title: String(contentValue.title).trim(),
    summary: typeof contentValue.summary === 'string' ? contentValue.summary.trim() : null,
    slug: String(contentValue.slug).trim(),
    publishedOn: String(contentValue.publishedOn),
    publishedAt: typeof contentValue.publishedAt === 'string' ? contentValue.publishedAt : null,
    wordpressUrl: typeof contentValue.wordpressUrl === 'string' ? contentValue.wordpressUrl.trim() : null,
    representativeTitle: String(seoValue.representativeTitle).trim(),
    alternativeTitles: (seoValue.alternativeTitles as string[]).map((title) => title.trim()),
    metaDescription: String(seoValue.metaDescription).trim(),
    focusKeyword: String(seoValue.focusKeyword).trim(),
    tags: (seoValue.tags as string[]).map((tag) => tag.trim()),
    imagePrompt: String(imageValue.prompt).trim(),
    imageAlt: String(imageValue.alt).trim(),
    sources: typedSources.map((source) => ({
      sourceName: String(source.sourceName).trim(),
      sourceTitle: String(source.sourceTitle).trim(),
      sourceUrl: String(source.sourceUrl).trim(),
      sourcePublishedAt: typeof source.sourcePublishedAt === 'string' ? source.sourcePublishedAt : null,
      checkedPoint: String(source.checkedPoint).trim(),
    })),
    wordpressHtml: htmlBody,
  }
  const persistencePayload: ChatGptPastePersistencePayload = {
    content: {
      content_group: preview.contentGroup,
      category_id: preview.category,
      display_id: preview.displayId,
      series_no: preview.seriesNo,
      title: preview.title,
      summary: preview.summary ?? preview.metaDescription,
      slug: preview.slug,
      published_on: preview.publishedOn,
      published_at: preview.publishedAt,
      wordpress_url: preview.wordpressUrl,
    },
    seo: {
      representative_title: preview.representativeTitle,
      alternative_titles: preview.alternativeTitles,
      meta_description: preview.metaDescription,
      focus_keyword: preview.focusKeyword,
      tags: preview.tags,
    },
    image: { prompt: preview.imagePrompt, alt: preview.imageAlt },
    sources: preview.sources.map((source) => ({
      source_name: source.sourceName,
      source_title: source.sourceTitle,
      source_url: source.sourceUrl,
      source_published_at: source.sourcePublishedAt,
      checked_point: source.checkedPoint,
    })),
    html_body: preview.wordpressHtml,
  }
  baseResult.preview = preview
  baseResult.persistencePayload = persistencePayload
  baseResult.saveEligibility = { isEligible: true, requiresWarningAcknowledgement: warnings.length > 0 }
  return sortResult(baseResult)
}
