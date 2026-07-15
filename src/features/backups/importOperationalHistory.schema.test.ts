import { describe, expect, it } from 'vitest'
import { backupRestoreSectionSchemas } from './backupRestore.schema'
import { backupSnapshotFixture } from './backups.fixtures'

function rows() {
  const data = structuredClone(backupSnapshotFixture('full').data)
  return {
    job: data.importJobs![0],
    item: data.importJobItems![0],
    attempt: data.importJobItemAttempts![0],
  }
}

describe('operational Import history restore schemas', () => {
  it.each(['preparing', 'ready', 'running', 'completed', 'completed_with_errors', 'cancelled', 'failed'] as const)(
    'job 상태 %s를 허용한다',
    (status) => {
      const { job } = rows()
      expect(backupRestoreSectionSchemas.importJobs.safeParse([{ ...job, status }]).success).toBe(true)
    },
  )

  it('알 수 없는 job 상태를 거부한다', () => {
    const { job } = rows()
    expect(backupRestoreSectionSchemas.importJobs.safeParse([{ ...job, status: 'unknown' }]).success).toBe(false)
  })

  it.each([
    ['ordinary explicit', { restoredFromBackup: false, executionLocked: false, restoreOriginChecksum: null }, true],
    ['ordinary omitted', { restoredFromBackup: undefined, executionLocked: undefined, restoreOriginChecksum: undefined }, true],
    ['restored locked', { restoredFromBackup: true, executionLocked: true, restoreOriginChecksum: 'c'.repeat(64) }, true],
    ['restored unlocked', { restoredFromBackup: true, executionLocked: false, restoreOriginChecksum: 'c'.repeat(64) }, false],
    ['restored without origin', { restoredFromBackup: true, executionLocked: true, restoreOriginChecksum: null }, false],
    ['ordinary with origin', { restoredFromBackup: false, executionLocked: false, restoreOriginChecksum: 'c'.repeat(64) }, false],
    ['invalid origin checksum', { restoredFromBackup: true, executionLocked: true, restoreOriginChecksum: 'short' }, false],
  ])('%s provenance 조합을 검증한다', (_label, provenance, expected) => {
    const { job } = rows()
    expect(backupRestoreSectionSchemas.importJobs.safeParse([{ ...job, ...provenance }]).success).toBe(expected)
  })

  it.each(['ready', 'warning'] as const)('item validation 상태 %s를 허용한다', (validationStatus) => {
    const { item } = rows()
    expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, validationStatus }]).success).toBe(true)
  })

  it('알 수 없는 item validation 상태를 거부한다', () => {
    const { item } = rows()
    expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, validationStatus: 'invalid' }]).success).toBe(false)
  })

  it.each(['pending', 'running', 'imported', 'failed', 'skipped_duplicate', 'cancelled'] as const)(
    'content 상태 %s를 허용한다',
    (contentStatus) => {
      const { item } = rows()
      expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, contentStatus }]).success).toBe(true)
    },
  )

  it('알 수 없는 content 상태를 거부한다', () => {
    const { item } = rows()
    expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, contentStatus: 'unknown' }]).success).toBe(false)
  })

  it.each(['not_applicable', 'not_present', 'pending', 'running', 'imported', 'failed', 'cancelled'] as const)(
    'tracking 상태 %s를 허용한다',
    (trackingStatus) => {
      const { item } = rows()
      expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, trackingStatus }]).success).toBe(true)
    },
  )

  it('알 수 없는 tracking 상태를 거부한다', () => {
    const { item } = rows()
    expect(backupRestoreSectionSchemas.importJobItems.safeParse([{ ...item, trackingStatus: 'unknown' }]).success).toBe(false)
  })

  it.each(['content', 'tracking'] as const)('attempt stage %s를 허용한다', (stage) => {
    const { attempt } = rows()
    expect(backupRestoreSectionSchemas.importJobItemAttempts.safeParse([{ ...attempt, stage }]).success).toBe(true)
  })

  it('알 수 없는 attempt stage를 거부한다', () => {
    const { attempt } = rows()
    expect(backupRestoreSectionSchemas.importJobItemAttempts.safeParse([{ ...attempt, stage: 'unknown' }]).success).toBe(false)
  })

  it.each(['running', 'imported', 'failed'] as const)('attempt 상태 %s를 허용한다', (status) => {
    const { attempt } = rows()
    expect(backupRestoreSectionSchemas.importJobItemAttempts.safeParse([{ ...attempt, status }]).success).toBe(true)
  })

  it('0 이하 attempt 번호를 거부한다', () => {
    const { attempt } = rows()
    expect(backupRestoreSectionSchemas.importJobItemAttempts.safeParse([{ ...attempt, attemptNo: 0 }]).success).toBe(false)
  })

  it('운영 이력 row의 추가 필드를 거부한다', () => {
    const { job } = rows()
    expect(backupRestoreSectionSchemas.importJobs.safeParse([{ ...job, ownerId: 'private' }]).success).toBe(false)
  })
})
