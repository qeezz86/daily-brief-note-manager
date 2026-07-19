export const draftErrorCodes = [
  'METHOD_NOT_ALLOWED', 'INVALID_REQUEST', 'ORIGIN_FORBIDDEN', 'CALLER_UNAUTHENTICATED',
  'CALLER_FORBIDDEN', 'CONFIG_MISSING', 'CONTENT_NOT_FOUND', 'SOURCE_CHANGED',
  'PAYLOAD_FINGERPRINT_MISMATCH', 'PUBLICATION_PLAN_BLOCKED', 'WORDPRESS_CAPABILITY_MISSING',
  'WORDPRESS_DUPLICATE_SLUG', 'CONFIRMATION_REQUIRED', 'IDEMPOTENCY_KEY_REUSED',
  'REQUEST_IN_PROGRESS', 'EXISTING_DRAFT_RECORD', 'WORDPRESS_DRAFT_REJECTED',
  'WORDPRESS_DRAFT_RESPONSE_INVALID', 'WORDPRESS_DRAFT_TIMEOUT_UNCERTAIN',
  'WORDPRESS_DRAFT_RESULT_UNCERTAIN', 'AUDIT_RECORD_FAILED',
  'MANUAL_RECONCILIATION_REQUIRED',
] as const

export type DraftErrorCode = typeof draftErrorCodes[number]

const messages: Record<DraftErrorCode, string> = {
  METHOD_NOT_ALLOWED: '허용되지 않은 요청 방식입니다.',
  INVALID_REQUEST: 'WordPress 초안 생성 요청 형식이 올바르지 않습니다.',
  ORIGIN_FORBIDDEN: '허용되지 않은 Origin입니다.',
  CALLER_UNAUTHENTICATED: '로그인이 필요한 요청입니다.',
  CALLER_FORBIDDEN: '이 WordPress 연결을 사용할 권한이 없습니다.',
  CONFIG_MISSING: 'WordPress 서버 설정을 확인할 수 없습니다.',
  CONTENT_NOT_FOUND: '요청한 콘텐츠를 찾을 수 없습니다.',
  SOURCE_CHANGED: '콘텐츠가 검토 이후 변경되었습니다. 새 Dry Run을 실행해 주세요.',
  PAYLOAD_FINGERPRINT_MISMATCH: '검토한 payload와 현재 서버 payload가 다릅니다. 새 Dry Run을 실행해 주세요.',
  PUBLICATION_PLAN_BLOCKED: '현재 publication plan에는 초안 생성을 막는 항목이 있습니다.',
  WORDPRESS_CAPABILITY_MISSING: 'WordPress 계정에 draft 생성 권한이 없습니다.',
  WORDPRESS_DUPLICATE_SLUG: '동일 slug의 WordPress 글이 이미 있습니다.',
  CONFIRMATION_REQUIRED: 'WordPress 초안 1건 생성 확인이 필요합니다.',
  IDEMPOTENCY_KEY_REUSED: '이 idempotency key가 다른 요청에 이미 사용되었습니다.',
  REQUEST_IN_PROGRESS: '같은 초안 생성 요청이 이미 진행 중입니다.',
  EXISTING_DRAFT_RECORD: '이 콘텐츠에는 이미 성공한 WordPress 초안 기록이 있습니다.',
  WORDPRESS_DRAFT_REJECTED: 'WordPress가 초안 생성 요청을 거부했습니다.',
  WORDPRESS_DRAFT_RESPONSE_INVALID: 'WordPress 초안 응답을 안전하게 확인하지 못했습니다.',
  WORDPRESS_DRAFT_TIMEOUT_UNCERTAIN: 'WordPress 응답 시간이 초과되어 초안 생성 여부를 확인할 수 없습니다.',
  WORDPRESS_DRAFT_RESULT_UNCERTAIN: 'WordPress 초안 생성 결과가 불명확합니다.',
  AUDIT_RECORD_FAILED: '외부 작업 결과를 감사 기록에 안전하게 저장하지 못했습니다.',
  MANUAL_RECONCILIATION_REQUIRED: '자동 재시도하지 마세요. WordPress 관리자에서 slug를 직접 확인해야 합니다.',
}

export class DraftError extends Error {
  constructor(
    readonly code: DraftErrorCode,
    readonly httpStatus = 500,
    readonly retryable = false,
    readonly attemptId?: string,
  ) {
    super(messages[code])
    this.name = 'DraftError'
  }
}

export function safeDraftError(error: unknown) {
  const safe = error instanceof DraftError ? error : new DraftError('AUDIT_RECORD_FAILED', 500)
  return {
    status: safe.httpStatus,
    body: {
      schemaVersion: 1 as const,
      ok: false as const,
      error: {
        code: safe.code,
        message: safe.message,
        retryable: safe.retryable,
        ...(safe.attemptId ? { attemptId: safe.attemptId } : {}),
      },
    },
  }
}
