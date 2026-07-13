import type { ContentStatus } from '../posts/posts.types'
import type { CONTENT_IMPORT_FORMAT } from './importValidation.constants'

export type ImportIssueSeverity = 'error' | 'warning' | 'info'
export type ImportItemStatus = 'ready' | 'warning' | 'invalid' | 'duplicate'
export type ImportValidationStatus = 'valid' | 'warning' | 'invalid'

export interface ImportIssue {
  code: string
  severity: ImportIssueSeverity
  message: string
  path: string
  itemIndex?: number
  relatedValue?: string
  existingRecordSummary?: ExistingRecordSummary
}

export interface ExistingRecordSummary {
  title: string
  categoryId: string
  publishedOn: string | null
}

export interface ImportCategory {
  id: string
  contentGroup: 'news' | 'ai' | 'info_db' | 'chinese'
  name: string
  code: string
  wrapperClass: string
  displayIdPattern: string | null
  slugPattern: string
  enabled: boolean
}

export interface ImportSource {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string | null
  checkedPoint: string
}

export interface ImportSeo {
  representativeTitle: string
  alternativeTitles: string[]
  metaDescription: string
  focusKeyword: string
}

export interface ImportImageMetadata {
  prompt: string
  alt: string
}

export interface ImportPost {
  externalKey?: string
  categoryId: string
  title: string
  summary: string
  slug: string
  status: ContentStatus
  briefingDate?: string | null
  publishedOn?: string | null
  publishedAt?: string | null
  displayId?: string | null
  seriesNo?: number | null
  wordpressUrl?: string | null
  htmlBody?: string | null
  seo?: ImportSeo
  image?: ImportImageMetadata
  tags?: string[]
  sources?: ImportSource[]
  metadata?: Record<string, unknown> | null
  newsTracking?: {
    topicKey?: string | null
    updates?: unknown[]
    followups?: unknown[]
  } | null
}

export interface ImportBundle {
  format: typeof CONTENT_IMPORT_FORMAT
  schemaVersion: number
  exportedAt?: string
  source?: string
  validationMode?: 'strict' | 'legacy'
  posts: ImportPost[]
}

export interface ImportNormalizedPreview {
  externalKey: string | null
  categoryId: string
  title: string
  slug: string
  status: string
  publishedOn: string | null
  briefingDate: string | null
  displayId: string | null
  seriesNo: number | null
  wordpressUrl: string | null
  tags: Array<{ name: string; comparisonKey: string }>
  sources: Array<{ sourceUrl: string; normalizedUrl: string }>
  metadata: Record<string, unknown> | null
  htmlBody: { present: boolean; length: number; checksum: string | null }
}

export interface ImportItemValidationResult {
  index: number
  externalKey: string | null
  title: string
  categoryId: string
  publishedOn: string | null
  status: ImportItemStatus
  issues: ImportIssue[]
  normalizedPreview: ImportNormalizedPreview
}

export interface ImportValidationSummary {
  total: number
  ready: number
  warning: number
  invalid: number
  duplicate: number
  exactDuplicate: number
  possibleDuplicate: number
}

export interface ImportValidationResult {
  validationVersion: number
  status: ImportValidationStatus
  schemaVersion: number | null
  databaseCheck: ImportDatabaseCheckStatus
  summary: ImportValidationSummary
  bundleIssues: ImportIssue[]
  items: ImportItemValidationResult[]
}

export type ImportDatabaseCheckStatus = 'complete' | 'partial' | 'unavailable'

export interface ExistingImportPost {
  categoryId: string
  title: string
  slug: string
  displayId: string | null
  seriesNo: number | null
  briefingDate: string | null
  publishedOn: string | null
  wordpressUrl: string | null
}

export interface ExistingChineseUrl {
  originalUrl: string
  post: ExistingRecordSummary
}

export interface ExistingNewsTopic {
  categoryId: string
  topicKey: string
  canonicalTitle: string
}

export interface ImportReferenceData {
  categories: ImportCategory[]
  posts: ExistingImportPost[]
  chineseUrls: ExistingChineseUrl[]
  newsTopics: ExistingNewsTopic[]
  existingTagKeys: string[]
}

export type ImportDuplicateReferenceData = Omit<ImportReferenceData, 'categories'>

export interface ImportDuplicateCandidates {
  slugs: string[]
  wordpressUrls: string[]
  briefingDates: string[]
  seriesNumbers: number[]
  chineseOriginalUrls: string[]
  newsTopicKeys: string[]
}

export interface ImportDuplicateLookupResult {
  databaseCheck: ImportDatabaseCheckStatus
  referenceData: ImportDuplicateReferenceData
}
