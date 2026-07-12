import type { NewsFollowup } from './newsFollowups.types'

export function getSeoulDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isNewsFollowupOverdue(item: Pick<NewsFollowup, 'status' | 'due_date'>, today = getSeoulDate()): boolean {
  return item.status === 'pending' && item.due_date !== null && item.due_date < today
}

