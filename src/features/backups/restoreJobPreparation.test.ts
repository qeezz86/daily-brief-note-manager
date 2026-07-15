import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { backupRestoreBundleFixture, currentCategoriesFromBundle } from './backupRestore.fixtures'
import type { ValidatedBackupBundle } from './backupRestore.types'
import { buildRestorePlan } from './buildRestorePlan'
import { prepareRestoreExecution } from './prepareRestoreExecution'
import { buildPreparedRestoreRecords, chunkRestoreRecords } from './prepareRestoreJob'
import type { PreparedRestoreRecord } from './restoreExecution.types'
import type { RestorePlan } from './restorePlan.types'
import { DEFAULT_RESTORE_POLICIES } from './restorePolicies'

const repository = vi.hoisted(() => ({ create: vi.fn(), append: vi.fn(), finalize: vi.fn() }))
vi.mock('./restoreExecution.repository', () => ({ createOrGetRestoreJob: repository.create, appendRestoreJobRecords: repository.append, finalizeRestoreJob: repository.finalize }))

const client = {} as DatabaseClient
let bundle: ValidatedBackupBundle
let plan: RestorePlan
const base: PreparedRestoreRecord = { section: 'tags', sourceId: 'tag', targetId: null, action: 'skip', stageKey: 'tags', stageOrder: 1, sequenceNo: 0, payload: {}, payloadFingerprint: 'a'.repeat(64), dependencies: [], safeDisplay: '' }

describe('restore job preparation matrix', () => {
  beforeAll(async () => {
    bundle = await backupRestoreBundleFixture('full')
    plan = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: { databaseCheck: 'complete', records: [] }, policies: structuredClone(DEFAULT_RESTORE_POLICIES) })
  })
  beforeEach(() => {
    repository.create.mockReset().mockResolvedValue({ jobId: '00000000-0000-4000-8000-000000000001', status: 'preparing', isExisting: false })
    repository.append.mockReset().mockResolvedValue({ appendedCount: 1, existingCount: 0, storedCount: 1 })
    repository.finalize.mockReset().mockResolvedValue({ status: 'ready' })
  })

  it('full backup에서도 operational history record를 만들지 않는다', async () => {
    const records = await buildPreparedRestoreRecords(bundle, plan)
    expect(records.map((record) => record.section)).not.toEqual(expect.arrayContaining(['importJobs', 'importJobItems', 'importJobItemAttempts']))
  })
  it('모든 source action을 불변 payload snapshot과 연결한다', async () => {
    const records = await buildPreparedRestoreRecords(bundle, plan)
    expect(records.every((record) => record.payload && typeof record.payload === 'object')).toBe(true)
  })
  it('owner ID를 실행 payload에 주입하지 않는다', async () => {
    expect(JSON.stringify(await buildPreparedRestoreRecords(bundle, plan))).not.toMatch(/owner_?id/i)
  })
  it('각 stage 안에서 sequence를 0부터 연속 부여한다', async () => {
    const records = await buildPreparedRestoreRecords(bundle, plan)
    for (const stage of new Set(records.map((record) => record.stageOrder))) expect(records.filter((record) => record.stageOrder === stage).map((record) => record.sequenceNo)).toEqual(records.filter((record) => record.stageOrder === stage).map((_, index) => index))
  })
  it('block action 계획은 준비를 차단한다', async () => {
    const blocked = structuredClone(plan); blocked.recordActions[0].action = 'block'
    await expect(buildPreparedRestoreRecords(bundle, blocked)).rejects.toThrow('RESTORE_PLAN_BLOCK_ACTION')
  })
  it('source payload가 누락되면 준비를 차단한다', async () => {
    const missing = structuredClone(plan); missing.recordActions[0].sourceId = 'missing-source'
    await expect(buildPreparedRestoreRecords(bundle, missing)).rejects.toThrow('RESTORE_PLAN_STAGE_RECORD_MISSING')
  })
  it('100개 record 제한으로 chunk를 나눈다', () => {
    const records = Array.from({ length: 201 }, (_, index) => ({ ...base, sourceId: String(index), sequenceNo: index }))
    expect(chunkRestoreRecords(records).map((chunk) => chunk.length)).toEqual([100, 100, 1])
  })
  it('UTF-8 byte 크기로 ASCII와 한글을 다르게 계산한다', () => {
    const ascii = { ...base, safeDisplay: 'a'.repeat(20) }; const korean = { ...base, safeDisplay: '가'.repeat(20) }
    const limit = new TextEncoder().encode(JSON.stringify(ascii)).byteLength + 2
    expect(chunkRestoreRecords([ascii], 100, limit)).toHaveLength(1)
    expect(() => chunkRestoreRecords([korean], 100, limit)).toThrow('RESTORE_RECORD_TOO_LARGE')
  })
  it('정확한 byte 경계의 단일 record를 허용한다', () => {
    const limit = new TextEncoder().encode(JSON.stringify(base)).byteLength + 2
    expect(chunkRestoreRecords([base], 100, limit)).toEqual([[base]])
  })
  it('byte 경계를 1 넘는 단일 record를 명시적으로 거부한다', () => {
    const limit = new TextEncoder().encode(JSON.stringify(base)).byteLength + 1
    expect(() => chunkRestoreRecords([base], 100, limit)).toThrow('RESTORE_RECORD_TOO_LARGE')
  })
  it('빈 snapshot은 append chunk를 만들지 않는다', () => { expect(chunkRestoreRecords([])).toEqual([]) })
  it('create 후 append와 finalize 순서로 준비한다', async () => {
    await prepareRestoreExecution(client, { bundle, plan, categories: currentCategoriesFromBundle(bundle), sourceName: 'backup.json' })
    expect(repository.create.mock.invocationCallOrder[0]).toBeLessThan(repository.append.mock.invocationCallOrder[0]); expect(repository.append.mock.invocationCallOrder[0]).toBeLessThan(repository.finalize.mock.invocationCallOrder[0])
  })
  it('기존 non-preparing job이면 상세 이동용 결과를 즉시 반환한다', async () => {
    repository.create.mockResolvedValue({ jobId: '00000000-0000-4000-8000-000000000001', status: 'ready', isExisting: true })
    const result = await prepareRestoreExecution(client, { bundle, plan, categories: currentCategoriesFromBundle(bundle), sourceName: null })
    expect(result.status).toBe('ready'); expect(repository.append).not.toHaveBeenCalled(); expect(repository.finalize).not.toHaveBeenCalled()
  })
  it('append 실패 시 finalize를 실행하지 않는다', async () => {
    repository.append.mockRejectedValue(new Error('append failed'))
    await expect(prepareRestoreExecution(client, { bundle, plan, categories: currentCategoriesFromBundle(bundle), sourceName: null })).rejects.toThrow('append failed')
    expect(repository.finalize).not.toHaveBeenCalled()
  })
  it('finalize 실패를 호출자에게 전달한다', async () => {
    repository.finalize.mockRejectedValue(new Error('finalize failed'))
    await expect(prepareRestoreExecution(client, { bundle, plan, categories: currentCategoriesFromBundle(bundle), sourceName: null })).rejects.toThrow('finalize failed')
  })
  it('준비 progress에 snapshot, append, finalize 단계를 순서대로 알린다', async () => {
    const progress = vi.fn(); await prepareRestoreExecution(client, { bundle, plan, categories: currentCategoriesFromBundle(bundle), sourceName: null, onProgress: progress })
    expect(progress.mock.calls.map((call) => call[0])).toEqual([expect.stringContaining('불변 record snapshot'), expect.stringContaining('snapshot chunk'), expect.stringContaining('DB preflight')])
  })
})
