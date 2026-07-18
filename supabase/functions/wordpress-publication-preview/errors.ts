export const publicationErrorCodes = [
  'METHOD_NOT_ALLOWED',
  'INVALID_REQUEST',
  'CALLER_UNAUTHENTICATED',
  'CALLER_FORBIDDEN',
  'CONTENT_NOT_FOUND',
  'WORDPRESS_READ_FAILED',
  'WORDPRESS_CATALOG_INCOMPLETE',
  'PREVIEW_INCOMPLETE',
] as const

export type PublicationErrorCode = typeof publicationErrorCodes[number]

const messages: Record<PublicationErrorCode, string> = {
  METHOD_NOT_ALLOWED: '허용되지 않은 요청 방식입니다.',
  INVALID_REQUEST: 'WordPress Dry Run 요청 형식이 올바르지 않습니다.',
  CALLER_UNAUTHENTICATED: '로그인이 필요한 요청입니다.',
  CALLER_FORBIDDEN: '이 WordPress 연결을 사용할 권한이 없습니다.',
  CONTENT_NOT_FOUND: '요청한 콘텐츠를 찾을 수 없습니다.',
  WORDPRESS_READ_FAILED: 'WordPress 읽기 요청을 완료하지 못했습니다.',
  WORDPRESS_CATALOG_INCOMPLETE: 'WordPress taxonomy 전체 목록을 안전하게 확인하지 못했습니다.',
  PREVIEW_INCOMPLETE: 'WordPress Dry Run 계획을 완료하지 못했습니다.',
}

export class PublicationError extends Error {
  readonly code: PublicationErrorCode
  readonly httpStatus: number
  readonly retryable: boolean

  constructor(code: PublicationErrorCode, options: { httpStatus?: number; retryable?: boolean } = {}) {
    super(messages[code])
    this.name = 'PublicationError'
    this.code = code
    this.httpStatus = options.httpStatus ?? 500
    this.retryable = options.retryable ?? false
  }
}

export function safePublicationError(error: unknown) {
  const safe = error instanceof PublicationError
    ? error
    : new PublicationError('PREVIEW_INCOMPLETE', { retryable: true })
  return {
    status: safe.httpStatus,
    body: {
      schemaVersion: 1 as const,
      ok: false as const,
      error: { code: safe.code, message: safe.message, retryable: safe.retryable },
    },
  }
}
