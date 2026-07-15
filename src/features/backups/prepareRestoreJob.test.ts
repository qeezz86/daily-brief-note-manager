import { describe, expect, it, vi } from 'vitest'
import { backupRestoreBundleFixture, currentCategoriesFromBundle } from './backupRestore.fixtures'
import { buildRestorePlan } from './buildRestorePlan'
import { DEFAULT_RESTORE_POLICIES } from './restorePolicies'
import { buildPreparedRestoreRecords, chunkRestoreRecords, RESTORE_APPEND_MAX_BYTES } from './prepareRestoreJob'
import { executeRestoreRecords } from './executeRestoreJob'
import type { RestoreJobRecord } from './restoreExecution.types'

describe('restore execution preparation', () => {
  it('plan action을 결정적 stage snapshot으로 만들고 operational section은 제외한다', async () => {
    const bundle = await backupRestoreBundleFixture('full')
    const plan = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: { databaseCheck: 'complete', records: [] }, policies: structuredClone(DEFAULT_RESTORE_POLICIES) })
    const records = await buildPreparedRestoreRecords(bundle, plan)
    expect(records.some((record) => record.section === 'importJobs')).toBe(false)
    expect(records.every((record, index, all) => index === 0 || record.stageOrder >= all[index - 1].stageOrder)).toBe(true)
    expect(records.every((record) => /^[0-9a-f]{64}$/.test(record.payloadFingerprint))).toBe(true)
  })

  it('record 수와 UTF-8 byte를 함께 제한하고 순서를 보존한다', () => {
    const base = { section: 'tags', targetId: null, action: 'skip' as const, stageKey: 'tags', stageOrder: 1, payload: {}, payloadFingerprint: 'a'.repeat(64), dependencies: [], safeDisplay: '' }
    const records = Array.from({ length: 205 }, (_, index) => ({ ...base, sourceId: String(index), sequenceNo: index }))
    const chunks = chunkRestoreRecords(records)
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5])
    expect(chunks.flat().map((record) => record.sourceId)).toEqual(records.map((record) => record.sourceId))
    expect(() => chunkRestoreRecords([{ ...base, sourceId: 'large', sequenceNo: 0, safeDisplay: '가'.repeat(RESTORE_APPEND_MAX_BYTES) }])).toThrow('RESTORE_RECORD_TOO_LARGE')
  })

  it('현재 stage record만 sequence 순서로 한 번씩 실행한다', async () => {
    const rpc = vi.fn(async (...args: [string, Record<string, unknown>?]) => ({ data: { recordId: String(args[1]?.p_restore_job_record_id), status: 'applied', success: true, idempotent: false }, error: null }))
    const make = (id: string, stageOrder: number, sequenceNo: number): RestoreJobRecord => ({ id, section: 'tags', sourceId: id, targetId: id, action: 'preserve_id', stageKey: `s${stageOrder}`, stageOrder, sequenceNo, safeDisplay: id, status: 'pending', attemptCount: 0, errorCode: null, errorMessage: null, retryable: null, startedAt: null, completedAt: null, attempts: [] })
    const records = [make('00000000-0000-4000-8000-000000000003', 2, 0), make('00000000-0000-4000-8000-000000000002', 1, 1), make('00000000-0000-4000-8000-000000000001', 1, 0)]
    const result = await executeRestoreRecords({ rpc } as never, records, 'pending')
    expect(result.processed).toBe(2)
    expect(rpc.mock.calls.map((call) => call[1]?.p_restore_job_record_id)).toEqual([records[2].id, records[1].id])
  })
})
