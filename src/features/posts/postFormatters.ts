import type { Category } from '../categories/categories.types'
import type { ContentStatus, PostListItem } from './posts.types'

const statusLabels: Record<ContentStatus, string> = {
  draft: '초안',
  ready: '발행 준비',
  published: '발행됨',
  archived: '보관됨',
}

export function getStatusLabel(status: string) {
  return statusLabels[status as ContentStatus] ?? status
}

export function getPostIdentifier(
  post: PostListItem,
  category: Category | undefined,
) {
  if (category?.content_group === 'chinese') {
    return post.series_no === null ? '시리즈 번호 없음' : `#${post.series_no}`
  }

  if (post.display_id) {
    return post.display_id
  }

  return post.series_no === null ? '표시 ID 없음' : `#${post.series_no}`
}

export function formatDateOnly(value: string | null) {
  if (!value) return '날짜 미정'

  const [year, month, day] = value.split('-')
  return `${year}. ${Number(month)}. ${Number(day)}.`
}

export function formatUpdatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '수정일 미정'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(date)
}
