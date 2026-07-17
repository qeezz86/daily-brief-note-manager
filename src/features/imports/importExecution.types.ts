import type { Json } from '../../shared/supabase/database.types'

export interface ImportContentPostPayload {
  validation_mode: 'strict' | 'legacy'
  category_id: string
  title: string
  summary: string
  slug: string
  status: string
  briefing_date: string | null
  published_on: string | null
  published_at: string | null
  display_id: string | null
  series_no: number | null
  wordpress_url: string | null
  html_body: string | null
  seo: Json
  image: Json
  tags: Json[]
  sources: Json[]
  metadata: Json
}

export interface ImportedPostResult {
  postId: string
  title: string
  categoryId: string
  status: string
  slug: string
  displayId: string | null
  publishedOn: string | null
  wordpressUrl: string | null
}

export type ImportExecutionItemStatus = 'imported' | 'failed' | 'skipped'
export type ImportTrackingStatus = 'not_applicable' | 'not_present' | 'imported' | 'failed'

export interface ImportExecutionItemResult {
  externalKey: string
  title: string
  categoryId: string
  status: ImportExecutionItemStatus
  contentStatus: ImportExecutionItemStatus
  trackingStatus: ImportTrackingStatus
  postId?: string
  postPath?: string
  errorCode?: string
  message?: string
  topicCount?: number
  reusedTopicCount?: number
  createdTopicCount?: number
  updateCount?: number
  followupCount?: number
  sourceLinkCount?: number
  trackingErrorCode?: string
  trackingMessage?: string
}

export interface ImportExecutionResult {
  startedAt: string
  completedAt?: string
  total: number
  imported: number
  failed: number
  skipped: number
  trackingImported: number
  trackingFailed: number
  trackingNotPresent: number
  items: ImportExecutionItemResult[]
}

export interface ImportExecutionCandidate {
  clientKey: string
  title: string
  categoryId: string
  rawItem: unknown
  isNews?: boolean
}

export interface ImportProgressState {
  completed: number
  total: number
  currentTitle: string | null
  imported: number
  failed: number
  skipped: number
  trackingImported: number
  trackingFailed: number
}

export class SafeImportError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly stopExecution = false,
  ) {
    super(message)
  }
}
