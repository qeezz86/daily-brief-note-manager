import { applyCategoryPattern } from '../posts/postIdentifiers'
import {
  isBrandTag,
  isHttpUrl,
  MAX_TAG_LENGTH,
  normalizeSourceUrl,
  normalizeTag,
  sourceUrlWarning,
  tagComparisonKey,
} from '../posts/publicationFields'
import { findSeoTagComparisons } from '../posts/seoTagComparison'
import type { ChatGptPastePersistencePayload } from './chatGptPaste.types'
import {
  extractResponseImportSources,
  inspectResponseImportHtmlSecurity,
  normalizeResponseImportText,
} from './responseImportHtml'
import {
  type NonNewsResponseCandidate,
  type NonNewsResponseCategorySetting,
  type NonNewsResponseDerivedFields,
  type NonNewsResponseIssue,
  type NonNewsResponseIssueCode,
  type NonNewsResponseSourceCandidate,
  type NonNewsResponseValidationResult,
  type SupportedNonNewsResponseCategoryId,
} from './nonNewsResponseImport.types'

const categoryGroups: Record<SupportedNonNewsResponseCategoryId, NonNewsResponseDerivedFields['contentGroup']> = {
  'ai-column': 'ai',
  'info-db': 'info_db',
  'chinese-study': 'chinese',
}
const supportedCategories = Object.keys(categoryGroups) as SupportedNonNewsResponseCategoryId[]
const slugPattern = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/u
const unresolvedIdentifierPattern = /\[번호\]|###/u
const protectedFieldPattern = /(?:^|[\s{"'])(?:owner_id|user_id|session_id|auth_id|post_id|category_uuid|created_at|updated_at|status|source_import_type|provenance|service_role|supabase_(?:key|token)|wordpress_(?:password|credential)|api_(?:key|token)|rls)(?:[\s"'])*(?::|=)/imu

function issue(code: NonNewsResponseIssueCode, status: NonNewsResponseIssue['status'], message: string, path: string): NonNewsResponseIssue {
  return { code, status, message, path }
}

function normalizeHeadingText(value: string) {
  return normalizeResponseImportText(value)
}

function replaceExactIdentifier(value: string, rawPattern: string | null, resolved: string | null) {
  return rawPattern && resolved ? value.replaceAll(rawPattern, resolved) : value
}

export function extractNonNewsResponseSources(document: Document): NonNewsResponseSourceCandidate[] {
  return extractResponseImportSources(document, { includeSourceCheck: true, deduplicateByUrl: true })
}

function inspectElementTree(root: ParentNode, issues: NonNewsResponseIssue[]) {
  inspectResponseImportHtmlSecurity(root).forEach((finding) => {
    if (finding.kind === 'active-url-scheme') issues.push(issue('NON_NEWS_HTML_ACTIVE_URL_SCHEME', 'invalid', 'javascript:, data:, vbscript: URL은 사용할 수 없습니다.', 'wordpressHtml'))
    else if (finding.kind === 'element') issues.push(issue('NON_NEWS_HTML_EXECUTABLE_CONTENT', 'invalid', `허용되지 않은 <${finding.value}> 요소가 포함되어 있습니다.`, 'wordpressHtml'))
    else issues.push(issue('NON_NEWS_HTML_EXECUTABLE_CONTENT', 'invalid', `허용되지 않은 ${finding.value} 속성이 포함되어 있습니다.`, 'wordpressHtml'))
  })
}

function resolveCandidate(
  input: NonNewsResponseCandidate,
  category: NonNewsResponseCategorySetting,
  seriesNo: number,
) {
  const displayId = category.id === 'chinese-study' || !category.displayIdPattern
    ? null
    : applyCategoryPattern(category.displayIdPattern, { seriesNo })
  const expectedSlug = applyCategoryPattern(category.slugPattern, { seriesNo })
  const replace = (value: string) => category.id === 'chinese-study'
    ? value.replaceAll('[번호]', String(seriesNo))
    : replaceExactIdentifier(value, category.displayIdPattern, displayId)
  return {
    candidate: {
      ...input,
      representativeTitle: replace(input.representativeTitle),
      alternativeTitles: input.alternativeTitles.map(replace) as [string, string, string, string],
      slug: input.slug.includes('###') ? expectedSlug : input.slug,
      wordpressHtml: replace(input.wordpressHtml),
    },
    displayId,
    expectedSlug,
  }
}

function buildPayload(candidate: NonNewsResponseCandidate, derived: NonNewsResponseDerivedFields): ChatGptPastePersistencePayload {
  return {
    content: {
      content_group: derived.contentGroup,
      category_id: derived.categoryId,
      display_id: derived.displayId,
      series_no: derived.seriesNo,
      title: derived.title,
      summary: candidate.metaDescription,
      slug: candidate.slug,
      published_on: '',
      published_at: null,
      wordpress_url: null,
    },
    seo: {
      representative_title: candidate.representativeTitle,
      alternative_titles: [...candidate.alternativeTitles],
      meta_description: candidate.metaDescription,
      focus_keyword: candidate.focusKeyword,
      tags: [...candidate.tags],
    },
    image: { prompt: candidate.imagePrompt, alt: candidate.imageAlt },
    sources: candidate.sources.map((source) => ({
      source_name: source.sourceName,
      source_title: source.sourceTitle,
      source_url: source.sourceUrl,
      source_published_at: source.sourcePublishedAt || null,
      checked_point: source.checkedPoint,
    })),
    html_body: candidate.wordpressHtml,
  }
}

export function validateNonNewsResponse(
  input: NonNewsResponseCandidate,
  category: NonNewsResponseCategorySetting | null,
  seriesNo: number | null,
): NonNewsResponseValidationResult {
  const issues: NonNewsResponseIssue[] = []
  if (!category || !supportedCategories.includes(category.id as SupportedNonNewsResponseCategoryId) || !category.enabled || categoryGroups[category.id as SupportedNonNewsResponseCategoryId] !== category.contentGroup) {
    issues.push(issue('NON_NEWS_UNSUPPORTED_CATEGORY', 'invalid', '활성 AI 칼럼, 정보DB, 중국어 학습 카테고리만 선택할 수 있습니다.', 'category'))
    return { status: 'invalid', candidate: input, derived: null, issues, persistencePayload: null }
  }
  if (!seriesNo || !Number.isInteger(seriesNo) || seriesNo < 1) {
    issues.push(issue('NON_NEWS_REQUIRED_IDENTIFIER_UNRESOLVED', 'invalid', '1 이상의 시리즈 번호를 직접 입력해 주세요.', 'seriesNo'))
    return { status: 'invalid', candidate: input, derived: null, issues, persistencePayload: null }
  }

  const { candidate: resolvedBase, displayId, expectedSlug } = resolveCandidate(input, category, seriesNo)
  const document = new DOMParser().parseFromString(resolvedBase.wordpressHtml, 'text/html')
  const extractedSources = extractNonNewsResponseSources(document)
  const candidate = { ...resolvedBase, sources: input.sources.length ? input.sources : extractedSources }
  for (const [path, value] of [
    ['representativeTitle', candidate.representativeTitle],
    ['metaDescription', candidate.metaDescription],
    ['focusKeyword', candidate.focusKeyword],
    ['wordpressHtml', candidate.wordpressHtml],
    ['imagePrompt', candidate.imagePrompt],
    ['imageAlt', candidate.imageAlt],
  ] as const) {
    if (!value.trim()) issues.push(issue('NON_NEWS_REQUIRED_FIELD_EMPTY', 'invalid', '필수 검토 필드가 비어 있습니다.', path))
  }
  if (candidate.alternativeTitles.length !== 4 || candidate.alternativeTitles.some((title) => !title.trim())) {
    issues.push(issue('NON_NEWS_ALTERNATIVE_TITLE_COUNT_INVALID', 'invalid', '비어 있지 않은 SEO 대안 제목이 정확히 4개 필요합니다.', 'alternativeTitles'))
  }
  if (!candidate.checklist.length || candidate.checklist.some((item) => !item.trim())) {
    issues.push(issue('NON_NEWS_CHECKLIST_MALFORMED', 'invalid', '발행 전 체크리스트에는 비어 있지 않은 항목이 하나 이상 필요합니다.', 'checklist'))
  }
  const topLevel = Array.from(document.body.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE || Boolean(node.textContent?.trim()))
  const wrapper = topLevel.length === 1 && topLevel[0] instanceof HTMLElement ? topLevel[0] : null
  if (!wrapper || wrapper.tagName !== 'DIV' || !resolvedBase.wordpressHtml.trimEnd().endsWith('</div>')) {
    issues.push(issue('NON_NEWS_HTML_TOP_LEVEL_INVALID', 'invalid', 'WordPress HTML에는 최상위 wrapper div 하나만 있어야 합니다.', 'wordpressHtml'))
  } else {
    const actual = [...wrapper.classList].sort().join(' ')
    const expected = category.wrapperClass.trim().split(/\s+/u).sort().join(' ')
    if (actual !== expected) issues.push(issue('NON_NEWS_CATEGORY_WRAPPER_MISMATCH', 'invalid', '선택한 활성 카테고리의 wrapper class와 HTML wrapper가 일치하지 않습니다.', 'wordpressHtml'))
  }

  const headings = Array.from(document.querySelectorAll('h1'))
  if (headings.length !== 1) issues.push(issue('NON_NEWS_HTML_H1_COUNT_INVALID', 'invalid', 'WordPress HTML에는 h1이 정확히 하나 있어야 합니다.', 'wordpressHtml'))
  inspectElementTree(document, issues)
  if (candidate.imagePrompt && normalizeHeadingText(document.body.textContent ?? '').includes(normalizeHeadingText(candidate.imagePrompt))) {
    issues.push(issue('NON_NEWS_IMAGE_PROMPT_IN_HTML', 'invalid', '대표 이미지 프롬프트는 WordPress HTML 밖에 있어야 합니다.', 'wordpressHtml'))
  }

  const persistedValues = [
    candidate.representativeTitle, ...candidate.alternativeTitles, candidate.metaDescription, candidate.slug,
    candidate.focusKeyword, ...candidate.tags, candidate.wordpressHtml, candidate.imagePrompt, candidate.imageAlt,
    ...candidate.sources.flatMap((source) => Object.values(source)),
  ]
  if (persistedValues.some((value) => unresolvedIdentifierPattern.test(value))) {
    issues.push(issue('NON_NEWS_REQUIRED_IDENTIFIER_UNRESOLVED', 'invalid', '저장 필드에 [번호] 또는 ### 식별자 placeholder가 남아 있습니다.', 'candidate'))
  }
  if (protectedFieldPattern.test(persistedValues.join('\n'))) {
    issues.push(issue('NON_NEWS_PROTECTED_FIELD_MARKER', 'invalid', '보호되거나 서버가 소유하는 필드는 가져올 수 없습니다.', 'candidate'))
  }

  if (!slugPattern.test(candidate.slug)) issues.push(issue('NON_NEWS_SLUG_INVALID', 'invalid', 'slug는 영문 소문자, 숫자, 단일 하이픈 형식이어야 합니다.', 'slug'))
  if (candidate.slug !== expectedSlug) issues.push(issue('NON_NEWS_SLUG_PATTERN_MISMATCH', 'invalid', 'slug가 활성 카테고리 설정 패턴과 일치하지 않습니다.', 'slug'))

  const titleKeys = candidate.alternativeTitles.map((title) => title.trim().toLocaleLowerCase('ko-KR'))
  if (new Set(titleKeys).size !== titleKeys.length || titleKeys.includes(candidate.representativeTitle.trim().toLocaleLowerCase('ko-KR'))) {
    issues.push(issue('NON_NEWS_SEO_TITLE_DUPLICATE', 'invalid', '대표 제목과 대안 제목 4개는 서로 달라야 합니다.', 'alternativeTitles'))
  }
  const metaLength = [...candidate.metaDescription].length
  if (metaLength < 120 || metaLength > 160) issues.push(issue('NON_NEWS_META_DESCRIPTION_LENGTH_WARNING', 'warning', '메타 설명은 권장 120~160자 범위를 벗어났습니다.', 'metaDescription'))

  const normalizedTags = candidate.tags.map(normalizeTag)
  if (normalizedTags.length < 5 || normalizedTags.length > 8 || normalizedTags.some((tag) => !tag)) {
    issues.push(issue('NON_NEWS_TAG_COUNT_INVALID', 'invalid', '비어 있지 않은 SEO 태그가 5~8개 필요합니다.', 'tags'))
  }
  const tagKeys = normalizedTags.map(tagComparisonKey)
  if (new Set(tagKeys).size !== tagKeys.length || normalizedTags.some((tag) =>
    tag.length > MAX_TAG_LENGTH || isBrandTag(tag) || tagComparisonKey(tag) === tagComparisonKey(category.name) || tagComparisonKey(tag) === tagComparisonKey(headings[0]?.textContent ?? ''))) {
    issues.push(issue('NON_NEWS_SEO_TAG_INVALID', 'invalid', '태그 중복, 카테고리명·브랜드명·전체 제목 또는 길이 규칙을 확인해 주세요.', 'tags'))
  }
  if (findSeoTagComparisons(normalizedTags).some((comparison) => comparison.relation === 'normalized_duplicate')) {
    issues.push(issue('NON_NEWS_SEO_TAG_INVALID', 'invalid', '공백과 구분자를 정규화하면 중복되는 태그가 있습니다.', 'tags'))
  }
  if (findSeoTagComparisons(normalizedTags).some((comparison) => comparison.relation === 'possible_near_duplicate')) {
    issues.push(issue('NON_NEWS_SEO_TAG_NEAR_DUPLICATE_WARNING', 'warning', '서로 매우 비슷한 태그가 있습니다. 저장 전에 확인해 주세요.', 'tags'))
  }

  if (!candidate.sources.length) issues.push(issue('NON_NEWS_SOURCE_REQUIRED', 'invalid', 'HTML의 출처 section에서 출처를 추출하거나 직접 입력해 주세요.', 'sources'))
  const extractedSourceKeys = new Set(extractedSources.filter((source) => source.sourceUrl).map((source) => normalizeSourceUrl(source.sourceUrl)))
  if (candidate.sources.some((source) => source.sourceUrl && !extractedSourceKeys.has(normalizeSourceUrl(source.sourceUrl)))) {
    issues.push(issue('NON_NEWS_SOURCE_INVALID', 'invalid', '검토한 출처 URL은 현재 WordPress HTML의 출처 section에도 있어야 합니다.', 'sources'))
  }
  candidate.sources.forEach((source, index) => {
    if (!source.sourceName.trim() || !source.sourceTitle.trim() || !source.checkedPoint.trim() || !isHttpUrl(source.sourceUrl) || source.sourcePublishedAt && Number.isNaN(Date.parse(source.sourcePublishedAt))) {
      issues.push(issue('NON_NEWS_SOURCE_INVALID', 'invalid', '출처 기관·제목·절대 HTTP(S) URL·확인 포인트를 입력하고 시각 형식을 확인해 주세요.', `sources.${index}`))
    }
    const warning = sourceUrlWarning(source.sourceUrl)
    if (warning) issues.push(issue('NON_NEWS_SOURCE_URL_WARNING', 'warning', warning, `sources.${index}.sourceUrl`))
  })

  const title = headings.length === 1 ? normalizeHeadingText(headings[0].textContent ?? '') : ''
  if (!title) issues.push(issue('NON_NEWS_REQUIRED_FIELD_EMPTY', 'invalid', 'h1에서 저장 제목을 결정할 수 없습니다.', 'title'))
  const derived: NonNewsResponseDerivedFields = {
    categoryId: category.id as SupportedNonNewsResponseCategoryId,
    contentGroup: category.contentGroup as NonNewsResponseDerivedFields['contentGroup'],
    seriesNo,
    displayId,
    title,
    summary: candidate.metaDescription,
    status: 'draft',
  }
  const hasInvalid = issues.some((candidateIssue) => candidateIssue.status === 'invalid')
  const status = hasInvalid ? 'invalid' : issues.length ? 'warning' : 'valid'
  return {
    status,
    candidate,
    derived,
    issues,
    persistencePayload: hasInvalid ? null : buildPayload(candidate, derived),
  }
}
