import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { executeImportJob } from './executeImportJob'
import type { ImportJobItem, ImportJobStageResult } from './importJobs.types'

const contentMock = vi.hoisted(() => vi.fn())
const trackingMock = vi.hoisted(() => vi.fn())
vi.mock('./importJobs.repository', () => ({ runImportItemContent: contentMock, runImportItemTracking: trackingMock }))

const client = {} as DatabaseClient
const result = (overrides: Partial<ImportJobStageResult> = {}): ImportJobStageResult => ({ itemId: '00000000-0000-0000-0000-000000000001', success: true, idempotent: false, contentStatus: 'imported', trackingStatus: 'not_present', postId: '00000000-0000-0000-0000-000000000010', ...overrides })
function item(index: number, overrides: Partial<ImportJobItem> = {}): ImportJobItem {
  return { id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`, itemIndex: index, externalKey: `item-${index}`, payloadFingerprint: 'a'.repeat(64), title: `Item ${index}`, categoryId: 'economy', validationStatus: 'ready', warningAcknowledged: false, contentStatus: 'pending', trackingStatus: 'not_present', overallStatus: 'pending', postId: null, contentAttemptCount: 0, trackingAttemptCount: 0, contentErrorCode: null, contentErrorMessage: null, contentRetryable: false, trackingErrorCode: null, trackingErrorMessage: null, trackingRetryable: false, topicCount: null, reusedTopicCount: null, createdTopicCount: null, updateCount: null, followupCount: null, sourceLinkCount: null, contentStartedAt: null, contentCompletedAt: null, trackingStartedAt: null, trackingCompletedAt: null, attempts: [], ...overrides }
}

describe('executeImportJob', () => {
  beforeEach(() => { contentMock.mockReset().mockResolvedValue(result()); trackingMock.mockReset().mockResolvedValue(result({ trackingStatus: 'imported' })) })
  it('pending 콘텐츠 성공 뒤 tracking pending을 순서대로 실행한다', async () => { contentMock.mockResolvedValueOnce(result({ trackingStatus: 'pending' })); await executeImportJob(client, [item(0, { trackingStatus: 'pending' })], 'pending'); expect(contentMock).toHaveBeenCalledTimes(1); expect(trackingMock).toHaveBeenCalledTimes(1); expect(contentMock.mock.invocationCallOrder[0]).toBeLessThan(trackingMock.mock.invocationCallOrder[0]) })
  it('콘텐츠 실패면 tracking을 호출하지 않는다', async () => { contentMock.mockResolvedValueOnce(result({ success: false, contentStatus: 'failed', trackingStatus: 'pending', postId: null })); await executeImportJob(client, [item(0, { trackingStatus: 'pending' })], 'pending'); expect(trackingMock).not.toHaveBeenCalled() })
  it('tracking 실패 결과 뒤 다음 item을 계속한다', async () => { contentMock.mockResolvedValue(result({ trackingStatus: 'pending' })); trackingMock.mockResolvedValueOnce(result({ success: false, trackingStatus: 'failed' })).mockResolvedValueOnce(result({ trackingStatus: 'imported' })); await executeImportJob(client, [item(0, { trackingStatus: 'pending' }), item(1, { trackingStatus: 'pending' })], 'pending'); expect(contentMock).toHaveBeenCalledTimes(2); expect(trackingMock).toHaveBeenCalledTimes(2) })
  it('콘텐츠 성공+tracking pending은 콘텐츠를 재실행하지 않는다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'imported', trackingStatus: 'pending', postId: '00000000-0000-0000-0000-000000000010' })], 'pending'); expect(contentMock).not.toHaveBeenCalled(); expect(trackingMock).toHaveBeenCalledTimes(1) })
  it('완료된 item은 pending resume 대상에서 제외한다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'imported', trackingStatus: 'imported', overallStatus: 'completed' })], 'pending'); expect(contentMock).not.toHaveBeenCalled(); expect(trackingMock).not.toHaveBeenCalled() })
  it('content_failed는 retry 가능한 콘텐츠 실패만 실행한다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'failed', contentRetryable: true }), item(1, { contentStatus: 'failed', contentRetryable: false })], 'content_failed'); expect(contentMock).toHaveBeenCalledTimes(1); expect(contentMock).toHaveBeenCalledWith(client, item(0, { contentStatus: 'failed', contentRetryable: true }).id) })
  it('tracking_failed는 콘텐츠를 호출하지 않고 tracking만 실행한다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'imported', trackingStatus: 'failed', trackingRetryable: true })], 'tracking_failed'); expect(contentMock).not.toHaveBeenCalled(); expect(trackingMock).toHaveBeenCalledTimes(1) })
  it('all_failed는 각 실패 stage만 실행한다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'failed', contentRetryable: true }), item(1, { contentStatus: 'imported', trackingStatus: 'failed', trackingRetryable: true })], 'all_failed'); expect(contentMock).toHaveBeenCalledTimes(1); expect(trackingMock).toHaveBeenCalledTimes(1) })
  it('retry 불가 실패는 전체 retry에서도 제외한다', async () => { await executeImportJob(client, [item(0, { contentStatus: 'failed' }), item(1, { contentStatus: 'imported', trackingStatus: 'failed' })], 'all_failed'); expect(contentMock).not.toHaveBeenCalled(); expect(trackingMock).not.toHaveBeenCalled() })
  it('item_index 오름차순으로 실행한다', async () => { await executeImportJob(client, [item(2), item(0), item(1)], 'pending'); expect(contentMock.mock.calls.map((call) => call[1])).toEqual([item(0).id, item(1).id, item(2).id]) })
  it('중단 요청 이후 다음 item을 시작하지 않는다', async () => { let stop = false; contentMock.mockImplementation(async () => { stop = true; return result() }); await executeImportJob(client, [item(0), item(1)], 'pending', { shouldStop: () => stop }); expect(contentMock).toHaveBeenCalledTimes(1) })
  it('진행률과 완료 상태를 전달한다', async () => { const progress = vi.fn(); await executeImportJob(client, [item(0), item(1)], 'pending', { onProgress: progress }); expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, currentTitle: null }) })
})
