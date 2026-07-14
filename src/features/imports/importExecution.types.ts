import type { Json } from '../../shared/supabase/database.types'

export interface ImportContentPostPayload {
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

export interface ImportExecutionItemResult {
  externalKey: string
  title: string
  categoryId: string
  status: ImportExecutionItemStatus
  postId?: string
  postPath?: string
  errorCode?: string
  message?: string
}

export interface ImportExecutionResult {
  startedAt: string
  completedAt?: string
  total: number
  imported: number
  failed: number
  skipped: number
  items: ImportExecutionItemResult[]
}

export interface ImportExecutionCandidate {
  clientKey: string
  title: string
  categoryId: string
  rawItem: unknown
}

export interface ImportProgressState {
  completed: number
  total: number
  currentTitle: string | null
  imported: number
  failed: number
  skipped: number
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
