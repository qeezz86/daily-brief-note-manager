import { normalizeSourceUrl, tagComparisonKey } from '../posts/publicationFields'
import type {
  ImportIssue,
  ImportItemValidationResult,
  ImportPost,
} from './importValidation.types'

function normalizedText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR') ?? ''
}

function addIssue(item: ImportItemValidationResult, issue: ImportIssue) {
  const key = `${issue.code}|${issue.path}|${issue.relatedValue ?? ''}`
  const exists = item.issues.some(
    (candidate) => `${candidate.code}|${candidate.path}|${candidate.relatedValue ?? ''}` === key,
  )
  if (!exists) item.issues.push(issue)
}

function duplicateByKey(
  posts: ImportPost[],
  items: ImportItemValidationResult[],
  keyOf: (post: ImportPost) => string,
  code: string,
  message: string,
  path: string,
  severity: 'error' | 'warning' = 'error',
) {
  const indexesByKey = new Map<string, number[]>()
  posts.forEach((post, index) => {
    const key = keyOf(post)
    if (!key) return
    indexesByKey.set(key, [...(indexesByKey.get(key) ?? []), index])
  })
  for (const [key, indexes] of indexesByKey) {
    if (indexes.length < 2) continue
    indexes.forEach((index) => addIssue(items[index], {
      code,
      severity,
      message,
      path,
      itemIndex: index,
      relatedValue: key,
    }))
  }
}

export function detectInternalDuplicates(
  posts: ImportPost[],
  items: ImportItemValidationResult[],
) {
  duplicateByKey(posts, items, (post) => normalizedText(post.externalKey), 'DUPLICATE_EXTERNAL_KEY', '파일 안에서 externalKey가 중복되었습니다.', 'externalKey')
  duplicateByKey(posts, items, (post) => normalizedText(post.slug), 'DUPLICATE_SLUG', '파일 안에서 slug가 중복되었습니다.', 'slug')
  duplicateByKey(posts, items, (post) => normalizedText(post.displayId), 'DUPLICATE_DISPLAY_ID', '파일 안에서 표시 ID가 중복되었습니다.', 'displayId')
  duplicateByKey(posts, items, (post) => post.categoryId && post.seriesNo ? `${post.categoryId}|${post.seriesNo}` : '', 'DUPLICATE_CATEGORY_SERIES', '파일 안에서 같은 카테고리의 시리즈 번호가 중복되었습니다.', 'seriesNo')
  duplicateByKey(posts, items, (post) => post.categoryId && post.briefingDate ? `${post.categoryId}|${post.briefingDate}` : '', 'DUPLICATE_NEWS_DATE', '파일 안에서 같은 뉴스 카테고리와 브리핑 날짜가 중복되었습니다.', 'briefingDate')
  duplicateByKey(posts, items, (post) => {
    const metadata = post.metadata
    const originalUrl = metadata && typeof metadata.originalUrl === 'string' ? metadata.originalUrl : ''
    return originalUrl ? normalizeSourceUrl(originalUrl).toLocaleLowerCase('en-US') : ''
  }, 'DUPLICATE_CHINESE_ORIGINAL_URL', '파일 안에서 중국어 원문 URL이 중복되었습니다.', 'metadata.originalUrl')
  duplicateByKey(posts, items, (post) => {
    const topicKey = post.newsTracking?.topicKey
    return topicKey ? `${post.categoryId}|${normalizedText(topicKey)}` : ''
  }, 'REPEATED_NEWS_TOPIC_KEY', '여러 게시물이 같은 뉴스 주제 키를 참조합니다. 후속 단계에서 기존 주제 재사용 여부를 확인하세요.', 'newsTracking.topicKey', 'warning')
  duplicateByKey(posts, items, (post) => {
    const title = normalizedText(post.title)
    return title && post.categoryId && post.publishedOn
      ? `${post.categoryId}|${post.publishedOn}|${title}`
      : ''
  }, 'POSSIBLE_DUPLICATE_TITLE_DATE', '같은 카테고리·발행일·제목의 항목이 있습니다.', 'title', 'warning')

  posts.forEach((post, index) => {
    const tagKeys = new Set<string>()
    for (const tag of post.tags ?? []) {
      const key = tagComparisonKey(tag)
      if (key && tagKeys.has(key)) addIssue(items[index], {
        code: 'DUPLICATE_TAG', severity: 'error', message: '항목 안에서 정규화된 태그가 중복되었습니다.', path: 'tags', itemIndex: index, relatedValue: key,
      })
      tagKeys.add(key)
    }
    const sourceKeys = new Set<string>()
    for (const source of post.sources ?? []) {
      const key = normalizeSourceUrl(source.sourceUrl).toLocaleLowerCase('en-US')
      if (key && sourceKeys.has(key)) addIssue(items[index], {
        code: 'DUPLICATE_SOURCE_URL', severity: 'error', message: '항목 안에서 정규화된 출처 URL이 중복되었습니다.', path: 'sources', itemIndex: index, relatedValue: key,
      })
      sourceKeys.add(key)
    }
  })
}
