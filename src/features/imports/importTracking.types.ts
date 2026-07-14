import type { Json } from '../../shared/supabase/database.types'

export type ImportTopicStatus = 'active' | 'monitoring' | 'closed' | 'reopened'
export type ImportUpdateType = 'new' | 'follow_up' | 'correction' | 'closure_note'
export type ImportFollowupStatus = 'pending' | 'done' | 'cancelled'
export type ImportFollowupPriority = 'high' | 'normal' | 'low'

export interface ImportTrackingTopic {
  topicExternalKey: string
  topicKey: string
  canonicalTitle: string
  topicSummary: string | null
  status: ImportTopicStatus
  closedReason: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface ImportTrackingUpdate {
  updateExternalKey: string
  topicExternalKey: string
  updateType: ImportUpdateType
  headline: string
  factSummary: string
  importanceSummary: string | null
  impactSummary: string | null
  changeSummary: string | null
  previousUpdateExternalKey: string | null
  itemOrder: number
  sourceOrders: number[]
}

export interface ImportTrackingFollowup {
  followupExternalKey: string
  topicExternalKey: string
  checkText: string
  priority: ImportFollowupPriority
  dueDate: string | null
  status: ImportFollowupStatus
  resolutionNote: string | null
  resolvedAt: string | null
}

export interface ImportNewsTracking {
  topics: ImportTrackingTopic[]
  updates: ImportTrackingUpdate[]
  followups: ImportTrackingFollowup[]
}

export interface ImportNewsTrackingPayload {
  topics: Json[]
  updates: Json[]
  followups: Json[]
}

export interface ImportedNewsTrackingResult {
  postId: string
  topicCount: number
  reusedTopicCount: number
  createdTopicCount: number
  updateCount: number
  followupCount: number
  sourceLinkCount: number
}

export interface ImportTrackingGraphIssue {
  code: string
  path: string
  message: string
}
