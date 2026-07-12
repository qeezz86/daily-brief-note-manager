import type { Tables } from '../../shared/supabase/database.types'

export const newsFollowupStatuses = ['pending', 'done', 'cancelled'] as const
export type NewsFollowupStatus = (typeof newsFollowupStatuses)[number]
export const newsFollowupPriorities = ['high', 'normal', 'low'] as const
export type NewsFollowupPriority = (typeof newsFollowupPriorities)[number]

export type NewsFollowupRow = Pick<Tables<'news_followups'>,
  'id' | 'topic_id' | 'check_text' | 'status' | 'due_date' | 'priority' |
  'resolution_note' | 'resolved_at' | 'created_at' | 'updated_at'>

export interface NewsFollowup extends NewsFollowupRow {
  topic: {
    id: string
    canonical_title: string
    status: string
    category_id: string
    category: { id: string; name: string; content_group: string }
  }
}

export interface SaveNewsFollowupInput {
  checkText: string
  dueDate: string | null
  priority: NewsFollowupPriority
}
export interface CreateNewsFollowupInput extends SaveNewsFollowupInput { topicId: string }
export interface ResolveNewsFollowupInput {
  targetStatus: 'done' | 'cancelled'
  resolutionNote: string
}
export interface NewsFollowupFilters {
  categoryId: string
  status: '' | NewsFollowupStatus
  priority: '' | NewsFollowupPriority
  overdueOnly: boolean
  dueFrom: string
  dueTo: string
  search: string
}

export const newsFollowupStatusLabels: Record<NewsFollowupStatus, string> = {
  pending: '확인 필요', done: '완료', cancelled: '취소',
}
export const newsFollowupPriorityLabels: Record<NewsFollowupPriority, string> = {
  high: '높음', normal: '보통', low: '낮음',
}

