import type { Tables } from '../../shared/supabase/database.types'

export const newsTopicStatuses = ['active', 'monitoring', 'closed', 'reopened'] as const
export type NewsTopicStatus = (typeof newsTopicStatuses)[number]

export type NewsTopic = Pick<Tables<'news_topics'>,
  'id' | 'category_id' | 'topic_key' | 'canonical_title' | 'topic_summary' |
  'status' | 'closed_reason' | 'first_seen_at' | 'last_seen_at' | 'created_at' | 'updated_at'>

export type NewsTopicStatusHistory = Pick<Tables<'news_status_history'>,
  'id' | 'topic_id' | 'from_status' | 'to_status' | 'reason' | 'changed_at'>

export interface CreateNewsTopicInput {
  ownerId: string
  categoryId: string
  topicKey: string
  canonicalTitle: string
  topicSummary: string | null
  initialStatus: 'active' | 'monitoring'
  firstSeenAt: string
  lastSeenAt: string
}

export interface UpdateNewsTopicInput {
  canonicalTitle: string
  topicSummary: string | null
  lastSeenAt: string
}

export interface TransitionNewsTopicStatusInput {
  targetStatus: NewsTopicStatus
  reason: string | null
}

export const newsTopicStatusLabels: Record<NewsTopicStatus, string> = {
  active: '활성', monitoring: '모니터링', closed: '종료', reopened: '재개',
}

export const allowedNewsTopicTransitions: Record<NewsTopicStatus, NewsTopicStatus[]> = {
  active: ['monitoring', 'closed'],
  monitoring: ['active', 'closed'],
  closed: ['reopened'],
  reopened: ['active', 'monitoring', 'closed'],
}
