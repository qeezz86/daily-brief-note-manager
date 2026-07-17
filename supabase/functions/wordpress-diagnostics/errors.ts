export const diagnosticErrorCodes = [
  'METHOD_NOT_ALLOWED',
  'INVALID_REQUEST',
  'CALLER_UNAUTHENTICATED',
  'CALLER_FORBIDDEN',
  'CONFIG_MISSING',
  'CONFIG_INVALID',
  'ORIGIN_FORBIDDEN',
  'WORDPRESS_URL_INVALID',
  'WORDPRESS_REDIRECTED',
  'REST_API_UNREACHABLE',
  'REST_API_UNAVAILABLE',
  'APPLICATION_PASSWORDS_UNAVAILABLE',
  'WORDPRESS_AUTH_FAILED',
  'WORDPRESS_FORBIDDEN',
  'WORDPRESS_RATE_LIMITED',
  'WORDPRESS_TIMEOUT',
  'WORDPRESS_RESPONSE_INVALID',
  'WORDPRESS_HTTP_ERROR',
  'DIAGNOSTIC_INCOMPLETE',
] as const

export type DiagnosticErrorCode = typeof diagnosticErrorCodes[number]

const defaultMessages: Record<DiagnosticErrorCode, string> = {
  METHOD_NOT_ALLOWED: '허용되지 않은 요청 방식입니다.',
  INVALID_REQUEST: '진단 요청 형식이 올바르지 않습니다.',
  CALLER_UNAUTHENTICATED: '로그인이 필요한 요청입니다.',
  CALLER_FORBIDDEN: '이 연결을 진단할 권한이 없습니다.',
  CONFIG_MISSING: 'WordPress 연결 설정이 완료되지 않았습니다.',
  CONFIG_INVALID: 'WordPress 연결 설정이 올바르지 않습니다.',
  ORIGIN_FORBIDDEN: '허용되지 않은 앱 origin입니다.',
  WORDPRESS_URL_INVALID: 'WordPress 사이트 URL 설정이 올바르지 않습니다.',
  WORDPRESS_REDIRECTED: 'WordPress REST URL이 다른 위치로 이동되었습니다.',
  REST_API_UNREACHABLE: 'WordPress REST API에 연결할 수 없습니다.',
  REST_API_UNAVAILABLE: 'WordPress REST API를 사용할 수 없습니다.',
  APPLICATION_PASSWORDS_UNAVAILABLE: 'Application Password 사용 가능 여부를 확인할 수 없습니다.',
  WORDPRESS_AUTH_FAILED: 'WordPress 인증에 실패했습니다.',
  WORDPRESS_FORBIDDEN: 'WordPress 진단에 필요한 읽기 권한이 없습니다.',
  WORDPRESS_RATE_LIMITED: 'WordPress 요청 한도를 초과했습니다.',
  WORDPRESS_TIMEOUT: 'WordPress 응답 시간이 초과되었습니다.',
  WORDPRESS_RESPONSE_INVALID: 'WordPress 응답 형식이 올바르지 않습니다.',
  WORDPRESS_HTTP_ERROR: 'WordPress가 진단 요청을 처리하지 못했습니다.',
  DIAGNOSTIC_INCOMPLETE: 'WordPress 진단을 완료하지 못했습니다.',
}

export class DiagnosticError extends Error {
  readonly code: DiagnosticErrorCode
  readonly httpStatus: number
  readonly retryable: boolean

  constructor(code: DiagnosticErrorCode, options: { httpStatus?: number; retryable?: boolean } = {}) {
    super(defaultMessages[code])
    this.name = 'DiagnosticError'
    this.code = code
    this.httpStatus = options.httpStatus ?? 500
    this.retryable = options.retryable ?? false
  }
}

export function asDiagnosticError(error: unknown): DiagnosticError {
  if (error instanceof DiagnosticError) return error
  return new DiagnosticError('DIAGNOSTIC_INCOMPLETE', { httpStatus: 500, retryable: true })
}

export function safeErrorBody(error: DiagnosticError) {
  return {
    schemaVersion: 1 as const,
    ok: false as const,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  }
}
