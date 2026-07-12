import { isNewsFollowupOverdue } from './newsFollowupDates'
import type { NewsFollowup, NewsFollowupFilters } from './newsFollowups.types'

const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 }
const statusOrder: Record<string, number> = { pending: 0, done: 1, cancelled: 2 }

export function sortNewsFollowups(items: NewsFollowup[], today?: string): NewsFollowup[] {
  return [...items].sort((a, b) =>
    (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) ||
    Number(isNewsFollowupOverdue(b, today)) - Number(isNewsFollowupOverdue(a, today)) ||
    (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
    (a.due_date === b.due_date ? 0 : a.due_date === null ? 1 : b.due_date === null ? -1 : a.due_date.localeCompare(b.due_date)) ||
    b.updated_at.localeCompare(a.updated_at))
}

export function filterNewsFollowups(items: NewsFollowup[], filters: NewsFollowupFilters, today?: string): NewsFollowup[] {
  const search = filters.search.trim().toLocaleLowerCase('ko-KR')
  return sortNewsFollowups(items.filter((item) =>
    (!filters.categoryId || item.topic.category_id === filters.categoryId) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.priority || item.priority === filters.priority) &&
    (!filters.overdueOnly || isNewsFollowupOverdue(item, today)) &&
    (!filters.dueFrom || (item.due_date !== null && item.due_date >= filters.dueFrom)) &&
    (!filters.dueTo || (item.due_date !== null && item.due_date <= filters.dueTo)) &&
    (!search || `${item.topic.canonical_title} ${item.check_text}`.toLocaleLowerCase('ko-KR').includes(search))
  ), today)
}

