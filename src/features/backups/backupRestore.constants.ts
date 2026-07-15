import { BACKUP_HARD_LIMIT_BYTES } from './backup.constants'

export const BACKUP_RESTORE_VALIDATION_VERSION = 1 as const
export const BACKUP_RESTORE_MAX_BYTES = BACKUP_HARD_LIMIT_BYTES
export const BACKUP_RESTORE_LIST_LIMIT = 200
export const BACKUP_RESTORE_QUERY_CHUNK_SIZE = 100

export const BACKUP_RESTORE_STEPS = [
  'JSON 형식 확인',
  'checksum 재계산',
  'manifest·section 검증',
  '관계·민감정보 검사',
  'category 호환성 비교',
  '현재 DB 충돌 조회',
  'ID 정책 후보 분석',
] as const
