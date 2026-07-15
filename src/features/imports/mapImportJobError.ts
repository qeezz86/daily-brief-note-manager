export class SafeImportJobError extends Error {
  constructor(public readonly errorCode: string, message: string, public readonly stopExecution = false) { super(message) }
}

interface RepositoryError { code?: string; message?: string; details?: string; hint?: string }

const messages: Record<string, string> = {
  IMPORT_JOB_INVALID_INPUT: 'Import 작업 정보가 올바르지 않습니다.',
  IMPORT_JOB_INVALID_CHUNK: '한 번에 등록할 수 있는 항목 수는 1~100개입니다.',
  IMPORT_JOB_INVALID_ITEM: '저장할 Import snapshot이 올바르지 않습니다.',
  IMPORT_JOB_INVALID_CATEGORY: '카테고리가 없거나 비활성 상태입니다.',
  IMPORT_JOB_WARNING_NOT_ACKNOWLEDGED: '경고 항목은 승인 후 작업에 등록할 수 있습니다.',
  IMPORT_JOB_ITEM_CONFLICT: '같은 순서에 다른 snapshot이 이미 등록되어 있습니다.',
  IMPORT_JOB_FINALIZE_MISMATCH: '등록된 항목 수나 순서가 예상값과 일치하지 않습니다.',
  IMPORT_JOB_NOT_PREPARING: '준비가 끝난 작업에는 snapshot을 추가할 수 없습니다.',
  IMPORT_JOB_NOT_RUNNABLE: '아직 실행할 수 없는 Import 작업입니다.',
  IMPORT_JOB_CANCELLED: '취소된 작업은 재개한 뒤 실행할 수 있습니다.',
  IMPORT_JOB_ITEM_NOT_RETRYABLE: '이 오류는 같은 snapshot으로 다시 시도할 수 없습니다.',
  IMPORT_JOB_CONTENT_REQUIRED: '콘텐츠 단계가 성공한 뒤 tracking을 실행할 수 있습니다.',
  IMPORT_JOB_NOT_FOUND: 'Import 작업을 찾을 수 없습니다.',
  IMPORT_JOB_ITEM_NOT_FOUND: 'Import 항목을 찾을 수 없습니다.',
  IMPORT_JOB_EXECUTION_LOCKED: '백업에서 복원된 과거 Import 이력은 다시 실행할 수 없습니다.',
}

export function mapImportJobError(error: unknown) {
  if (error instanceof SafeImportJobError) return error
  const row = error && typeof error === 'object' ? error as RepositoryError : {}
  const detail = `${row.message ?? ''} ${row.details ?? ''} ${row.hint ?? ''}`
  const known = Object.keys(messages).find((code) => detail.includes(code))
  if (known) return new SafeImportJobError(known, messages[known])
  if (row.code === '42501' || detail.includes('IMPORT_JOB_AUTH_REQUIRED') || detail.includes('JWT')) {
    return new SafeImportJobError('IMPORT_JOB_AUTH_REQUIRED', '인증이 만료되었거나 작업 권한이 없습니다.', true)
  }
  if (row.code === 'PGRST202') return new SafeImportJobError('IMPORT_JOB_RPC_UNAVAILABLE', 'Import job migration 상태를 확인해 주세요.', true)
  if (row.code?.startsWith('PGRST') || /failed to fetch|network|connection/i.test(detail)) {
    return new SafeImportJobError('IMPORT_JOB_CONNECTION_FAILED', 'DB 연결이 끊겼습니다. 작업 상세를 다시 조회해 현재 상태를 확인해 주세요.', true)
  }
  return new SafeImportJobError('IMPORT_JOB_UNKNOWN', 'Import 작업을 처리하지 못했습니다. 작업 상세에서 현재 상태를 확인해 주세요.')
}
