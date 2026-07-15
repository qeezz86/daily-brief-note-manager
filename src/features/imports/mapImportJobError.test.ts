import { describe, expect, it } from 'vitest'
import { mapImportJobError } from './mapImportJobError'

describe('mapImportJobError', () => {
  it.each([
    ['IMPORT_JOB_INVALID_INPUT', 'Import 작업 정보'],
    ['IMPORT_JOB_INVALID_CHUNK', '1~100개'],
    ['IMPORT_JOB_INVALID_ITEM', 'snapshot'],
    ['IMPORT_JOB_INVALID_CATEGORY', '카테고리'],
    ['IMPORT_JOB_WARNING_NOT_ACKNOWLEDGED', '경고 항목'],
    ['IMPORT_JOB_ITEM_CONFLICT', '다른 snapshot'],
    ['IMPORT_JOB_FINALIZE_MISMATCH', '예상값'],
    ['IMPORT_JOB_NOT_PREPARING', '준비가 끝난'],
    ['IMPORT_JOB_NOT_RUNNABLE', '실행할 수 없는'],
    ['IMPORT_JOB_CANCELLED', '취소된 작업'],
    ['IMPORT_JOB_ITEM_NOT_RETRYABLE', '다시 시도할 수 없습니다'],
    ['IMPORT_JOB_CONTENT_REQUIRED', '콘텐츠 단계'],
    ['IMPORT_JOB_NOT_FOUND', '작업을 찾을 수 없습니다'],
    ['IMPORT_JOB_ITEM_NOT_FOUND', '항목을 찾을 수 없습니다'],
    ['IMPORT_JOB_EXECUTION_LOCKED', '백업에서 복원된 과거 Import 이력'],
  ])('%s를 안정적인 한국어 오류로 변환한다', (code, message) => {
    const error = mapImportJobError({ code: '22023', message: `raw ${code} constraint_secret` })
    expect(error.errorCode).toBe(code)
    expect(error.message).toContain(message)
    expect(error.message).not.toContain('constraint_secret')
  })

  it('권한 오류는 실행 중단 오류로 변환한다', () => { const error = mapImportJobError({ code: '42501', message: 'JWT expired' }); expect(error.errorCode).toBe('IMPORT_JOB_AUTH_REQUIRED'); expect(error.stopExecution).toBe(true) })
  it('RPC schema 불일치는 migration 안내로 변환한다', () => { const error = mapImportJobError({ code: 'PGRST202', message: 'raw' }); expect(error.errorCode).toBe('IMPORT_JOB_RPC_UNAVAILABLE'); expect(error.message).not.toContain('raw') })
  it('network 오류는 상태 재조회 안내로 변환한다', () => { const error = mapImportJobError({ message: 'Failed to fetch secret endpoint' }); expect(error.errorCode).toBe('IMPORT_JOB_CONNECTION_FAILED'); expect(error.stopExecution).toBe(true); expect(error.message).toContain('현재 상태') })
  it('unknown DB 오류는 원문을 노출하지 않는다', () => { const error = mapImportJobError({ code: 'XX000', message: 'private table and SQL query' }); expect(error.errorCode).toBe('IMPORT_JOB_UNKNOWN'); expect(error.message).not.toContain('private table') })
})
