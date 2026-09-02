export const postStatusErrorCodes = [
  'ATTEMPT_NOT_FOUND', 'NO_SYNCABLE_WORDPRESS_ID', 'CALLER_UNAUTHORIZED', 'ORIGIN_FORBIDDEN',
  'WORDPRESS_CONFIGURATION_INVALID', 'WORDPRESS_AUTH_FAILURE', 'WORDPRESS_POST_NOT_FOUND',
  'WORDPRESS_ACCESS_DENIED', 'WORDPRESS_TIMEOUT', 'WORDPRESS_CONNECTION_FAILURE',
  'WORDPRESS_REDIRECT_REJECTED', 'WORDPRESS_RESPONSE_OVERSIZED', 'WORDPRESS_RESPONSE_INVALID',
  'WORDPRESS_IDENTITY_MISMATCH', 'WORDPRESS_UNKNOWN_STATUS', 'MANUAL_RECONCILIATION_REQUIRED', 'UNKNOWN',
] as const

export type PostStatusErrorCode = typeof postStatusErrorCodes[number]

const messages: Record<PostStatusErrorCode, string> = {
  ATTEMPT_NOT_FOUND: 'WordPress 발행 시도를 찾을 수 없습니다.',
  NO_SYNCABLE_WORDPRESS_ID: '확인할 수 있는 성공한 WordPress 초안 발행 시도가 아닙니다.',
  CALLER_UNAUTHORIZED: '이 WordPress 상태를 확인할 권한이 없습니다.',
  ORIGIN_FORBIDDEN: '허용되지 않은 앱 origin입니다.',
  WORDPRESS_CONFIGURATION_INVALID: 'WordPress 연결 설정이 올바르지 않습니다.',
  WORDPRESS_AUTH_FAILURE: 'WordPress 인증에 실패했습니다.',
  WORDPRESS_POST_NOT_FOUND: 'WordPress 게시물을 찾을 수 없습니다.',
  WORDPRESS_ACCESS_DENIED: 'WordPress 게시물을 읽을 권한이 없습니다.',
  WORDPRESS_TIMEOUT: 'WordPress 응답 시간이 초과되었습니다.',
  WORDPRESS_CONNECTION_FAILURE: 'WordPress에 연결할 수 없습니다.',
  WORDPRESS_REDIRECT_REJECTED: 'WordPress 리디렉션을 허용하지 않습니다.',
  WORDPRESS_RESPONSE_OVERSIZED: 'WordPress 응답이 허용 범위를 초과했습니다.',
  WORDPRESS_RESPONSE_INVALID: 'WordPress 응답 형식이 올바르지 않습니다.',
  WORDPRESS_IDENTITY_MISMATCH: 'WordPress 게시물 ID가 저장된 발행 기록과 다릅니다.',
  WORDPRESS_UNKNOWN_STATUS: '지원하지 않는 WordPress 게시물 상태입니다.',
  MANUAL_RECONCILIATION_REQUIRED: '수동 확인이 필요합니다.',
  UNKNOWN: 'WordPress 상태를 안전하게 확인하지 못했습니다.',
}

export class PostStatusError extends Error {
  constructor(readonly code: PostStatusErrorCode, readonly httpStatus = 500) {
    super(messages[code])
    this.name = 'PostStatusError'
  }
}

export function asPostStatusError(error: unknown): PostStatusError {
  return error instanceof PostStatusError ? error : new PostStatusError('UNKNOWN')
}

export function safeErrorBody(error: PostStatusError) {
  return { schemaVersion: 1 as const, ok: false as const, error: { code: error.code, message: error.message, retryable: false } }
}
