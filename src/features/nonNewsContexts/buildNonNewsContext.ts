import { getNonNewsCategoryDefinition } from './nonNewsContexts.constants'
import type {
  NonNewsContextBuildResult,
  NonNewsContextItem,
  SupportedNonNewsCategoryId,
} from './nonNewsContexts.types'

export const NON_NEWS_CONTEXT_HEADER = '[비뉴스 중복 방지 컨텍스트]'
export const NON_NEWS_CONTEXT_PURPOSE =
  '목적: 기존 글 목록은 새 글의 중복 방지와 주제 참고를 위한 자료입니다.'

function normalizeText(value: string | null): string {
  return value?.trim().replace(/\s+/gu, ' ') ?? ''
}

function normalizeUrl(value: string | null): string {
  return value?.trim() ?? ''
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0)
  const length = Math.min(leftPoints.length, rightPoints.length)

  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index] - rightPoints[index]
    if (difference !== 0) return difference
  }

  return leftPoints.length - rightPoints.length
}

function appendLine(lines: string[], label: string, value: string): void {
  if (value) lines.push(`${label}: ${value}`)
}

function appendCommonLines(lines: string[], item: NonNewsContextItem): void {
  appendLine(lines, '제목', normalizeText(item.title))
  appendLine(lines, '슬러그', normalizeText(item.slug))
  appendLine(lines, '요약', normalizeText(item.summary))
  appendLine(lines, '발행일', normalizeText(item.publishedOn))
}

function buildItemLines(
  categoryId: SupportedNonNewsCategoryId,
  item: NonNewsContextItem,
): string[] {
  const lines: string[] = []

  if (categoryId === 'chinese-study') {
    if (item.seriesNo !== null) lines.push(`시리즈 번호: ${item.seriesNo}`)
    appendCommonLines(lines, item)
    if (item.chineseMetadata) {
      appendLine(lines, '프로그램명', normalizeText(item.chineseMetadata.programName))
      appendLine(lines, '원문 제목', normalizeText(item.chineseMetadata.originalTitle))
      appendLine(lines, '원문 URL', normalizeUrl(item.chineseMetadata.originalUrl))
      appendLine(lines, '학습 주제', normalizeText(item.chineseMetadata.learningTopic))
      appendLine(lines, '학습 포인트', normalizeText(item.chineseMetadata.learningPoints))
    }
    return lines
  }

  appendLine(lines, '표시 ID', normalizeText(item.displayId))
  appendCommonLines(lines, item)
  appendLine(lines, '포커스 키워드', normalizeText(item.focusKeyword))

  if (categoryId === 'ai-column') {
    const tags = item.tags
      .map((tag) => normalizeText(tag))
      .filter(Boolean)
      .sort(compareUnicodeCodePoints)
    appendLine(lines, '태그', tags.join(', '))
  }

  appendLine(lines, '분야', normalizeText(item.fieldName))
  return lines
}

export function buildNonNewsContext(
  categoryId: SupportedNonNewsCategoryId,
  items: readonly NonNewsContextItem[],
): NonNewsContextBuildResult {
  const category = getNonNewsCategoryDefinition(categoryId)
  const lines = [
    NON_NEWS_CONTEXT_HEADER,
    NON_NEWS_CONTEXT_PURPOSE,
    `카테고리: ${category.name} (${category.id})`,
    `사용 항목: ${items.length}개 / 최대 ${category.limit}개`,
    '',
  ]

  if (items.length === 0) {
    lines.push('기존 글이 없습니다.')
  } else {
    items.forEach((item, index) => {
      if (index > 0) lines.push('')
      lines.push(`--- 항목 ${index + 1} ---`)
      lines.push(...buildItemLines(categoryId, item))
    })
  }

  return {
    category,
    actualCount: items.length,
    maxCount: category.limit,
    text: lines.join('\n'),
  }
}
