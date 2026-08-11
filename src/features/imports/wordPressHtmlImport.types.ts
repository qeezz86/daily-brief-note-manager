import type { ImportCategory, ImportPost } from './importValidation.types'

export const WORDPRESS_HTML_MAX_INPUT_BYTES = 20 * 1024 * 1024

export type WordPressCandidateState = 'detected' | 'missing' | 'ambiguous' | 'invalid' | 'warning' | 'user-confirmed'

export interface WordPressCandidate<T> {
  state: WordPressCandidateState
  values: T[]
  value: T | null
}

export interface WordPressHtmlIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  path: string
}

export interface WordPressExtractedSource {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string | null
  checkedPoint: string
}

export interface WordPressNewsIssuePreview {
  id: string
  heading: string
  whatHappened: string
  whyImportant: string
  impact: string
  watchPoint: string
  updateLabel: string
}

export interface WordPressChinesePreview {
  programName: string
  originalTitle: string
  originalUrl: string
  originalPublishedAt: string
  episodeListIncluded: boolean | null
  verifiedCoreFact: string
}

export interface WordPressHtmlParserResult {
  rawHtml: string
  byteLength: number
  issues: WordPressHtmlIssue[]
  categoryMatches: ImportCategory[]
  wrapperClasses: string[]
  title: WordPressCandidate<string>
  summary: WordPressCandidate<string>
  publishedOn: WordPressCandidate<string>
  displayId: WordPressCandidate<string>
  seriesNo: WordPressCandidate<number>
  slug: WordPressCandidate<string>
  wordpressUrl: WordPressCandidate<string>
  sources: WordPressExtractedSource[]
  newsIssues: WordPressNewsIssuePreview[]
  changeLog: string
  watchPoints: string
  previousContentLinks: string[]
  contentNotes: string[]
  chinese: WordPressChinesePreview
}

export interface WordPressHtmlDraft extends ImportPost {
  categoryId: string
  status: 'draft' | 'ready' | 'published'
  seo: NonNullable<ImportPost['seo']>
  image: NonNullable<ImportPost['image']>
  tags: string[]
  sources: NonNullable<ImportPost['sources']>
  metadata: Record<string, unknown>
  newsTracking?: null
  htmlBody: string
}
