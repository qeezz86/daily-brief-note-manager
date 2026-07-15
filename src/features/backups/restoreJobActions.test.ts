import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { appendRestoreJobRecords, cancelRestoreJob, finalizeRestoreJob, getRestoreJob, getRestoreJobRecords, getRestoreJobs, resumeRestoreJob, runRestoreJobRecord, SafeRestoreError } from './restoreExecution.repository'
import type { PreparedRestoreRecord } from './restoreExecution.types'

const rpc = vi.fn()
const client = { rpc } as unknown as DatabaseClient
const id = '00000000-0000-4000-8000-000000000001'
const timestamp = '2026-07-15T00:00:00.000Z'
const aggregate = { id, sourceName: 'backup.json', backupProfile: 'core', backupChecksum: 'a'.repeat(64), planFingerprint: 'b'.repeat(64), status: 'ready', currentStageKey: 'tags', totalCount: 1, pendingCount: 1, runningCount: 0, appliedCount: 0, reusedCount: 0, skippedCount: 0, failedCount: 0, cancelledCount: 0, retryableFailureCount: 0, completedStageCount: 0, stageCount: 1, progressPercent: 0, stageProgressPercent: 0, createdAt: timestamp, startedAt: null, completedAt: null, cancelledAt: null }
const prepared: PreparedRestoreRecord = { section: 'tags', sourceId: 'tag', targetId: id, action: 'preserve_id', stageKey: 'tags', stageOrder: 1, sequenceNo: 0, payload: { name: 'Tag' }, payloadFingerprint: 'c'.repeat(64), dependencies: [], safeDisplay: 'Tag' }

describe('restore job repository actions', () => {
  beforeEach(() => rpc.mockReset())
  it('append는 owner ID 없이 job과 snapshot만 전달한다', async () => {
    rpc.mockResolvedValue({ data: { appendedCount: 1, existingCount: 0, storedCount: 1 }, error: null })
    await appendRestoreJobRecords(client, id, [prepared]); const args = rpc.mock.calls[0][1]
    expect(args).toEqual({ p_job_id: id, p_records: [prepared] }); expect(JSON.stringify(args)).not.toContain('ownerId')
  })
  it('finalize RPC와 인수를 고정한다', async () => {
    rpc.mockResolvedValue({ data: { jobId: id, status: 'ready', recordCount: 1, idempotent: false }, error: null })
    await finalizeRestoreJob(client, id); expect(rpc).toHaveBeenCalledWith('finalize_restore_job', { p_job_id: id })
  })
  it('record 실행은 record ID만 전송한다', async () => {
    rpc.mockResolvedValue({ data: { recordId: id, status: 'applied', success: true, idempotent: false }, error: null })
    await runRestoreJobRecord(client, id); expect(rpc).toHaveBeenCalledWith('run_restore_job_record', { p_restore_job_record_id: id })
  })
  it('취소 RPC를 호출한다', async () => {
    rpc.mockResolvedValue({ data: { jobId: id, status: 'cancelled', idempotent: false }, error: null })
    await cancelRestoreJob(client, id); expect(rpc).toHaveBeenCalledWith('cancel_restore_job', { p_job_id: id })
  })
  it('재개 RPC를 호출한다', async () => {
    rpc.mockResolvedValue({ data: { jobId: id, status: 'ready', idempotent: false }, error: null })
    await resumeRestoreJob(client, id); expect(rpc).toHaveBeenCalledWith('resume_cancelled_restore_job', { p_job_id: id })
  })
  it('목록은 최근 100개 제한 인수를 보낸다', async () => {
    rpc.mockResolvedValue({ data: [aggregate], error: null }); await getRestoreJobs(client)
    expect(rpc).toHaveBeenCalledWith('get_restore_jobs', { p_limit: 100 })
  })
  it('상세 null을 그대로 반환한다', async () => {
    rpc.mockResolvedValue({ data: null, error: null }); await expect(getRestoreJob(client, id)).resolves.toBeNull()
  })
  it('record filter 전부를 RPC 인수로 변환한다', async () => {
    rpc.mockResolvedValue({ data: [], error: null }); await getRestoreJobRecords(client, id, { stage: 'posts', section: 'posts', action: 'create', status: 'failed', retryable: true, search: '뉴스' })
    expect(rpc).toHaveBeenCalledWith('get_restore_job_records', { p_job_id: id, p_stage: 'posts', p_section: 'posts', p_action: 'create', p_status: 'failed', p_retryable: true, p_search: '뉴스' })
  })
  it('빈 filter는 undefined로 전달한다', async () => {
    rpc.mockResolvedValue({ data: [], error: null }); await getRestoreJobRecords(client, id)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_stage: undefined, p_section: undefined, p_action: undefined, p_status: undefined, p_search: undefined })
  })
  it('알려진 DB 오류는 안전한 code만 보존한다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'duplicate constraint owner_id RESTORE_UNIQUE_KEY_CONFLICT raw' } })
    await expect(runRestoreJobRecord(client, id)).rejects.toMatchObject({ code: 'RESTORE_UNIQUE_KEY_CONFLICT', message: '복원 작업의 최신 상태와 입력을 다시 확인해 주세요.' })
  })
  it('raw Supabase 오류는 연결 실패로 매핑한다', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation owner_id secret does not exist' } })
    await expect(getRestoreJobs(client)).rejects.toEqual(new SafeRestoreError('RESTORE_CONNECTION_FAILED', '복원 DB 요청을 완료하지 못했습니다.'))
  })
  it('잘못된 run 응답을 차단한다', async () => {
    rpc.mockResolvedValue({ data: { raw: 'unexpected' }, error: null })
    await expect(runRestoreJobRecord(client, id)).rejects.toMatchObject({ code: 'RESTORE_RESPONSE_INVALID' })
  })
  it('잘못된 목록 응답을 차단한다', async () => {
    rpc.mockResolvedValue({ data: [{ ...aggregate, ownerId: id }], error: null })
    await expect(getRestoreJobs(client)).rejects.toMatchObject({ code: 'RESTORE_RESPONSE_INVALID' })
  })
  it('record 응답 schema는 payload와 HTML 원문을 거부한다', async () => {
    rpc.mockResolvedValue({ data: [{ id, section: 'posts', sourceId: 'post', targetId: id, action: 'create', stageKey: 'posts', stageOrder: 1, sequenceNo: 0, safeDisplay: 'Post', status: 'pending', attemptCount: 0, errorCode: null, errorMessage: null, retryable: null, startedAt: null, completedAt: null, attempts: [], payload: { htmlBody: '<p>secret</p>' } }], error: null })
    await expect(getRestoreJobRecords(client, id)).rejects.toMatchObject({ code: 'RESTORE_RESPONSE_INVALID' })
  })
  it.each(['applied', 'reused', 'skipped'] as const)('%s 실행 결과를 보존한다', async (status) => {
    rpc.mockResolvedValue({ data: { recordId: id, status, success: true, idempotent: status !== 'applied' }, error: null })
    await expect(runRestoreJobRecord(client, id)).resolves.toMatchObject({ status })
  })
})
