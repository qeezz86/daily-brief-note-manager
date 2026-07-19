import type { PublicationPayload, SourceContent, TaxonomyMapping } from '../wordpress-publication-preview/schemas.ts'

export type AttemptStatus = 'received' | 'validating' | 'blocked' | 'executing' | 'succeeded' | 'failed_safe' | 'uncertain'

export interface PublicationAttempt {
  id: string
  ownerId: string
  contentId: string
  siteOrigin: string
  idempotencyKey: string
  expectedSourceUpdatedAt: string
  expectedPayloadFingerprint: string
  actualPayloadFingerprint: string | null
  status: AttemptStatus
  wordpressPostId: number | null
  wordpressPostStatus: string | null
  wordpressPostSlug: string | null
  wordpressPostLink: string | null
  errorCode: string | null
  errorRetryable: boolean | null
  startedAt: string | null
  completedAt: string | null
}

export interface AttemptDatabase {
  loadContent(contentId: string, siteOrigin: string): Promise<SourceContent | null>
  readContentUpdatedAt(contentId: string): Promise<string | null>
  loadMappings(siteOrigin: string): Promise<TaxonomyMapping[]>
  findByIdempotency(siteOrigin: string, idempotencyKey: string): Promise<PublicationAttempt | null>
  findContentGuard(contentId: string, siteOrigin: string): Promise<PublicationAttempt | null>
  insertReceived(input: {
    ownerId: string; contentId: string; siteOrigin: string; idempotencyKey: string
    expectedSourceUpdatedAt: string; expectedPayloadFingerprint: string
  }): Promise<PublicationAttempt>
  transition(input: {
    attemptId: string; expectedStatus: AttemptStatus; newStatus: AttemptStatus
    actualPayloadFingerprint?: string; wordpressPostId?: number; wordpressPostStatus?: 'draft'
    wordpressPostSlug?: string; wordpressPostLink?: string; errorCode?: string; errorRetryable?: boolean
  }): Promise<PublicationAttempt>
}

export interface WordPressDraftResult {
  postId: number
  status: 'draft'
  slug: string
  link: string
}

export interface DraftWordPressClient {
  verifyDraftCapability(): Promise<boolean>
  createDraft(payload: PublicationPayload): Promise<WordPressDraftResult>
}
