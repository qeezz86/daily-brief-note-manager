import { SafeImportError } from './importExecution.types'

interface RepositoryError { code?: string; message?: string; details?: string; hint?: string }

const messages: Record<string, string> = {
  IMPORT_TRACKING_INVALID_PAYLOAD: '뉴스 추적 payload 형식이 올바르지 않습니다.',
  IMPORT_TRACKING_INVALID_POST: '추적 데이터를 연결할 게시물을 찾을 수 없습니다.',
  IMPORT_TRACKING_NOT_NEWS: '뉴스 게시물에만 추적 데이터를 저장할 수 있습니다.',
  IMPORT_TRACKING_TOPIC_CONFLICT: '기존 주제와 Import 데이터가 충돌합니다.',
  IMPORT_TRACKING_DUPLICATE_TOPIC_KEY: '주제 외부 키 또는 주제 키가 중복되었습니다.',
  IMPORT_TRACKING_DUPLICATE_UPDATE_KEY: '업데이트 외부 키가 중복되었습니다.',
  IMPORT_TRACKING_MISSING_PREVIOUS: '이전 업데이트 참조를 찾을 수 없습니다.',
  IMPORT_TRACKING_PREVIOUS_CYCLE: '이전 업데이트 관계에 순환 참조가 있습니다.',
  IMPORT_TRACKING_INVALID_UPDATE_TYPE: '뉴스 업데이트 유형이나 필수 내용이 올바르지 않습니다.',
  IMPORT_TRACKING_INVALID_CLOSURE: '종료 주제 또는 종료 메모 규칙이 올바르지 않습니다.',
  IMPORT_TRACKING_INVALID_ITEM_ORDER: '뉴스 항목 순서가 올바르지 않습니다.',
  IMPORT_TRACKING_SOURCE_NOT_FOUND: '업데이트가 참조한 게시물 출처를 찾을 수 없습니다.',
  IMPORT_TRACKING_SOURCE_CONFLICT: '출처가 이미 연결되었거나 여러 업데이트에서 중복 참조되었습니다.',
  IMPORT_TRACKING_INVALID_FOLLOWUP: '후속 확인 항목의 상태나 필수 내용이 올바르지 않습니다.',
}

export function mapKnownTrackingImportError(error: unknown): SafeImportError {
  if (error instanceof SafeImportError) return error
  const row = error && typeof error === 'object' ? error as RepositoryError : {}
  const detail = `${row.message ?? ''} ${row.details ?? ''} ${row.hint ?? ''}`
  const code = Object.keys(messages).find((candidate) => detail.includes(candidate))
  if (code) return new SafeImportError(code, messages[code])
  if (row.code === '42501' || detail.includes('IMPORT_TRACKING_PERMISSION_DENIED') || detail.includes('JWT')) return new SafeImportError('IMPORT_TRACKING_PERMISSION_DENIED', '인증이 만료되었거나 추적 데이터 Import 권한이 없습니다.', true)
  if (row.code === 'PGRST202' || detail.includes('import_news_tracking_for_post')) return new SafeImportError('IMPORT_TRACKING_RPC_UNAVAILABLE', '뉴스 추적 Import RPC를 사용할 수 없습니다. DB migration 상태를 확인해 주세요.', true)
  if (row.code?.startsWith('PGRST') || /failed to fetch|network|connection/i.test(detail)) return new SafeImportError('IMPORT_TRACKING_CONNECTION_FAILED', 'DB 연결이 끊어져 남은 Import를 중단했습니다.', true)
  return new SafeImportError('IMPORT_TRACKING_UNKNOWN', '뉴스 추적 데이터를 Import하지 못했습니다. 입력과 현재 주제 상태를 확인해 주세요.')
}
