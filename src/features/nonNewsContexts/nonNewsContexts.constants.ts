import type {
  NonNewsCategoryDefinition,
  SupportedNonNewsCategoryId,
} from './nonNewsContexts.types'

export const SUPPORTED_NON_NEWS_CATEGORIES: readonly NonNewsCategoryDefinition[] =
  Object.freeze([
    Object.freeze({ id: 'ai-column', name: 'AI 칼럼', limit: 20 }),
    Object.freeze({ id: 'info-db', name: '정보DB', limit: 30 }),
    Object.freeze({ id: 'chinese-study', name: '중국어 학습', limit: 20 }),
  ])

export const DEFAULT_NON_NEWS_CATEGORY_ID: SupportedNonNewsCategoryId =
  'ai-column'

export function isSupportedNonNewsCategoryId(
  value: string | null,
): value is SupportedNonNewsCategoryId {
  return SUPPORTED_NON_NEWS_CATEGORIES.some((category) => category.id === value)
}

export function getNonNewsCategoryDefinition(
  categoryId: SupportedNonNewsCategoryId,
): NonNewsCategoryDefinition {
  const category = SUPPORTED_NON_NEWS_CATEGORIES.find(
    (candidate) => candidate.id === categoryId,
  )

  if (!category) {
    throw new Error('지원하지 않는 비뉴스 카테고리입니다.')
  }

  return category
}
