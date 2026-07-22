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

export const diagnosticEndpoints = [
  'discovery',
  'user',
  'types',
  'statuses',
  'categories',
  'tags',
  'posts',
] as const

export type DiagnosticEndpoint = typeof diagnosticEndpoints[number]

export const diagnosticFailurePhases = [
  'content_length_header',
  'response_body_limit',
  'content_type',
  'json_parse',
  'upstream_status',
] as const

export type DiagnosticFailurePhase = typeof diagnosticFailurePhases[number]

export interface DiagnosticMetadata {
  endpoint: DiagnosticEndpoint
  failurePhase: DiagnosticFailurePhase
  upstreamStatus: number
  contentType: string
  contentLength: number | null
  bytesReceived: number
  responseOverLimit: boolean
}

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

function safeNonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function safeContentLength(value: number | null): number | null {
  if (value === null) return null
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function safeContentType(value: string): string {
  const normalized = value.trim().toLowerCase().slice(0, 127)

  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
    ? normalized
    : 'unknown'
}

function safeDiagnosticMetadata(
  value: DiagnosticMetadata | undefined,
): DiagnosticMetadata | undefined {
  if (!value) return undefined

  return {
    endpoint: value.endpoint,
    failurePhase: value.failurePhase,
    upstreamStatus: safeNonNegativeInteger(value.upstreamStatus),
    contentType: safeContentType(value.contentType),
    contentLength: safeContentLength(value.contentLength),
    bytesReceived: safeNonNegativeInteger(value.bytesReceived),
    responseOverLimit: value.responseOverLimit === true,
  }
}

export class DiagnosticError extends Error {
  readonly code: DiagnosticErrorCode
  readonly httpStatus: number
  readonly retryable: boolean
  readonly diagnostics?: DiagnosticMetadata

  constructor(
    code: DiagnosticErrorCode,
    options: {
      httpStatus?: number
      retryable?: boolean
      diagnostics?: DiagnosticMetadata
    } = {},
  ) {
    super(defaultMessages[code])
    this.name = 'DiagnosticError'
    this.code = code
    this.httpStatus = options.httpStatus ?? 500
    this.retryable = options.retryable ?? false
    this.diagnostics = safeDiagnosticMetadata(options.diagnostics)
  }
}

export function asDiagnosticError(error: unknown): DiagnosticError {
  if (error instanceof DiagnosticError) return error

  return new DiagnosticError(
    'DIAGNOSTIC_INCOMPLETE',
    {
      httpStatus: 500,
      retryable: true,
    },
  )
}

export function safeErrorBody(error: DiagnosticError) {
  const diagnostics = error.diagnostics

  return {
    schemaVersion: 1 as const,
    ok: false as const,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(diagnostics
        ? {
            diagnostics: {
              endpoint: diagnostics.endpoint,
              failure_phase: diagnostics.failurePhase,
              upstream_status: diagnostics.upstreamStatus,
              content_type: diagnostics.contentType,
              content_length: diagnostics.contentLength,
              bytes_received: diagnostics.bytesReceived,
              response_over_limit: diagnostics.responseOverLimit,
            },
          }
        : {}),
    },
  }
}