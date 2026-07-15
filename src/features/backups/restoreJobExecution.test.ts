import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { executeRestoreRecords } from './executeRestoreJob'
import type { RestoreJobRecord } from './restoreExecution.types'

const runMock = vi.hoisted(() => vi.fn())
vi.mock('./restoreExecution.repository', () => ({ runRestoreJobRecord: runMock }))

const client = {} as DatabaseClient
function record(index: number, overrides: Partial<RestoreJobRecord> = {}): RestoreJobRecord {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  return { id, section: 'tags', sourceId: `tag-${index}`, targetId: id, action: 'preserve_id', stageKey: 'tags', stageOrder: 1, sequenceNo: index, safeDisplay: `Tag ${index}`, status: 'pending', attemptCount: 0, errorCode: null, errorMessage: null, retryable: null, startedAt: null, completedAt: null, attempts: [], ...overrides }
}

describe('restore job execution orchestration', () => {
  beforeEach(() => { runMock.mockReset().mockResolvedValue({ status: 'applied', success: true }) })

  it('가장 이른 pending stage만 실행한다', async () => {
    await executeRestoreRecords(client, [record(2, { stageOrder: 2 }), record(1)], 'pending')
    expect(runMock).toHaveBeenCalledOnce(); expect(runMock).toHaveBeenCalledWith(client, record(1).id)
  })
  it('stage와 sequence ASC로 정렬한다', async () => {
    await executeRestoreRecords(client, [record(3, { sequenceNo: 3 }), record(1), record(2, { sequenceNo: 2 })], 'pending')
    expect(runMock.mock.calls.map((call) => call[1])).toEqual([record(1).id, record(2).id, record(3).id])
  })
  it('RPC를 순차 호출한다', async () => {
    let active = 0; let maxActive = 0
    runMock.mockImplementation(async () => { active += 1; maxActive = Math.max(maxActive, active); await Promise.resolve(); active -= 1 })
    await executeRestoreRecords(client, [record(1), record(2)], 'pending')
    expect(maxActive).toBe(1)
  })
  it('실패 결과가 resolve되면 같은 stage의 다음 record를 계속한다', async () => {
    runMock.mockResolvedValueOnce({ status: 'failed', success: false }).mockResolvedValueOnce({ status: 'applied', success: true })
    expect((await executeRestoreRecords(client, [record(1), record(2)], 'pending')).processed).toBe(2)
  })
  it('이미 성공한 record는 pending 실행에서 제외한다', async () => {
    await executeRestoreRecords(client, [record(1, { status: 'applied' }), record(2, { status: 'reused' }), record(3, { status: 'skipped' }), record(4)], 'pending')
    expect(runMock).toHaveBeenCalledOnce(); expect(runMock).toHaveBeenCalledWith(client, record(4).id)
  })
  it('failed mode는 retryable 실패만 선택한다', async () => {
    await executeRestoreRecords(client, [record(1, { status: 'failed', retryable: true }), record(2, { status: 'failed', retryable: false })], 'failed')
    expect(runMock).toHaveBeenCalledOnce(); expect(runMock).toHaveBeenCalledWith(client, record(1).id)
  })
  it('failed mode도 가장 이른 실패 stage만 실행한다', async () => {
    await executeRestoreRecords(client, [record(2, { stageOrder: 2, status: 'failed', retryable: true }), record(1, { status: 'failed', retryable: true })], 'failed')
    expect(runMock).toHaveBeenCalledWith(client, record(1).id)
  })
  it('중단 요청 뒤 다음 record를 시작하지 않는다', async () => {
    let stop = false; runMock.mockImplementation(async () => { stop = true })
    const result = await executeRestoreRecords(client, [record(1), record(2)], 'pending', { shouldStop: () => stop })
    expect(runMock).toHaveBeenCalledOnce(); expect(result.processed).toBe(1)
  })
  it('시작 전 중단이면 처리 수가 0이다', async () => {
    const result = await executeRestoreRecords(client, [record(1)], 'pending', { shouldStop: () => true })
    expect(result.processed).toBe(0); expect(runMock).not.toHaveBeenCalled()
  })
  it('진행률에 현재 safe display를 전달한다', async () => {
    const progress = vi.fn(); await executeRestoreRecords(client, [record(1)], 'pending', { onProgress: progress })
    expect(progress).toHaveBeenNthCalledWith(1, { completed: 0, total: 1, current: 'Tag 1' })
  })
  it('완료 진행률은 실제 처리 수를 전달한다', async () => {
    const progress = vi.fn(); let stop = false; runMock.mockImplementation(async () => { stop = true })
    await executeRestoreRecords(client, [record(1), record(2)], 'pending', { shouldStop: () => stop, onProgress: progress })
    expect(progress).toHaveBeenLastCalledWith({ completed: 1, total: 2, current: null })
  })
  it('대상이 없으면 RPC 없이 0을 반환한다', async () => {
    expect((await executeRestoreRecords(client, [], 'pending')).processed).toBe(0); expect(runMock).not.toHaveBeenCalled()
  })
})
