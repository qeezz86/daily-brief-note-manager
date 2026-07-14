import { applyCategoryPattern } from '../posts/postIdentifiers'
import { postFormSchema } from '../posts/postFormSchema'
import { validateWordPressHtml } from '../posts/htmlValidation'
import {
  isHttpUrl,
  normalizeSourceUrl,
  normalizeTag,
  sourceUrlWarning,
  tagComparisonKey,
  validateHtmlSources,
} from '../posts/publicationFields'
import { contentStatuses } from '../posts/posts.types'
import { detectInternalDuplicates } from './detectInternalDuplicates'
import { importNewsTrackingSchema } from './importTracking.schema'
import { validateImportTrackingGraph } from './validateImportTrackingGraph'
import {
  CONTENT_IMPORT_FORMAT,
  CONTENT_IMPORT_SCHEMA_VERSION,
  IMPORT_VALIDATION_VERSION,
  MAX_IMPORT_POSTS,
} from './importValidation.constants'
import type {
  ExistingRecordSummary,
  ImportBundle,
  ImportCategory,
  ImportIssue,
  ImportItemValidationResult,
  ImportPost,
  ImportReferenceData,
  ImportValidationResult,
} from './importValidation.types'

const issueOrder = { error: 0, warning: 1, info: 2 } as const
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const slugPattern = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/
const topicKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function checksum(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function addIssue(issues: ImportIssue[], issue: ImportIssue) {
  const key = `${issue.code}|${issue.severity}|${issue.path}|${issue.relatedValue ?? ''}`
  if (!issues.some((candidate) => `${candidate.code}|${candidate.severity}|${candidate.path}|${candidate.relatedValue ?? ''}` === key)) {
    issues.push(issue)
  }
}

function issue(
  code: string,
  severity: ImportIssue['severity'],
  message: string,
  path: string,
  itemIndex?: number,
  relatedValue?: string,
  existingRecordSummary?: ExistingRecordSummary,
): ImportIssue {
  return { code, severity, message, path, itemIndex, relatedValue, existingRecordSummary }
}

function emptyPreview(index: number) {
  return {
    externalKey: null,
    categoryId: '',
    title: `항목 ${index + 1}`,
    slug: '',
    status: '',
    publishedOn: null,
    briefingDate: null,
    displayId: null,
    seriesNo: null,
    wordpressUrl: null,
    tags: [],
    sources: [],
    metadata: null,
    newsTracking: { present: false, topicCount: 0, updateCount: 0, followupCount: 0 },
    htmlBody: { present: false, length: 0, checksum: null },
  }
}

function coercePost(value: unknown): ImportPost {
  const record = asRecord(value) ?? {}
  const seo = asRecord(record.seo)
  const image = asRecord(record.image)
  const metadata = asRecord(record.metadata)
  const newsTracking = importNewsTrackingSchema.safeParse(record.newsTracking)
  const sources = Array.isArray(record.sources) ? record.sources.map((source) => {
    const row = asRecord(source) ?? {}
    return {
      sourceName: stringValue(row.sourceName),
      sourceTitle: stringValue(row.sourceTitle),
      sourceUrl: stringValue(row.sourceUrl),
      sourcePublishedAt: nullableString(row.sourcePublishedAt),
      checkedPoint: stringValue(row.checkedPoint),
    }
  }) : []
  return {
    externalKey: typeof record.externalKey === 'string' ? record.externalKey : undefined,
    categoryId: stringValue(record.categoryId),
    title: stringValue(record.title),
    summary: stringValue(record.summary),
    slug: stringValue(record.slug),
    status: contentStatuses.includes(record.status as ImportPost['status']) ? record.status as ImportPost['status'] : 'draft',
    briefingDate: nullableString(record.briefingDate),
    publishedOn: nullableString(record.publishedOn),
    publishedAt: nullableString(record.publishedAt),
    displayId: nullableString(record.displayId),
    seriesNo: typeof record.seriesNo === 'number' ? record.seriesNo : null,
    wordpressUrl: nullableString(record.wordpressUrl),
    htmlBody: nullableString(record.htmlBody),
    seo: seo ? {
      representativeTitle: stringValue(seo.representativeTitle),
      alternativeTitles: Array.isArray(seo.alternativeTitles) ? seo.alternativeTitles.filter((title): title is string => typeof title === 'string') : [],
      metaDescription: stringValue(seo.metaDescription),
      focusKeyword: stringValue(seo.focusKeyword),
    } : undefined,
    image: image ? { prompt: stringValue(image.prompt), alt: stringValue(image.alt) } : undefined,
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    sources,
    metadata,
    newsTracking: newsTracking.success ? newsTracking.data : null,
  }
}

const htmlIssueCodes: Record<string, string> = {
  'HTML 본문에 Markdown 코드 펜스가 포함되어 있습니다.': 'HTML_MARKDOWN_MIXED',
  'HTML 본문에 Markdown 문법이 혼합되어 있습니다.': 'HTML_MARKDOWN_MIXED',
  '마지막 wrapper div가 닫혀 있지 않습니다.': 'HTML_WRAPPER_NOT_CLOSED',
  '대표 이미지 프롬프트는 WordPress HTML 밖에 입력해 주세요.': 'HTML_IMAGE_PROMPT_EMBEDDED',
  '최상위 wrapper가 없습니다.': 'HTML_WRAPPER_MISSING',
  '카테고리 wrapper class가 일치하지 않습니다.': 'HTML_WRAPPER_MISMATCH',
  '본문에 h1 태그가 없습니다.': 'HTML_H1_MISSING',
  '허용되지 않은 script 태그가 포함되어 있습니다.': 'HTML_SCRIPT_FORBIDDEN',
  '허용되지 않은 iframe 태그가 포함되어 있습니다.': 'HTML_IFRAME_FORBIDDEN',
  'inline style 속성은 사용할 수 없습니다.': 'HTML_INLINE_STYLE',
  '중복된 HTML id가 포함되어 있습니다.': 'HTML_DUPLICATE_ID',
  'inline event handler는 사용할 수 없습니다.': 'HTML_EVENT_HANDLER',
  'javascript: URL은 사용할 수 없습니다.': 'HTML_JAVASCRIPT_URL',
  '등록되지 않은 class가 포함되어 있습니다.': 'HTML_UNKNOWN_CLASS',
}

function validateItem(
  raw: unknown,
  index: number,
  categories: ImportCategory[],
  mode: 'strict' | 'legacy',
): { post: ImportPost; result: ImportItemValidationResult } {
  const issues: ImportIssue[] = []
  const rawRecord = asRecord(raw)
  if (!rawRecord) {
    const result: ImportItemValidationResult = {
      index, externalKey: null, title: `항목 ${index + 1}`, categoryId: '', publishedOn: null,
      status: 'invalid', issues: [issue('ITEM_NOT_OBJECT', 'error', '게시물 항목은 object여야 합니다.', `posts[${index}]`, index)], normalizedPreview: emptyPreview(index),
    }
    return { post: coercePost({}), result }
  }
  const post = coercePost(raw)
  const path = (field: string) => `posts[${index}].${field}`
  if (typeof rawRecord.title !== 'string' || !post.title.trim()) addIssue(issues, issue('POST_TITLE_REQUIRED', 'error', '제목이 필요합니다.', path('title'), index))
  if (typeof rawRecord.summary !== 'string' || !post.summary.trim()) addIssue(issues, issue('POST_SUMMARY_REQUIRED', 'error', '요약이 필요합니다.', path('summary'), index))
  if (typeof rawRecord.categoryId !== 'string' || !post.categoryId.trim()) addIssue(issues, issue('POST_CATEGORY_REQUIRED', 'error', '카테고리가 필요합니다.', path('categoryId'), index))
  if (!contentStatuses.includes(rawRecord.status as ImportPost['status'])) addIssue(issues, issue('POST_STATUS_INVALID', 'error', '지원하지 않는 콘텐츠 상태입니다.', path('status'), index))
  if (!post.slug.trim() || !slugPattern.test(post.slug.trim())) addIssue(issues, issue('POST_SLUG_INVALID', 'error', 'slug는 영문 소문자, 숫자, 단일 하이픈 형식이어야 합니다.', path('slug'), index))
  for (const [field, value] of [['briefingDate', post.briefingDate], ['publishedOn', post.publishedOn]] as const) {
    if (value && !isValidDate(value)) addIssue(issues, issue('POST_DATE_INVALID', 'error', '날짜는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다.', path(field), index, value))
  }
  if (post.publishedAt && Number.isNaN(Date.parse(post.publishedAt))) addIssue(issues, issue('POST_DATETIME_INVALID', 'error', 'publishedAt은 시간대를 포함한 올바른 datetime이어야 합니다.', path('publishedAt'), index))
  if (post.wordpressUrl && !isHttpUrl(post.wordpressUrl)) addIssue(issues, issue('POST_WORDPRESS_URL_INVALID', 'error', 'WordPress URL은 절대 HTTP 또는 HTTPS URL이어야 합니다.', path('wordpressUrl'), index))

  const category = categories.find((candidate) => candidate.id === post.categoryId)
  if (!category && post.categoryId) addIssue(issues, issue('POST_CATEGORY_UNKNOWN', 'error', '등록되지 않은 카테고리입니다.', path('categoryId'), index, post.categoryId))
  if (category && !category.enabled) addIssue(issues, issue('POST_CATEGORY_INACTIVE', 'error', '비활성 카테고리는 가져올 수 없습니다.', path('categoryId'), index, post.categoryId))
  const isCompleteStatus = post.status === 'ready' || post.status === 'published'
  if (post.status === 'published' && !post.publishedOn) addIssue(issues, issue('POST_PUBLISHED_ON_REQUIRED', 'error', '발행됨 상태에는 발행일이 필요합니다.', path('publishedOn'), index))

  if (category) {
    if (category.contentGroup === 'news') {
      if (!post.briefingDate) addIssue(issues, issue('NEWS_BRIEFING_DATE_REQUIRED', 'error', '뉴스에는 브리핑 날짜가 필요합니다.', path('briefingDate'), index))
      if (post.seriesNo !== null && post.seriesNo !== undefined) addIssue(issues, issue('NEWS_SERIES_NOT_ALLOWED', 'error', '뉴스에는 시리즈 번호를 사용할 수 없습니다.', path('seriesNo'), index))
      const expectedDisplayId = category.displayIdPattern && post.briefingDate ? applyCategoryPattern(category.displayIdPattern, { date: post.briefingDate }) : null
      if (expectedDisplayId && post.displayId !== expectedDisplayId) addIssue(issues, issue('NEWS_DISPLAY_ID_INVALID', 'error', '표시 ID가 카테고리 설정과 일치하지 않습니다.', path('displayId'), index, expectedDisplayId))
      if (rawRecord.newsTracking != null) {
        const parsedTracking = importNewsTrackingSchema.safeParse(rawRecord.newsTracking)
        if (!parsedTracking.success) parsedTracking.error.issues.forEach((trackingIssue) => addIssue(issues, issue(
          trackingIssue.path.at(-1) === 'topicKey' ? 'NEWS_TOPIC_KEY_INVALID' : 'IMPORT_TRACKING_INVALID_PAYLOAD', 'error', trackingIssue.message,
          path(`newsTracking.${trackingIssue.path.join('.')}`), index,
        )))
        else validateImportTrackingGraph(parsedTracking.data).forEach((graphIssue) => addIssue(issues, issue(
          graphIssue.code, 'error', graphIssue.message, path(`newsTracking.${graphIssue.path}`), index,
        )))
      }
      if (isCompleteStatus && !(post.newsTracking?.updates.length)) addIssue(issues, issue('NEWS_UPDATES_REQUIRED', 'error', '발행 준비 또는 발행됨 뉴스에는 뉴스 항목이 1개 이상 필요합니다.', path('newsTracking.updates'), index))
      post.newsTracking?.topics.forEach((topic, topicIndex) => {
        if (!topicKeyPattern.test(topic.topicKey)) addIssue(issues, issue('NEWS_TOPIC_KEY_INVALID', 'error', '뉴스 주제 키는 영문 소문자·숫자·단일 하이픈 형식이어야 합니다.', path(`newsTracking.topics[${topicIndex}].topicKey`), index))
      })
    } else {
      if (rawRecord.newsTracking != null) addIssue(issues, issue('IMPORT_TRACKING_NOT_NEWS', 'error', '비뉴스 게시물에는 newsTracking을 포함할 수 없습니다.', path('newsTracking'), index))
      if (!Number.isInteger(post.seriesNo) || Number(post.seriesNo) < 1) addIssue(issues, issue('SERIES_NO_REQUIRED', 'error', '이 카테고리에는 1 이상의 정수 seriesNo가 필요합니다.', path('seriesNo'), index))
      if (category.contentGroup === 'chinese' && post.displayId) addIssue(issues, issue('CHINESE_DISPLAY_ID_NOT_ALLOWED', 'error', '중국어 학습에는 표시 ID를 사용할 수 없습니다.', path('displayId'), index))
      const expectedDisplayId = category.displayIdPattern && post.seriesNo ? applyCategoryPattern(category.displayIdPattern, { seriesNo: post.seriesNo }) : null
      if (category.contentGroup !== 'chinese' && expectedDisplayId && post.displayId !== expectedDisplayId) addIssue(issues, issue('SERIES_DISPLAY_ID_INVALID', 'error', '표시 ID가 카테고리 설정과 일치하지 않습니다.', path('displayId'), index, expectedDisplayId))
    }
    const expectedSlug = post.seriesNo || post.briefingDate
      ? applyCategoryPattern(category.slugPattern, { date: post.briefingDate, seriesNo: post.seriesNo })
      : null
    if (expectedSlug && post.slug !== expectedSlug) addIssue(issues, issue('POST_SLUG_PATTERN_MISMATCH', 'error', 'slug가 카테고리 설정 패턴과 일치하지 않습니다.', path('slug'), index, expectedSlug))
  }

  const metadata = post.metadata ?? {}
  if (category?.contentGroup === 'chinese') {
    const requiredFields = ['learningTopic', 'programName', 'originalTitle', 'originalUrl', 'originalPublishedAt', 'verifiedCoreFact'] as const
    if (isCompleteStatus) requiredFields.forEach((field) => {
      if (!stringValue(metadata[field]).trim()) addIssue(issues, issue(`CHINESE_${field.toUpperCase()}_REQUIRED`, 'error', '중국어 학습 필수 metadata가 누락되었습니다.', path(`metadata.${field}`), index))
    })
    if (isCompleteStatus && typeof metadata.episodeListIncluded !== 'boolean') addIssue(issues, issue('CHINESE_EPISODE_LIST_REQUIRED', 'error', '본편 목록 포함 여부는 boolean으로 명시해야 합니다.', path('metadata.episodeListIncluded'), index))
  }
  if (category?.contentGroup === 'ai' || category?.contentGroup === 'info_db') {
    if (isCompleteStatus && !stringValue(metadata.fieldName).trim()) addIssue(issues, issue('METADATA_FIELD_NAME_REQUIRED', 'error', '분야가 필요합니다.', path('metadata.fieldName'), index))
    if (isCompleteStatus && !['beginner', 'intermediate', 'advanced'].includes(stringValue(metadata.difficulty))) addIssue(issues, issue('METADATA_DIFFICULTY_INVALID', 'error', '난이도는 beginner, intermediate, advanced 중 하나여야 합니다.', path('metadata.difficulty'), index))
    const readMin = metadata.estimatedReadMin
    if (isCompleteStatus && (!Number.isInteger(readMin) || Number(readMin) < 1 || Number(readMin) > 600)) addIssue(issues, issue('METADATA_READ_MIN_INVALID', 'error', '예상 읽기 시간은 1~600 정수여야 합니다.', path('metadata.estimatedReadMin'), index))
    if (category.contentGroup === 'info_db' && metadata.referenceDate != null && (typeof metadata.referenceDate !== 'string' || !isValidDate(metadata.referenceDate))) addIssue(issues, issue('INFO_REFERENCE_DATE_INVALID', 'error', '기준일은 YYYY-MM-DD 형식이어야 합니다.', path('metadata.referenceDate'), index))
    if (category.contentGroup === 'info_db' && !metadata.referenceDate) addIssue(issues, issue('INFO_REFERENCE_DATE_EMPTY', 'warning', '정보DB 기준일이 비어 있습니다. 저장은 가능하지만 확인을 권장합니다.', path('metadata.referenceDate'), index))
  }

  const htmlBody = post.htmlBody ?? ''
  if (isCompleteStatus && !htmlBody.trim()) addIssue(issues, issue('HTML_REQUIRED', 'error', '발행 준비 또는 발행됨 상태에는 WordPress HTML이 필요합니다.', path('htmlBody'), index))
  if (htmlBody.trim() && category) {
    for (const message of validateWordPressHtml(htmlBody, category.wrapperClass, post.image?.prompt ?? '')) {
      const code = htmlIssueCodes[message] ?? 'HTML_INVALID'
      const legacyWarning = mode === 'legacy' && ['HTML_UNKNOWN_CLASS', 'HTML_INLINE_STYLE'].includes(code)
      addIssue(issues, issue(code, legacyWarning ? 'warning' : 'error', message, path('htmlBody'), index))
    }
  }

  const sources = post.sources ?? []
  sources.forEach((source, sourceIndex) => {
    if (!source.sourceName.trim() || !source.sourceTitle.trim() || !source.sourceUrl.trim() || !source.checkedPoint.trim()) addIssue(issues, issue('SOURCE_FIELDS_REQUIRED', 'error', '출처명·제목·URL·확인 핵심 내용이 필요합니다.', path(`sources[${sourceIndex}]`), index))
    if (source.sourceUrl && !isHttpUrl(source.sourceUrl)) addIssue(issues, issue('SOURCE_URL_INVALID', 'error', '출처 URL은 절대 HTTP 또는 HTTPS URL이어야 합니다.', path(`sources[${sourceIndex}].sourceUrl`), index))
    const warning = sourceUrlWarning(source.sourceUrl)
    if (warning) addIssue(issues, issue('SOURCE_URL_POSSIBLY_LISTING', 'warning', warning, path(`sources[${sourceIndex}].sourceUrl`), index))
    if (source.sourcePublishedAt && Number.isNaN(Date.parse(source.sourcePublishedAt))) addIssue(issues, issue('SOURCE_DATETIME_INVALID', 'error', '출처 게시·업데이트 시각이 올바르지 않습니다.', path(`sources[${sourceIndex}].sourcePublishedAt`), index))
  })
  if (isCompleteStatus && sources.length === 0) addIssue(issues, issue('SOURCE_REQUIRED', 'error', '발행 준비 또는 발행됨 상태에는 출처가 1개 이상 필요합니다.', path('sources'), index))
  if (htmlBody.trim() && sources.length > 0) validateHtmlSources(htmlBody, sources.map((source) => ({ ...source, sourcePublishedAt: source.sourcePublishedAt ?? '' }))).forEach((message) => addIssue(issues, issue('HTML_SOURCE_MISMATCH', 'error', message, path('sources'), index)))

  if (post.seo?.metaDescription && (post.seo.metaDescription.length < 120 || post.seo.metaDescription.length > 160)) addIssue(issues, issue('SEO_META_DESCRIPTION_LENGTH', 'warning', '메타 설명은 120~160자를 권장합니다.', path('seo.metaDescription'), index))

  const formResult = postFormSchema.safeParse({
    categoryId: post.categoryId, contentGroup: category?.contentGroup ?? '', categoryName: category?.name ?? '', title: post.title, summary: post.summary, slug: post.slug,
    contentStatus: post.status, briefingDate: post.briefingDate ?? '', publishedOn: post.publishedOn ?? '', wordpressUrl: post.wordpressUrl ?? '', htmlBody,
    representativeTitle: post.seo?.representativeTitle ?? '', alternativeTitles: post.seo?.alternativeTitles ?? ['', '', '', ''], metaDescription: post.seo?.metaDescription ?? '', focusKeyword: post.seo?.focusKeyword ?? '', imagePrompt: post.image?.prompt ?? '', imageAlt: post.image?.alt ?? '', tags: post.tags ?? [],
    sources: sources.map((source) => ({ ...source, sourcePublishedAt: source.sourcePublishedAt ?? '' })), learningTopic: stringValue(metadata.learningTopic), programName: stringValue(metadata.programName), originalTitle: stringValue(metadata.originalTitle), originalUrl: stringValue(metadata.originalUrl), originalPublishedAt: stringValue(metadata.originalPublishedAt), episodeListIncluded: typeof metadata.episodeListIncluded === 'boolean' ? String(metadata.episodeListIncluded) : '', verifiedCoreFact: stringValue(metadata.verifiedCoreFact), difficulty: stringValue(metadata.difficulty), learningPoints: stringValue(metadata.learningPoints), fieldName: stringValue(metadata.fieldName), metadataDifficulty: stringValue(metadata.difficulty), estimatedReadMin: metadata.estimatedReadMin == null ? '' : String(metadata.estimatedReadMin), referenceDate: stringValue(metadata.referenceDate),
  })
  if (!formResult.success) formResult.error.issues.forEach((formIssue) => addIssue(issues, issue('FORM_VALIDATION_ERROR', 'error', formIssue.message, path(formIssue.path.join('.')), index)))

  const normalizedPreview = {
    externalKey: post.externalKey?.trim() || null,
    categoryId: post.categoryId.trim(), title: post.title.trim(), slug: post.slug.trim(), status: post.status,
    publishedOn: post.publishedOn?.trim() || null, briefingDate: post.briefingDate?.trim() || null, displayId: post.displayId?.trim() || null,
    seriesNo: post.seriesNo ?? null, wordpressUrl: post.wordpressUrl ? normalizeSourceUrl(post.wordpressUrl) : null,
    tags: (post.tags ?? []).map((tag) => ({ name: normalizeTag(tag), comparisonKey: tagComparisonKey(tag) })),
    sources: sources.map((source) => ({ sourceUrl: source.sourceUrl, normalizedUrl: normalizeSourceUrl(source.sourceUrl) })), metadata: post.metadata ?? null,
    newsTracking: { present: Boolean(post.newsTracking), topicCount: post.newsTracking?.topics.length ?? 0, updateCount: post.newsTracking?.updates.length ?? 0, followupCount: post.newsTracking?.followups.length ?? 0 },
    htmlBody: { present: Boolean(htmlBody.trim()), length: htmlBody.length, checksum: htmlBody ? checksum(htmlBody) : null },
  }
  const result: ImportItemValidationResult = { index, externalKey: normalizedPreview.externalKey, title: normalizedPreview.title || `항목 ${index + 1}`, categoryId: normalizedPreview.categoryId, publishedOn: normalizedPreview.publishedOn, status: 'ready', issues, normalizedPreview }
  return { post, result }
}

function applyExistingDuplicates(items: ImportItemValidationResult[], posts: ImportPost[], referenceData: ImportReferenceData) {
  const existingBy = (predicate: (existing: ImportReferenceData['posts'][number]) => boolean) => referenceData.posts.find(predicate)
  posts.forEach((post, index) => {
    const result = items[index]
    const matches: Array<{ code: string; path: string; value: string; severity: 'error' | 'warning'; message: string; record?: ExistingRecordSummary }> = []
    const summarize = (existing: ImportReferenceData['posts'][number]): ExistingRecordSummary => ({ title: existing.title, categoryId: existing.categoryId, publishedOn: existing.publishedOn })
    const slug = post.slug.trim()
    const categoryId = post.categoryId.trim()
    const wordpressUrl = post.wordpressUrl?.trim()
    const briefingDate = post.briefingDate?.trim()
    const slugMatch = existingBy((existing) => existing.slug === slug)
    if (slugMatch) matches.push({ code: 'DB_SLUG_DUPLICATE', path: 'slug', value: slug, severity: 'error', message: '현재 데이터와 slug가 충돌합니다.', record: summarize(slugMatch) })
    const wordpressMatch = wordpressUrl ? existingBy((existing) => existing.wordpressUrl === wordpressUrl) : undefined
    if (wordpressMatch && wordpressUrl) matches.push({ code: 'DB_WORDPRESS_URL_DUPLICATE', path: 'wordpressUrl', value: normalizeSourceUrl(wordpressUrl), severity: 'error', message: '현재 데이터와 WordPress URL이 충돌합니다.', record: summarize(wordpressMatch) })
    const newsDateMatch = briefingDate ? existingBy((existing) => existing.categoryId === categoryId && existing.briefingDate === briefingDate) : undefined
    if (newsDateMatch && post.briefingDate) matches.push({ code: 'DB_NEWS_DATE_DUPLICATE', path: 'briefingDate', value: `${post.categoryId}|${post.briefingDate}`, severity: 'error', message: '현재 데이터와 뉴스 카테고리·브리핑 날짜가 충돌합니다.', record: summarize(newsDateMatch) })
    const seriesMatch = post.seriesNo ? existingBy((existing) => existing.categoryId === categoryId && existing.seriesNo === post.seriesNo) : undefined
    if (seriesMatch && post.seriesNo) matches.push({ code: 'DB_SERIES_DUPLICATE', path: 'seriesNo', value: `${post.categoryId}|${post.seriesNo}`, severity: 'error', message: '현재 데이터와 카테고리·시리즈 번호가 충돌합니다.', record: summarize(seriesMatch) })
    const metadata = post.metadata ?? {}
    const originalUrl = stringValue(metadata.originalUrl)
    const normalizedOriginalUrl = normalizeSourceUrl(originalUrl).toLocaleLowerCase('en-US')
    const chineseMatch = originalUrl ? referenceData.chineseUrls.find((candidate) => normalizeSourceUrl(candidate.originalUrl).toLocaleLowerCase('en-US') === normalizedOriginalUrl) : undefined
    if (chineseMatch) matches.push({ code: 'DB_CHINESE_URL_DUPLICATE', path: 'metadata.originalUrl', value: normalizeSourceUrl(originalUrl), severity: 'error', message: '현재 데이터와 중국어 원문 URL이 충돌합니다.', record: chineseMatch.post })
    post.newsTracking?.topics.forEach((topic, topicIndex) => {
      const topicMatch = referenceData.newsTopics.find((candidate) => candidate.categoryId === post.categoryId && tagComparisonKey(candidate.topicKey) === tagComparisonKey(topic.topicKey))
      if (!topicMatch) return
      const conflict = topicMatch.canonicalTitle.trim() !== topic.canonicalTitle.trim()
        || (topic.topicSummary !== null && topicMatch.topicSummary?.trim() !== topic.topicSummary.trim())
        || topicMatch.status !== topic.status
        || (topic.status === 'closed' && topicMatch.closedReason?.trim() !== topic.closedReason?.trim())
      matches.push({
        code: conflict ? 'IMPORT_TRACKING_TOPIC_CONFLICT' : 'DB_NEWS_TOPIC_REUSE_CANDIDATE',
        path: `newsTracking.topics[${topicIndex}].topicKey`, value: topic.topicKey,
        severity: conflict ? 'error' : 'warning',
        message: conflict ? '기존 주제의 제목·요약·상태를 덮어쓸 수 없습니다.' : '동일한 주제 키를 안전하게 재사용할 후보입니다.',
        record: { title: topicMatch.canonicalTitle, categoryId: topicMatch.categoryId, publishedOn: null },
      })
    })
    matches.forEach((match) => addIssue(result.issues, issue(match.code, match.severity, match.message, `posts[${index}].${match.path}`, index, match.value, match.record)))
  })
}

function finalizeItems(items: ImportItemValidationResult[]) {
  items.forEach((item) => {
    item.issues.sort((left, right) => issueOrder[left.severity] - issueOrder[right.severity] || left.code.localeCompare(right.code))
    const duplicate = item.issues.some((candidate) => candidate.severity === 'error' && candidate.code.startsWith('DUPLICATE_') || candidate.severity === 'error' && candidate.code.startsWith('DB_'))
    item.status = duplicate ? 'duplicate' : item.issues.some((candidate) => candidate.severity === 'error') ? 'invalid' : item.issues.some((candidate) => candidate.severity === 'warning') ? 'warning' : 'ready'
  })
}

export function validateImportBundle(
  input: unknown,
  referenceData: ImportReferenceData,
  databaseCheck: ImportValidationResult['databaseCheck'] = 'complete',
): ImportValidationResult {
  const bundleIssues: ImportIssue[] = []
  const root = asRecord(input)
  if (!root) addIssue(bundleIssues, issue('BUNDLE_NOT_OBJECT', 'error', '최상위 JSON은 object여야 합니다.', '$'))
  const format = root?.format
  const isBackupBundle = Boolean(root && (
    Object.hasOwn(root, 'data')
    || Object.hasOwn(root, 'backupFormat')
    || (typeof format === 'string' && format.toLocaleLowerCase('en-US').includes('backup'))
  ))
  if (isBackupBundle) {
    addIssue(bundleIssues, issue('BACKUP_BUNDLE_NOT_SUPPORTED', 'error', '전체 백업 JSON은 게시물 Import 파일이 아닙니다. 복구 기능은 Phase 4A-2 이후에 지원합니다.', '$'))
  } else if (!root || !Object.hasOwn(root, 'format')) {
    addIssue(bundleIssues, issue('MISSING_IMPORT_FORMAT', 'error', `format은 ${CONTENT_IMPORT_FORMAT}이어야 합니다.`, '$.format'))
  } else if (format !== CONTENT_IMPORT_FORMAT) {
    addIssue(bundleIssues, issue('UNSUPPORTED_IMPORT_FORMAT', 'error', '지원하지 않는 콘텐츠 Import format입니다.', '$.format', undefined, String(format)))
  }
  if (root?.schemaVersion !== CONTENT_IMPORT_SCHEMA_VERSION) addIssue(bundleIssues, issue('UNSUPPORTED_SCHEMA_VERSION', 'error', `schemaVersion은 ${CONTENT_IMPORT_SCHEMA_VERSION}이어야 합니다.`, '$.schemaVersion', undefined, String(root?.schemaVersion ?? 'missing')))
  if (!Array.isArray(root?.posts)) addIssue(bundleIssues, issue('BUNDLE_POSTS_REQUIRED', 'error', 'posts 배열이 필요합니다.', '$.posts'))
  const rawPosts = Array.isArray(root?.posts) ? root.posts : []
  if (Array.isArray(root?.posts) && rawPosts.length === 0) addIssue(bundleIssues, issue('BUNDLE_POSTS_EMPTY', 'error', 'posts 배열은 비어 있을 수 없습니다.', '$.posts'))
  if (rawPosts.length > MAX_IMPORT_POSTS) addIssue(bundleIssues, issue('BUNDLE_POST_LIMIT_EXCEEDED', 'error', `게시물은 최대 ${MAX_IMPORT_POSTS}개까지 검증할 수 있습니다.`, '$.posts'))
  const knownKeys = new Set(['format', 'schemaVersion', 'exportedAt', 'source', 'validationMode', 'posts'])
  if (root && !isBackupBundle) Object.keys(root).filter((key) => !knownKeys.has(key)).forEach((key) => addIssue(bundleIssues, issue('BUNDLE_UNKNOWN_FIELD', 'error', '허용되지 않은 최상위 필드가 있습니다.', `$.${key}`, undefined, key)))
  if (root?.exportedAt != null && (typeof root.exportedAt !== 'string' || Number.isNaN(Date.parse(root.exportedAt)))) addIssue(bundleIssues, issue('BUNDLE_EXPORTED_AT_INVALID', 'error', 'exportedAt은 올바른 datetime이어야 합니다.', '$.exportedAt'))
  if (root?.validationMode != null && !['strict', 'legacy'].includes(String(root.validationMode))) addIssue(bundleIssues, issue('BUNDLE_VALIDATION_MODE_INVALID', 'error', 'validationMode는 strict 또는 legacy여야 합니다.', '$.validationMode'))
  const mode = root?.validationMode === 'legacy' ? 'legacy' : 'strict'
  const limitedPosts = rawPosts.slice(0, MAX_IMPORT_POSTS)
  const validated = limitedPosts.map((post, index) => validateItem(post, index, referenceData.categories, mode))
  const posts = validated.map((entry) => entry.post)
  const items = validated.map((entry) => entry.result)
  detectInternalDuplicates(posts, items)
  if (databaseCheck !== 'unavailable') applyExistingDuplicates(items, posts, referenceData)
  if (databaseCheck === 'partial') items.forEach((item, index) => addIssue(item.issues, issue('DB_DUPLICATE_CHECK_PARTIAL', 'warning', '일부 DB 중복 후보를 확인하지 못했습니다. 확인된 결과만 표시합니다.', `posts[${index}]`, index)))
  if (databaseCheck === 'unavailable') items.forEach((item, index) => addIssue(item.issues, issue('DB_DUPLICATE_CHECK_UNAVAILABLE', 'warning', '현재 DB 중복을 확인하지 못했습니다. 구조 검증 결과만 표시합니다.', `posts[${index}]`, index)))
  finalizeItems(items)
  bundleIssues.sort((left, right) => issueOrder[left.severity] - issueOrder[right.severity] || left.code.localeCompare(right.code))
  const summary = {
    total: items.length,
    ready: items.filter((item) => item.status === 'ready').length,
    warning: items.filter((item) => item.status === 'warning').length,
    invalid: items.filter((item) => item.status === 'invalid').length,
    duplicate: items.filter((item) => item.status === 'duplicate').length,
    exactDuplicate: items.filter((item) => item.status === 'duplicate').length,
    possibleDuplicate: items.filter((item) => item.issues.some((candidate) => candidate.code === 'POSSIBLE_DUPLICATE_TITLE_DATE')).length,
  }
  const hasError = bundleIssues.some((candidate) => candidate.severity === 'error') || items.some((item) => item.status === 'invalid' || item.status === 'duplicate')
  const hasWarning = bundleIssues.some((candidate) => candidate.severity === 'warning') || items.some((item) => item.status === 'warning')
  return { validationVersion: IMPORT_VALIDATION_VERSION, status: hasError ? 'invalid' : hasWarning ? 'warning' : 'valid', schemaVersion: typeof root?.schemaVersion === 'number' ? root.schemaVersion : null, databaseCheck, summary, bundleIssues, items }
}

export function importInputErrorResult(error: { code: string; message: string; path?: string }): ImportValidationResult {
  return {
    validationVersion: IMPORT_VALIDATION_VERSION, status: 'invalid', schemaVersion: null, databaseCheck: 'unavailable',
    summary: { total: 0, ready: 0, warning: 0, invalid: 0, duplicate: 0, exactDuplicate: 0, possibleDuplicate: 0 },
    bundleIssues: [issue(error.code, 'error', error.message, error.path ?? '$')], items: [],
  }
}

export type { ImportBundle }
