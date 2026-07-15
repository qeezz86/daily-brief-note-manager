import { describe, expect, it } from 'vitest'
import type { BackupSnapshot } from './backup.types'
import { backupSnapshotFixture } from './backups.fixtures'
import { validateImportHistory } from './validateImportHistory'

function fullSnapshot(): BackupSnapshot {
  return structuredClone(backupSnapshotFixture('full'))
}

async function issueCodes(snapshot: BackupSnapshot) {
  return (await validateImportHistory(snapshot)).map((item) => item.code)
}

describe('validateImportHistory', () => {
  it('core profile에는 운영 이력 검증을 적용하지 않는다', async () => {
    expect(await validateImportHistory(backupSnapshotFixture('core'))).toEqual([])
  })

  it('정상 full fixture를 허용한다', async () => {
    expect(await validateImportHistory(fullSnapshot())).toEqual([])
  })

  it.each([
    ['item index', (snapshot: BackupSnapshot) => {
      const item = snapshot.data.importJobItems![0]
      snapshot.data.importJobItems!.push({ ...item, id: 'a0000000-0000-4000-8000-000000000002', externalKey: 'item-2' })
    }],
    ['external key', (snapshot: BackupSnapshot) => {
      const item = snapshot.data.importJobItems![0]
      snapshot.data.importJobItems!.push({ ...item, id: 'a0000000-0000-4000-8000-000000000002', itemIndex: 1 })
    }],
  ])('중복 %s를 거부한다', async (_label, mutate) => {
    const snapshot = fullSnapshot()
    mutate(snapshot)
    expect(await issueCodes(snapshot)).toContain('IMPORT_ITEM_KEY_DUPLICATE')
  })

  it.each([
    ['schema version', (payload: Record<string, unknown>) => { payload.schemaVersion = 2 }],
    ['external key', (payload: Record<string, unknown>) => { payload.externalKey = 'different' }],
    ['content group', (payload: Record<string, unknown>) => { payload.contentGroup = 'ai' }],
    ['category', (payload: Record<string, unknown>) => { payload.content = { category_id: 'global' } }],
    ['tracking key', (payload: Record<string, unknown>) => { delete payload.tracking }],
    ['forbidden owner key', (payload: Record<string, unknown>) => { payload.owner_id = 'private' }],
    ['nesting depth', (payload: Record<string, unknown>) => {
      let nested: Record<string, unknown> = {}
      for (let index = 0; index < 32; index += 1) nested = { nested }
      payload.extra = nested
    }],
  ])('정규화 payload의 잘못된 %s를 거부한다', async (_label, mutate) => {
    const snapshot = fullSnapshot()
    mutate(snapshot.data.importJobItems![0].normalizedPayload)
    expect(await issueCodes(snapshot)).toContain('IMPORT_NORMALIZED_PAYLOAD_INVALID')
  })

  it('payload fingerprint 불일치를 거부한다', async () => {
    const snapshot = fullSnapshot()
    snapshot.data.importJobItems![0].payloadFingerprint = 'f'.repeat(64)
    expect(await issueCodes(snapshot)).toContain('IMPORT_PAYLOAD_FINGERPRINT_MISMATCH')
  })

  it.each([
    'Bearer private-token',
    'SQLSTATE 23505',
    'constraint users_email_key',
    'stack trace follows',
    'Authorization header',
    'Cookie session=private',
    'password leaked',
    'service_role key',
    'access_token leaked',
    'refresh-token leaked',
    'select secret from private_table',
    'delete record from private_table',
  ])('민감 오류 패턴 %s를 item에서 차단한다', async (message) => {
    const snapshot = fullSnapshot()
    snapshot.data.importJobItems![0].contentErrorMessage = message
    expect(await issueCodes(snapshot)).toContain('IMPORT_UNSAFE_ERROR')
  })

  it.each([
    ['imported without post', 'IMPORT_CONTENT_POST_MISSING', (snapshot: BackupSnapshot) => { snapshot.data.importJobItems![0].postId = null }],
    ['pending with post', 'IMPORT_PENDING_POST_CONFLICT', (snapshot: BackupSnapshot) => { snapshot.data.importJobItems![0].contentStatus = 'pending' }],
    ['tracking imported before content', 'IMPORT_TRACKING_CONTENT_INVALID', (snapshot: BackupSnapshot) => {
      const item = snapshot.data.importJobItems![0]
      item.contentStatus = 'failed'; item.trackingStatus = 'imported'
    }],
    ['reversed content timestamps', 'IMPORT_ITEM_TIMESTAMP_INVALID', (snapshot: BackupSnapshot) => {
      const item = snapshot.data.importJobItems![0]
      item.contentStartedAt = '2026-07-15T00:01:00Z'; item.contentCompletedAt = '2026-07-15T00:00:00Z'
    }],
    ['reversed tracking timestamps', 'IMPORT_ITEM_TIMESTAMP_INVALID', (snapshot: BackupSnapshot) => {
      const item = snapshot.data.importJobItems![0]
      item.trackingStartedAt = '2026-07-15T00:01:00Z'; item.trackingCompletedAt = '2026-07-15T00:00:00Z'
    }],
    ['news not applicable tracking', 'IMPORT_TRACKING_NOT_APPLICABLE_INVALID', (snapshot: BackupSnapshot) => { snapshot.data.importJobItems![0].trackingStatus = 'not_applicable' }],
    ['not present with tracking payload', 'IMPORT_TRACKING_NOT_PRESENT_INVALID', (snapshot: BackupSnapshot) => { snapshot.data.importJobItems![0].normalizedPayload.tracking = {} }],
  ])('%s 관계 위반을 %s로 보고한다', async (_label, code, mutate) => {
    const snapshot = fullSnapshot()
    mutate(snapshot)
    expect(await issueCodes(snapshot)).toContain(code)
  })

  it.each([
    ['duplicate attempt', 'IMPORT_ATTEMPT_DUPLICATE', (snapshot: BackupSnapshot) => {
      snapshot.data.importJobItemAttempts!.push({ ...snapshot.data.importJobItemAttempts![0], id: 'b0000000-0000-4000-8000-000000000002' })
    }],
    ['unsafe attempt error', 'IMPORT_UNSAFE_ERROR', (snapshot: BackupSnapshot) => { snapshot.data.importJobItemAttempts![0].safeErrorMessage = 'SQLSTATE 23505' }],
    ['reversed attempt timestamps', 'IMPORT_ATTEMPT_TIMESTAMP_INVALID', (snapshot: BackupSnapshot) => {
      const attempt = snapshot.data.importJobItemAttempts![0]
      attempt.startedAt = '2026-07-15T00:01:00Z'; attempt.completedAt = '2026-07-15T00:00:00Z'
    }],
    ['missing attempt', 'IMPORT_ATTEMPT_COUNT_MISMATCH', (snapshot: BackupSnapshot) => { snapshot.data.importJobItemAttempts = [] }],
    ['non-sequential attempt', 'IMPORT_ATTEMPT_COUNT_MISMATCH', (snapshot: BackupSnapshot) => { snapshot.data.importJobItemAttempts![0].attemptNo = 2 }],
  ])('%s 이력 위반을 %s로 보고한다', async (_label, code, mutate) => {
    const snapshot = fullSnapshot()
    mutate(snapshot)
    expect(await issueCodes(snapshot)).toContain(code)
  })

  it.each([
    ['item count', 'IMPORT_JOB_ITEM_COUNT_MISMATCH', (snapshot: BackupSnapshot) => { snapshot.data.importJobs![0].totalCount = 2 }],
    ['completed with failed item', 'IMPORT_COMPLETED_STATUS_INVALID', (snapshot: BackupSnapshot) => { snapshot.data.importJobItems![0].contentStatus = 'failed' }],
    ['completed_with_errors without failure', 'IMPORT_COMPLETED_WITH_ERRORS_INVALID', (snapshot: BackupSnapshot) => { snapshot.data.importJobs![0].status = 'completed_with_errors' }],
    ['reversed job timestamps', 'IMPORT_JOB_TIMESTAMP_INVALID', (snapshot: BackupSnapshot) => {
      const job = snapshot.data.importJobs![0]
      job.startedAt = '2026-07-15T00:02:00Z'; job.completedAt = '2026-07-15T00:01:00Z'
    }],
  ])('%s job 위반을 %s로 보고한다', async (_label, code, mutate) => {
    const snapshot = fullSnapshot()
    mutate(snapshot)
    expect(await issueCodes(snapshot)).toContain(code)
  })
})
