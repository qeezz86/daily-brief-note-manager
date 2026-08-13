import type { ChatGptPastePersistencePayload } from './chatGptPaste.types'
import type { ImportCategory, ImportDatabaseCheckStatus } from './importValidation.types'

export const NON_NEWS_RESPONSE_HEADINGS = [
  '1. SEO 입력용 대표 제목',
  '2. SEO 대안 제목 4개',
  '3. 메타 설명',
  '4. URL 슬러그',
  '5. 포커스 키워드',
  '6. SEO 태그 5~8개',
  '7. 워드프레스 본문용 HTML — 하나의 연속된 HTML 코드 블록, 올바른 wrapper, <h1>, 최종 닫는 wrapper, HTML 내부 이미지 프롬프트 금지',
  '8. 대표 이미지 프롬프트',
  '9. 이미지 ALT 문구',
  '10. 발행 전 체크리스트',
] as const

export type SupportedNonNewsResponseCategoryId = 'ai-column' | 'info-db' | 'chinese-study'
export type NonNewsResponseValidationStatus = 'valid' | 'warning' | 'invalid'

export type NonNewsResponseIssueCode =
  | 'NON_NEWS_EMPTY_INPUT'
  | 'NON_NEWS_MISSING_SECTION'
  | 'NON_NEWS_DUPLICATE_SECTION'
  | 'NON_NEWS_SECTION_ORDER_INVALID'
  | 'NON_NEWS_UNKNOWN_STRUCTURAL_SECTION'
  | 'NON_NEWS_REQUIRED_FIELD_EMPTY'
  | 'NON_NEWS_ALTERNATIVE_TITLE_LIST_MALFORMED'
  | 'NON_NEWS_ALTERNATIVE_TITLE_COUNT_INVALID'
  | 'NON_NEWS_TAG_LIST_MALFORMED'
  | 'NON_NEWS_TAG_COUNT_INVALID'
  | 'NON_NEWS_HTML_FENCE_MALFORMED'
  | 'NON_NEWS_HTML_MULTIPLE_CODE_BLOCKS'
  | 'NON_NEWS_HTML_TEXT_OUTSIDE_FENCE'
  | 'NON_NEWS_CHECKLIST_MALFORMED'
  | 'NON_NEWS_PROTECTED_FIELD_MARKER'
  | 'NON_NEWS_CATEGORY_WRAPPER_MISMATCH'
  | 'NON_NEWS_REQUIRED_IDENTIFIER_UNRESOLVED'
  | 'NON_NEWS_UNSUPPORTED_CATEGORY'
  | 'NON_NEWS_HTML_TOP_LEVEL_INVALID'
  | 'NON_NEWS_HTML_H1_COUNT_INVALID'
  | 'NON_NEWS_HTML_EXECUTABLE_CONTENT'
  | 'NON_NEWS_HTML_ACTIVE_URL_SCHEME'
  | 'NON_NEWS_IMAGE_PROMPT_IN_HTML'
  | 'NON_NEWS_SLUG_INVALID'
  | 'NON_NEWS_SLUG_PATTERN_MISMATCH'
  | 'NON_NEWS_SEO_TITLE_DUPLICATE'
  | 'NON_NEWS_SEO_TAG_INVALID'
  | 'NON_NEWS_META_DESCRIPTION_LENGTH_WARNING'
  | 'NON_NEWS_SEO_TAG_NEAR_DUPLICATE_WARNING'
  | 'NON_NEWS_SOURCE_REQUIRED'
  | 'NON_NEWS_SOURCE_INVALID'
  | 'NON_NEWS_SOURCE_URL_WARNING'
  | 'NON_NEWS_DUPLICATE_FOUND'
  | 'NON_NEWS_DUPLICATE_LOOKUP_INCOMPLETE'

export interface NonNewsResponseIssue {
  code: NonNewsResponseIssueCode
  status: Exclude<NonNewsResponseValidationStatus, 'valid'>
  message: string
  path: string
}

export interface NonNewsResponseSourceCandidate {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string
  checkedPoint: string
}

export interface NonNewsResponseCandidate {
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
  sources: NonNewsResponseSourceCandidate[]
}

export interface NonNewsResponseParseResult {
  candidate: NonNewsResponseCandidate | null
  issues: NonNewsResponseIssue[]
}

export type NonNewsResponseCategorySetting = Pick<
  ImportCategory,
  'id' | 'enabled' | 'contentGroup' | 'name' | 'code' | 'wrapperClass' | 'displayIdPattern' | 'slugPattern'
>

export interface NonNewsResponseDerivedFields {
  categoryId: SupportedNonNewsResponseCategoryId
  contentGroup: 'ai' | 'info_db' | 'chinese'
  seriesNo: number
  displayId: string | null
  title: string
  summary: string
  status: 'draft'
}

export interface NonNewsResponseValidationResult {
  status: NonNewsResponseValidationStatus
  candidate: NonNewsResponseCandidate
  derived: NonNewsResponseDerivedFields | null
  issues: NonNewsResponseIssue[]
  persistencePayload: ChatGptPastePersistencePayload | null
}

export type NonNewsResponseDuplicateState =
  | { status: 'idle' | 'checking'; databaseCheck: null; duplicateFound: false; message: string }
  | { status: 'clear'; databaseCheck: 'complete'; duplicateFound: false; message: string }
  | { status: 'duplicate'; databaseCheck: 'complete'; duplicateFound: true; message: string }
  | { status: 'incomplete'; databaseCheck: Exclude<ImportDatabaseCheckStatus, 'complete'>; duplicateFound: false; message: string }

export type NonNewsResponseWorkflowStatus =
  | 'idle'
  | 'parsed'
  | 'validating'
  | 'review-invalid'
  | 'review-warning'
  | 'ready'
  | 'confirming'
  | 'saving'
  | 'save-failed'
  | 'saved'

