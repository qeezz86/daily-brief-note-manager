import type { Category } from '../categories/categories.types'

interface PatternValues {
  date?: string | null
  seriesNo?: number | null
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function applyCategoryPattern(
  pattern: string,
  { date, seriesNo }: PatternValues,
) {
  let value = pattern

  if (date) {
    value = value.replaceAll('YYYY-MM-DD', date)
  }

  if (seriesNo !== null && seriesNo !== undefined) {
    value = value.replaceAll('###', String(seriesNo).padStart(3, '0'))
  }

  return value
}

export function buildDisplayId(
  category: Category,
  values: PatternValues,
) {
  if (category.content_group === 'chinese') return null
  if (!category.display_id_pattern) return null

  return applyCategoryPattern(category.display_id_pattern, values)
}

export function buildSuggestedSlug(
  category: Category,
  values: PatternValues,
) {
  return applyCategoryPattern(category.slug_pattern, values)
}

export function matchesCategoryPattern(
  pattern: string,
  value: string,
  { date, seriesNo }: PatternValues,
) {
  const datePattern = date ? escapeRegExp(date) : '\\d{4}-\\d{2}-\\d{2}'
  const seriesPattern = seriesNo !== null && seriesNo !== undefined
    ? escapeRegExp(String(seriesNo).padStart(3, '0'))
    : '\\d{3,}'
  const expression = escapeRegExp(pattern)
    .replaceAll(escapeRegExp('YYYY-MM-DD'), datePattern)
    .replaceAll(escapeRegExp('###'), seriesPattern)

  return new RegExp(`^${expression}$`).test(value)
}
