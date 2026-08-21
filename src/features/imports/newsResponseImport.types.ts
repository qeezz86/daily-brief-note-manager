import type { ChatGptPastePersistencePayload } from './chatGptPaste.types'
import type { ImportCategory, ImportDatabaseCheckStatus } from './importValidation.types'

export const NEWS_RESPONSE_HEADINGS = [
  '1. SEO 입력용 대표 제목',
  '2. SEO 대안 제목 4개',
  '3. 메타 설명',
  '4. URL 슬러그',
  '5. 포커스 키워드',
  '6. SEO 태그 5~8개',
  '7. 워드프레스 본문용 HTML',
  '8. 대표 이미지 프롬프트',
  '9. 이미지 ALT 문구',
  '10. 발행 전 체크리스트',
] as const

export type NewsResponseValidationStatus = 'valid' | 'warning' | 'invalid'
export type NewsResponseIssueCode =
  | 'NEWS_EMPTY_INPUT' | 'NEWS_MISSING_SECTION' | 'NEWS_DUPLICATE_SECTION' | 'NEWS_SECTION_ORDER_INVALID'
  | 'NEWS_UNKNOWN_STRUCTURAL_SECTION' | 'NEWS_PREAMBLE_INVALID' | 'NEWS_EPILOGUE_INVALID'
  | 'NEWS_REQUIRED_FIELD_EMPTY' | 'NEWS_SCALAR_MULTILINE' | 'NEWS_LIST_MALFORMED'
  | 'NEWS_ALTERNATIVE_TITLE_COUNT_INVALID' | 'NEWS_TAG_COUNT_INVALID' | 'NEWS_CHECKLIST_REQUIRED'
  | 'NEWS_HTML_FENCE_MALFORMED' | 'NEWS_HTML_MULTIPLE_CODE_BLOCKS' | 'NEWS_HTML_TEXT_OUTSIDE_FENCE'
  | 'NEWS_UNSUPPORTED_CATEGORY' | 'NEWS_BRIEFING_DATE_INVALID' | 'NEWS_CATEGORY_PATTERN_INVALID'
  | 'NEWS_SLUG_INVALID' | 'NEWS_SLUG_PATTERN_MISMATCH' | 'NEWS_HTML_TOP_LEVEL_INVALID'
  | 'NEWS_CATEGORY_WRAPPER_MISMATCH' | 'NEWS_HTML_H1_COUNT_INVALID' | 'NEWS_HTML_H1_TITLE_MISMATCH'
  | 'NEWS_HTML_EXECUTABLE_CONTENT' | 'NEWS_HTML_ACTIVE_URL_SCHEME' | 'NEWS_IMAGE_PROMPT_IN_HTML'
  | 'NEWS_PROTECTED_FIELD_MARKER'
  | 'NEWS_SEO_TITLE_DUPLICATE' | 'NEWS_SEO_TAG_INVALID' | 'NEWS_META_DESCRIPTION_LENGTH_WARNING'
  | 'NEWS_SEO_TAG_NEAR_DUPLICATE_WARNING' | 'NEWS_SOURCE_REQUIRED' | 'NEWS_SOURCE_INVALID'
  | 'NEWS_SOURCE_DUPLICATE' | 'NEWS_SOURCE_URL_WARNING'

export interface NewsResponseIssue {
  code: NewsResponseIssueCode
  status: Exclude<NewsResponseValidationStatus, 'valid'>
  message: string
  path: string
}

export interface NewsResponseSourceCandidate {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string
  checkedPoint: string
}

export interface NewsResponseCandidate {
  representativeTitle: string
  alternativeTitles: [string, string, string, string]
  metaDescription: string
  slug: string
  focusKeyword: string
  tags: string[]
  wordpressHtml: string
  imagePrompt: string
  imageAlt: string
  checklist: string[]
  sources: NewsResponseSourceCandidate[]
}

export interface NewsResponseParseResult {
  candidate: NewsResponseCandidate | null
  issues: NewsResponseIssue[]
}

export type NewsResponseCategorySetting = Pick<ImportCategory, 'id' | 'enabled' | 'contentGroup' | 'name' | 'code' | 'wrapperClass' | 'displayIdPattern' | 'slugPattern'>

export interface NewsResponseDerivedFields {
  categoryId: string
  briefingDate: string
  displayId: string
  authoritativeSlug: string
  title: string
  status: 'draft'
}

export interface NewsResponseValidationResult {
  status: NewsResponseValidationStatus
  candidate: NewsResponseCandidate
  derived: NewsResponseDerivedFields | null
  issues: NewsResponseIssue[]
  persistencePayload: ChatGptPastePersistencePayload | null
}

export interface NewsResponseValidationAuthority {
  candidateRevision: number
  categorySettingsSignature: string
  result: NewsResponseValidationResult
}

export type NewsResponseDuplicateState =
  | { status: 'idle' | 'checking'; candidateRevision: number | null; databaseCheck: null; duplicateFound: false; message: string }
  | { status: 'clear'; candidateRevision: number; databaseCheck: 'complete'; duplicateFound: false; message: string }
  | { status: 'duplicate'; candidateRevision: number; databaseCheck: 'complete'; duplicateFound: true; message: string }
  | { status: 'incomplete'; candidateRevision: number; databaseCheck: Exclude<ImportDatabaseCheckStatus, 'complete'>; duplicateFound: false; message: string }

export interface NewsResponseRevisionBoundApproval { candidateRevision: number | null }
export interface NewsResponseConfirmationState { candidateRevision: number | null; open: boolean }
export type NewsResponseSaveState = { status: 'idle' | 'saving' | 'saved' } | { status: 'failed'; message: string }
