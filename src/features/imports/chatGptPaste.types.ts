export type ChatGptPasteWorkflowStatus =
  | 'idle'
  | 'parsing'
  | 'invalid-preview'
  | 'valid-preview'
  | 'awaiting-warning-acknowledgement'
  | 'ready-to-confirm'
  | 'saving'
  | 'save-failed'
  | 'saved'

export interface ChatGptPasteTransientInput {
  rawText: string
}

export interface ChatGptPasteBlockingIssue {
  kind: 'blocking'
  code: string
  message: string
  path: string
}

export interface ChatGptPasteWarning {
  kind: 'warning'
  code: string
  message: string
  path: string
}

export interface ChatGptPasteIgnoredField {
  section: string
  path: string
  field: string
}

export interface ChatGptPasteSourcePreview {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string | null
  checkedPoint: string
}

export interface ChatGptPasteNormalizedPreview {
  contentGroup: 'news' | 'ai' | 'info_db' | 'chinese'
  category: string
  displayId: string | null
  seriesNo: number | null
  title: string
  summary: string | null
  slug: string
  publishedOn: string
  publishedAt: string | null
  wordpressUrl: string | null
  representativeTitle: string
  alternativeTitles: string[]
  metaDescription: string
  focusKeyword: string
  tags: string[]
  imagePrompt: string
  imageAlt: string
  sources: ChatGptPasteSourcePreview[]
  wordpressHtml: string
}

export interface ChatGptPasteNewsTrackingMetadata {
  present: boolean
  updateCount: number
  followupCount: number
  persisted: false
}

export interface ChatGptPasteSaveEligibility {
  isEligible: boolean
  requiresWarningAcknowledgement: boolean
}

export interface ChatGptPasteWarningAcknowledgement {
  acknowledged: boolean
}

export interface ChatGptPastePersistenceSource {
  source_name: string
  source_title: string
  source_url: string
  source_published_at: string | null
  checked_point: string
}

export interface ChatGptPastePersistencePayload {
  content: {
    content_group: 'news' | 'ai' | 'info_db' | 'chinese'
    category_id: string
    display_id: string | null
    series_no: number | null
    title: string
    summary: string
    slug: string
    published_on: string
    published_at: string | null
    wordpress_url: string | null
  }
  seo: {
    representative_title: string
    alternative_titles: string[]
    meta_description: string
    focus_keyword: string
    tags: string[]
  }
  image: {
    prompt: string
    alt: string
  }
  sources: ChatGptPastePersistenceSource[]
  html_body: string
}

export interface ChatGptPasteParserResult {
  preview: ChatGptPasteNormalizedPreview | null
  persistencePayload: ChatGptPastePersistencePayload | null
  blockingIssues: ChatGptPasteBlockingIssue[]
  warnings: ChatGptPasteWarning[]
  ignoredFields: ChatGptPasteIgnoredField[]
  newsTracking: ChatGptPasteNewsTrackingMetadata
  saveEligibility: ChatGptPasteSaveEligibility
}

export interface SaveChatGptPastePostRequest {
  p_item: ChatGptPastePersistencePayload
}

export interface SaveChatGptPastePostResult {
  postId: string
  title: string
  categoryId: string
  status: string
  slug: string
  displayId: string | null
  publishedOn: string | null
  wordpressUrl: string | null
}

export type ChatGptPasteRepositoryErrorCategory =
  | 'unauthenticated'
  | 'forbidden-cross-owner-reference'
  | 'invalid-input'
  | 'missing-required-field'
  | 'unsupported-category-or-enum'
  | 'duplicate-or-uniqueness-conflict'
  | 'foreign-key-violation'
  | 'aggregate-persistence-failure'

export class ChatGptPasteRepositoryError extends Error {
  constructor(
    public readonly category: ChatGptPasteRepositoryErrorCategory,
    message: string,
  ) {
    super(message)
    this.name = 'ChatGptPasteRepositoryError'
  }
}
