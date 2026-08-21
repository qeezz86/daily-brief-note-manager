import { applyCategoryPattern } from '../posts/postIdentifiers'
import { isBrandTag, isHttpUrl, MAX_TAG_LENGTH, normalizeSourceUrl, normalizeTag, sourceUrlWarning, tagComparisonKey } from '../posts/publicationFields'
import { findSeoTagComparisons } from '../posts/seoTagComparison'
import type { ChatGptPastePersistencePayload } from './chatGptPaste.types'
import type {
  NewsResponseCandidate,
  NewsResponseCategorySetting,
  NewsResponseDerivedFields,
  NewsResponseIssue,
  NewsResponseIssueCode,
  NewsResponseSourceCandidate,
  NewsResponseValidationResult,
} from './newsResponseImport.types'
import { extractResponseImportSources, inspectResponseImportHtmlSecurity, normalizeResponseImportText } from './responseImportHtml'

const slugPattern = /^(?!-)(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/u
const unresolvedPattern = /YYYY-MM-DD|###|\[번호\]/u
const protectedFieldPattern = /(?:^|[\s{"'])(?:owner_id|user_id|session_id|auth_id|post_id|category_uuid|created_at|updated_at|status|source_import_type|provenance|service_role|supabase_(?:key|token)|wordpress_(?:password|credential)|api_(?:key|token)|rls)(?:[\s"'])*(?::|=)/imu

function issue(code: NewsResponseIssueCode, status: NewsResponseIssue['status'], message: string, path: string): NewsResponseIssue {
  return { code, status, message, path }
}

function isSemanticDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

function validDatePattern(value: string | null) {
  return Boolean(value?.trim() && value.includes('YYYY-MM-DD'))
}

export function extractNewsResponseSources(document: Document): NewsResponseSourceCandidate[] {
  return extractResponseImportSources(document)
}

function buildPayload(candidate: NewsResponseCandidate, derived: NewsResponseDerivedFields): ChatGptPastePersistencePayload {
  return {
    content: {
      content_group: 'news', category_id: derived.categoryId, display_id: derived.displayId, series_no: null,
      title: derived.title, summary: candidate.metaDescription, slug: candidate.slug, published_on: derived.briefingDate,
      published_at: null, wordpress_url: null,
    },
    seo: {
      representative_title: candidate.representativeTitle, alternative_titles: [...candidate.alternativeTitles],
      meta_description: candidate.metaDescription, focus_keyword: candidate.focusKeyword, tags: [...candidate.tags],
    },
    image: { prompt: candidate.imagePrompt, alt: candidate.imageAlt },
    sources: candidate.sources.map((source) => ({
      source_name: source.sourceName, source_title: source.sourceTitle, source_url: normalizeSourceUrl(source.sourceUrl),
      source_published_at: source.sourcePublishedAt || null, checked_point: source.checkedPoint,
    })),
    html_body: candidate.wordpressHtml,
  }
}

export function validateNewsResponse(
  input: NewsResponseCandidate,
  category: NewsResponseCategorySetting | null,
  briefingDate: string,
): NewsResponseValidationResult {
  const issues: NewsResponseIssue[] = []
  if (!category || !category.enabled || category.contentGroup !== 'news') {
    issues.push(issue('NEWS_UNSUPPORTED_CATEGORY', 'invalid', '활성 news 카테고리만 선택할 수 있습니다.', 'category'))
    return { status: 'invalid', candidate: input, derived: null, issues, persistencePayload: null }
  }
  if (!isSemanticDate(briefingDate)) issues.push(issue('NEWS_BRIEFING_DATE_INVALID', 'invalid', 'Asia/Seoul 의미의 YYYY-MM-DD 발행 기준일을 직접 입력해 주세요.', 'briefingDate'))
  if (!category.id.trim() || !category.name.trim() || !category.code.trim() || !category.wrapperClass.trim()
    || !validDatePattern(category.displayIdPattern) || !validDatePattern(category.slugPattern)) {
    issues.push(issue('NEWS_CATEGORY_PATTERN_INVALID', 'invalid', 'display ID와 slug 설정에는 대소문자가 정확한 YYYY-MM-DD placeholder가 필요합니다.', 'category'))
  }
  if (issues.some((item) => item.status === 'invalid')) return { status: 'invalid', candidate: input, derived: null, issues, persistencePayload: null }

  const displayId = applyCategoryPattern(category.displayIdPattern!, { date: briefingDate })
  const authoritativeSlug = applyCategoryPattern(category.slugPattern, { date: briefingDate })
  if (!displayId.trim() || !authoritativeSlug.trim() || unresolvedPattern.test(displayId) || unresolvedPattern.test(authoritativeSlug)) {
    issues.push(issue('NEWS_CATEGORY_PATTERN_INVALID', 'invalid', '카테고리 식별자 pattern을 완전히 해소할 수 없습니다.', 'category'))
  }

  const document = new DOMParser().parseFromString(input.wordpressHtml, 'text/html')
  const extractedSources = extractNewsResponseSources(document)
  const candidate = { ...input, sources: input.sources.map((source) => ({ ...source })) }
  for (const [path, value] of [
    ['representativeTitle', candidate.representativeTitle], ['metaDescription', candidate.metaDescription], ['focusKeyword', candidate.focusKeyword],
    ['wordpressHtml', candidate.wordpressHtml], ['imagePrompt', candidate.imagePrompt], ['imageAlt', candidate.imageAlt],
  ] as const) if (!value.trim()) issues.push(issue('NEWS_REQUIRED_FIELD_EMPTY', 'invalid', '필수 검토 필드가 비어 있습니다.', path))
  for (const [path, value] of [
    ['representativeTitle', candidate.representativeTitle], ['metaDescription', candidate.metaDescription], ['slug', candidate.slug],
    ['focusKeyword', candidate.focusKeyword], ['imageAlt', candidate.imageAlt],
  ] as const) if (/\r|\n/u.test(value)) issues.push(issue('NEWS_SCALAR_MULTILINE', 'invalid', '이 검토 필드는 한 줄 값이어야 합니다.', path))
  if (candidate.alternativeTitles.length !== 4 || candidate.alternativeTitles.some((title) => !title.trim())) issues.push(issue('NEWS_ALTERNATIVE_TITLE_COUNT_INVALID', 'invalid', '비어 있지 않은 SEO 대안 제목이 정확히 4개 필요합니다.', 'alternativeTitles'))
  if (!candidate.checklist.length || candidate.checklist.some((item) => !item.trim())) issues.push(issue('NEWS_CHECKLIST_REQUIRED', 'invalid', '발행 전 체크리스트에는 비어 있지 않은 항목이 하나 이상 필요합니다.', 'checklist'))

  const topLevel = Array.from(document.body.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE || Boolean(node.textContent?.trim()))
  const wrapper = topLevel.length === 1 && topLevel[0] instanceof HTMLElement ? topLevel[0] : null
  if (!wrapper || wrapper.tagName !== 'DIV' || !candidate.wordpressHtml.trimEnd().endsWith('</div>')) {
    issues.push(issue('NEWS_HTML_TOP_LEVEL_INVALID', 'invalid', 'WordPress HTML에는 최종 닫힘이 있는 최상위 wrapper div 하나만 있어야 합니다.', 'wordpressHtml'))
  } else {
    const actual = [...wrapper.classList].sort().join(' ')
    const expected = category.wrapperClass.trim().split(/\s+/u).sort().join(' ')
    if (actual !== expected) issues.push(issue('NEWS_CATEGORY_WRAPPER_MISMATCH', 'invalid', '선택한 활성 카테고리의 wrapper class 집합과 HTML wrapper가 정확히 일치해야 합니다.', 'wordpressHtml'))
  }
  const headings = Array.from(document.querySelectorAll('h1'))
  if (headings.length !== 1) issues.push(issue('NEWS_HTML_H1_COUNT_INVALID', 'invalid', 'WordPress HTML에는 h1이 정확히 하나 있어야 합니다.', 'wordpressHtml'))
  else if (normalizeResponseImportText(headings[0].textContent ?? '') !== normalizeResponseImportText(candidate.representativeTitle)) {
    issues.push(issue('NEWS_HTML_H1_TITLE_MISMATCH', 'invalid', 'h1 text는 대표 제목과 공백 정규화 후 정확히 일치해야 합니다.', 'representativeTitle'))
  }
  inspectResponseImportHtmlSecurity(document).forEach((finding) => {
    if (finding.kind === 'active-url-scheme') issues.push(issue('NEWS_HTML_ACTIVE_URL_SCHEME', 'invalid', 'javascript:, data:, vbscript: URL은 사용할 수 없습니다.', 'wordpressHtml'))
    else issues.push(issue('NEWS_HTML_EXECUTABLE_CONTENT', 'invalid', finding.kind === 'element' ? `허용되지 않은 <${finding.value}> 요소가 포함되어 있습니다.` : `허용되지 않은 ${finding.value} 속성이 포함되어 있습니다.`, 'wordpressHtml'))
  })
  const bodyText = normalizeResponseImportText(document.body.textContent ?? '')
  const normalizedPrompt = normalizeResponseImportText(candidate.imagePrompt)
  if ((normalizedPrompt && bodyText.includes(normalizedPrompt)) || /대표 이미지 프롬프트|IMAGE_PROMPT/iu.test(bodyText)) issues.push(issue('NEWS_IMAGE_PROMPT_IN_HTML', 'invalid', '대표 이미지 프롬프트는 WordPress HTML 밖에 있어야 합니다.', 'wordpressHtml'))

  if (!slugPattern.test(candidate.slug)) issues.push(issue('NEWS_SLUG_INVALID', 'invalid', 'slug는 영문 소문자, 숫자, 단일 하이픈 형식이어야 합니다.', 'slug'))
  if (candidate.slug !== authoritativeSlug) issues.push(issue('NEWS_SLUG_PATTERN_MISMATCH', 'invalid', '검토 slug는 카테고리 pattern과 명시적 날짜에서 파생한 authoritative slug와 정확히 일치해야 합니다.', 'slug'))
  const titleKeys = [candidate.representativeTitle, ...candidate.alternativeTitles].map((value) => normalizeResponseImportText(value).toLocaleLowerCase('ko-KR'))
  if (new Set(titleKeys).size !== titleKeys.length) issues.push(issue('NEWS_SEO_TITLE_DUPLICATE', 'invalid', '대표 제목과 대안 제목 4개는 서로 달라야 합니다.', 'alternativeTitles'))
  const metaLength = [...candidate.metaDescription].length
  if (metaLength < 120 || metaLength > 160) issues.push(issue('NEWS_META_DESCRIPTION_LENGTH_WARNING', 'warning', '메타 설명은 권장 120~160 Unicode code point 범위를 벗어났습니다.', 'metaDescription'))
  const normalizedTags = candidate.tags.map(normalizeTag)
  if (normalizedTags.length < 5 || normalizedTags.length > 8 || normalizedTags.some((tag) => !tag)) issues.push(issue('NEWS_TAG_COUNT_INVALID', 'invalid', '비어 있지 않은 SEO 태그가 5~8개 필요합니다.', 'tags'))
  const tagKeys = normalizedTags.map(tagComparisonKey)
  if (new Set(tagKeys).size !== tagKeys.length || normalizedTags.some((tag) => tag.length > MAX_TAG_LENGTH || isBrandTag(tag) || tagComparisonKey(tag) === tagComparisonKey(category.name))) {
    issues.push(issue('NEWS_SEO_TAG_INVALID', 'invalid', '태그 중복, 카테고리명·브랜드명 또는 길이 규칙을 확인해 주세요.', 'tags'))
  }
  const comparisons = findSeoTagComparisons(normalizedTags)
  if (comparisons.some((comparison) => comparison.relation === 'normalized_duplicate')) issues.push(issue('NEWS_SEO_TAG_INVALID', 'invalid', '공백과 구분자를 정규화하면 중복되는 태그가 있습니다.', 'tags'))
  if (comparisons.some((comparison) => comparison.relation === 'possible_near_duplicate')) issues.push(issue('NEWS_SEO_TAG_NEAR_DUPLICATE_WARNING', 'warning', '서로 매우 비슷한 태그가 있습니다. 저장 전에 확인해 주세요.', 'tags'))

  if (!candidate.sources.length) issues.push(issue('NEWS_SOURCE_REQUIRED', 'invalid', '검토한 HTML의 #sources에서 출처가 하나 이상 추출되어야 합니다.', 'sources'))
  const extractedKeys = new Set(extractedSources.filter((source) => source.sourceUrl).map((source) => normalizeSourceUrl(source.sourceUrl)))
  const sourceKeys = candidate.sources.map((source) => normalizeSourceUrl(source.sourceUrl))
  if (new Set(sourceKeys).size !== sourceKeys.length) issues.push(issue('NEWS_SOURCE_DUPLICATE', 'invalid', 'URL fragment와 trailing slash 정규화 후 중복되는 출처 행이 있습니다.', 'sources'))
  candidate.sources.forEach((source, index) => {
    if (!source.sourceName.trim() || !source.sourceTitle.trim() || !source.checkedPoint.trim() || !isHttpUrl(source.sourceUrl) || source.sourcePublishedAt && Number.isNaN(Date.parse(source.sourcePublishedAt))) {
      issues.push(issue('NEWS_SOURCE_INVALID', 'invalid', '출처 기관·제목·절대 HTTP(S) URL·확인 포인트를 입력하고 선택 시각 형식을 확인해 주세요.', `sources.${index}`))
    }
    if (source.sourceUrl && !extractedKeys.has(normalizeSourceUrl(source.sourceUrl))) issues.push(issue('NEWS_SOURCE_INVALID', 'invalid', '검토 출처 URL은 현재 HTML의 #sources section에도 있어야 합니다.', `sources.${index}.sourceUrl`))
    const warning = sourceUrlWarning(source.sourceUrl)
    if (warning) issues.push(issue('NEWS_SOURCE_URL_WARNING', 'warning', warning, `sources.${index}.sourceUrl`))
  })

  const persistedValues = [candidate.representativeTitle, ...candidate.alternativeTitles, candidate.metaDescription, candidate.slug, candidate.focusKeyword, ...candidate.tags, candidate.wordpressHtml, candidate.imagePrompt, candidate.imageAlt, ...candidate.sources.flatMap((source) => Object.values(source))]
  if (persistedValues.some((value) => unresolvedPattern.test(value)) || protectedFieldPattern.test(persistedValues.join('\n'))) issues.push(issue('NEWS_PROTECTED_FIELD_MARKER', 'invalid', '미해결 placeholder 또는 보호되는 서버 소유 필드는 저장 후보에 포함할 수 없습니다.', 'candidate'))

  const title = candidate.representativeTitle.trim()
  const derived: NewsResponseDerivedFields = { categoryId: category.id, briefingDate, displayId, authoritativeSlug, title, status: 'draft' }
  const hasInvalid = issues.some((item) => item.status === 'invalid')
  const status = hasInvalid ? 'invalid' : issues.length ? 'warning' : 'valid'
  return { status, candidate, derived, issues, persistencePayload: hasInvalid ? null : buildPayload(candidate, derived) }
}
