import { SafeImportError } from './importExecution.types'

interface RepositoryError { code?: string; message?: string; details?: string; hint?: string }

const knownErrors: Array<[string, string]> = [
  ['IMPORT_DUPLICATE_SLUG', '같은 slug의 콘텐츠가 이미 존재합니다.'],
  ['IMPORT_DUPLICATE_WORDPRESS_URL', '같은 WordPress URL의 콘텐츠가 이미 존재합니다.'],
  ['IMPORT_DUPLICATE_BRIEFING', '같은 카테고리와 날짜의 브리핑이 이미 존재합니다.'],
  ['IMPORT_DUPLICATE_SERIES', '같은 카테고리와 시리즈 번호의 콘텐츠가 이미 존재합니다.'],
  ['IMPORT_DUPLICATE_CHINESE_URL', '같은 중국어 원문 URL의 콘텐츠가 이미 존재합니다.'],
  ['IMPORT_INVALID_CATEGORY', '카테고리가 없거나 비활성 상태입니다.'],
  ['IMPORT_INVALID_METADATA', '카테고리 metadata가 올바르지 않습니다.'],
  ['IMPORT_FORBIDDEN_FIELD', 'Import payload에 허용되지 않은 내부 필드가 있습니다.'],
  ['IMPORT_VALIDATION_FAILED', 'DB 저장 검증을 통과하지 못했습니다.'],
]

export function mapKnownImportError(error: unknown): SafeImportError {
  if (error instanceof SafeImportError) return error
  const row = error && typeof error === 'object' ? error as RepositoryError : {}
  const detail = `${row.message ?? ''} ${row.details ?? ''} ${row.hint ?? ''}`
  const known = knownErrors.find(([code]) => detail.includes(code))
  if (known) return new SafeImportError(known[0], known[1])
  if (row.code === '42501' || detail.includes('IMPORT_AUTH_REQUIRED') || detail.includes('JWT')) {
    return new SafeImportError('IMPORT_AUTH_REQUIRED', '인증이 만료되었거나 Import 권한이 없습니다.', true)
  }
  if (row.code === 'PGRST202' || detail.includes('import_content_post')) {
    return new SafeImportError('IMPORT_RPC_UNAVAILABLE', 'Import RPC를 사용할 수 없습니다. DB migration 상태를 확인해 주세요.', true)
  }
  if (row.code?.startsWith('PGRST') || /failed to fetch|network|connection/i.test(detail)) {
    return new SafeImportError('IMPORT_CONNECTION_FAILED', 'DB 연결이 끊어져 남은 Import를 중단했습니다.', true)
  }
  return new SafeImportError('IMPORT_UNKNOWN_ERROR', '콘텐츠를 Import하지 못했습니다. 입력과 DB 상태를 확인해 주세요.')
}
