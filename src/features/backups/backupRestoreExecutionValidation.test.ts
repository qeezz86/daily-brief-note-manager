import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { ValidatedBackupBundle } from './backupRestore.types'
import type { RestorePlan } from './restorePlan.types'

const mocks = vi.hoisted(() => ({ categories: vi.fn(), lookup: vi.fn(), collisions: vi.fn(), local: vi.fn(), planValidation: vi.fn(), buildPlan: vi.fn() }))
vi.mock('./backupConflicts.repository', () => ({ getBackupRestoreCategories: mocks.categories, getBackupConflictReferenceData: mocks.lookup, getBackupRestoreTargetCollisions: mocks.collisions }))
vi.mock('./validateBackupForRestore', () => ({ validateBackupForRestore: mocks.local }))
vi.mock('./validateRestorePlan', () => ({ validateRestorePlan: mocks.planValidation }))
vi.mock('./buildRestorePlan', () => ({ buildRestorePlan: mocks.buildPlan }))

import { validateRestoreExecution } from './validateRestoreExecution'

const client = {} as DatabaseClient
const checksum = 'a'.repeat(64); const fingerprint = 'b'.repeat(64)
const bundle = { format: 'daily-brief-note-backup', schemaVersion: 1, profile: 'core', checksum: { algorithm: 'SHA-256', value: checksum } } as ValidatedBackupBundle
const plan = { format: 'daily-brief-note-restore-plan', schemaVersion: 1, planVersion: 1, status: 'ready', createdAt: '2026-07-15T00:00:00.000Z', backup: { format: bundle.format, schemaVersion: 1, profile: 'core', checksum, exportedAt: '2026-07-15T00:00:00.000Z' }, analysis: { fingerprint: 'c'.repeat(64), createdAt: '2026-07-15T00:00:00.000Z', databaseLookupStatus: 'complete', recheckRequiredBeforeExecution: true }, policies: { idConflict: 'remap', identicalData: 'reuse', operationalHistory: 'exclude', inactiveCategory: 'block', patternDifference: 'use_current', timestamps: 'preserve', recordOverrides: {} }, categoryMappings: [], recordActions: [], idMap: {}, executionStages: [], summary: { totalRecords: 0, actionCounts: { create: 0, preserve_id: 0, remap_id: 0, reuse_existing: 0, skip: 0, block: 0 }, sectionCounts: {}, expectedCreateRows: 0, expectedReuseRows: 0, expectedSkippedRows: 0, blockedRows: 0, categoryWarningCount: 0, operationalHistory: 'excluded' }, issues: [], fingerprint: { algorithm: 'SHA-256', value: fingerprint } } as RestorePlan
const localResult = { bundle, canQueryDatabase: true, result: { issues: [], databaseCheck: 'complete' } }

describe('restore execution validation matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.categories.mockResolvedValue([]); mocks.lookup.mockResolvedValue({ databaseCheck: 'complete', records: [] }); mocks.collisions.mockResolvedValue({ databaseCheck: 'complete', collisions: [] }); mocks.local.mockResolvedValue(localResult); mocks.planValidation.mockResolvedValue({ issues: [] }); mocks.buildPlan.mockResolvedValue(plan)
  })
  it('정상 연결된 backup과 plan을 실행 가능으로 판정한다', async () => { await expect(validateRestoreExecution(client, {}, plan)).resolves.toMatchObject({ valid: true }) })
  it('plan schema mismatch를 DB 조회 전에 차단한다', async () => {
    const result = await validateRestoreExecution(client, {}, { ...plan, schemaVersion: 2 }); expect(result.issues[0].code).toBe('RESTORE_PLAN_SCHEMA_INVALID'); expect(mocks.categories).not.toHaveBeenCalled()
  })
  it('checksum이 유효하지 않은 backup을 차단한다', async () => {
    mocks.local.mockResolvedValue({ bundle: null, canQueryDatabase: false, result: { issues: [{ severity: 'error', code: 'BACKUP_CHECKSUM_MISMATCH', message: 'checksum mismatch' }], databaseCheck: 'not_run' } })
    expect((await validateRestoreExecution(client, {}, plan)).issues.map((issue) => issue.code)).toContain('BACKUP_CHECKSUM_MISMATCH')
  })
  it('plan fingerprint 검증 오류를 보존한다', async () => {
    mocks.planValidation.mockResolvedValue({ issues: [{ code: 'RESTORE_PLAN_FINGERPRINT_MISMATCH', message: 'fingerprint mismatch' }] })
    expect((await validateRestoreExecution(client, {}, plan)).issues.map((issue) => issue.code)).toContain('RESTORE_PLAN_FINGERPRINT_MISMATCH')
  })
  it('backup checksum 연결 불일치를 차단한다', async () => {
    const result = await validateRestoreExecution(client, {}, { ...plan, backup: { ...plan.backup, checksum: 'd'.repeat(64) } })
    expect(result.issues.map((issue) => issue.code)).toContain('RESTORE_BACKUP_PLAN_CHECKSUM_MISMATCH')
  })
  it('profile mismatch를 차단한다', async () => {
    const result = await validateRestoreExecution(client, {}, { ...plan, backup: { ...plan.backup, profile: 'full' } })
    expect(result.issues.map((issue) => issue.code)).toContain('RESTORE_BACKUP_PLAN_PROFILE_MISMATCH')
  })
  it('backup schema reference mismatch를 차단한다', async () => {
    const other = { ...bundle, schemaVersion: 2 } as unknown as ValidatedBackupBundle; mocks.local.mockResolvedValue({ ...localResult, bundle: other })
    const result = await validateRestoreExecution(client, {}, plan); expect(result.issues.map((issue) => issue.code)).toContain('RESTORE_BACKUP_PLAN_PROFILE_MISMATCH')
  })
  it('warning plan status를 차단한다', async () => {
    const result = await validateRestoreExecution(client, {}, { ...plan, status: 'warning' }); expect(result.issues.map((issue) => issue.code)).toContain('RESTORE_PLAN_NOT_READY')
  })
  it('ready plan의 warning issue도 차단한다', async () => {
    const issuePlan = { ...plan, issues: [{ severity: 'warning', code: 'WARNING', message: 'warning', section: 'posts' }] }
    expect((await validateRestoreExecution(client, {}, issuePlan)).issues.map((issue) => issue.code)).toContain('RESTORE_PLAN_NOT_READY')
  })
  it('operational history include 정책을 차단한다', async () => {
    const input = structuredClone(plan); input.policies.operationalHistory = 'include'
    expect((await validateRestoreExecution(client, {}, input)).issues.map((issue) => issue.code)).toContain('RESTORE_OPERATIONAL_HISTORY_BLOCKED')
  })
  it('summary의 operational history 포함도 차단한다', async () => {
    const input = structuredClone(plan); input.summary.operationalHistory = 'included'
    expect((await validateRestoreExecution(client, {}, input)).issues.map((issue) => issue.code)).toContain('RESTORE_OPERATIONAL_HISTORY_BLOCKED')
  })
  it.each(['partial', 'unavailable'] as const)('%s DB lookup을 실행 불가로 판정한다', async (databaseCheck) => {
    mocks.lookup.mockResolvedValue({ databaseCheck, records: [] }); mocks.local.mockResolvedValueOnce(localResult).mockResolvedValueOnce({ ...localResult, result: { issues: [], databaseCheck } }); mocks.buildPlan.mockResolvedValue({ ...plan, fingerprint: { ...plan.fingerprint, value: 'e'.repeat(64) } })
    expect((await validateRestoreExecution(client, {}, plan)).issues.map((issue) => issue.code)).toContain('RESTORE_DATABASE_LOOKUP_INCOMPLETE')
  })
  it('최신 DB 분석 fingerprint가 달라진 stale plan을 차단한다', async () => {
    mocks.buildPlan.mockResolvedValue({ ...plan, fingerprint: { ...plan.fingerprint, value: 'e'.repeat(64) } })
    expect((await validateRestoreExecution(client, {}, plan)).issues.map((issue) => issue.code)).toContain('RESTORE_PLAN_STALE')
  })
  it('remap target 신규 충돌로 재작성된 plan을 stale 처리한다', async () => {
    const remap = { ...plan, recordActions: [{ section: 'posts', sourceId: 'source', targetId: '00000000-0000-4000-8000-000000000002', action: 'remap_id', conflictType: 'id_conflict', reasonCode: 'RESTORE_ID_REMAP', dependencies: [], warnings: [], safeDisplay: 'Post' }] } as RestorePlan
    mocks.buildPlan.mockResolvedValueOnce(remap).mockResolvedValueOnce({ ...remap, fingerprint: { ...plan.fingerprint, value: 'f'.repeat(64) } }); mocks.collisions.mockResolvedValue({ databaseCheck: 'complete', collisions: [{ section: 'posts', id: '00000000-0000-4000-8000-000000000002' }] })
    expect((await validateRestoreExecution(client, {}, plan)).issues.map((issue) => issue.code)).toContain('RESTORE_PLAN_STALE')
  })
  it('중복 issue code는 한 번만 반환한다', async () => {
    mocks.planValidation.mockResolvedValue({ issues: [{ code: 'RESTORE_PLAN_STALE', message: 'old' }] }); mocks.buildPlan.mockResolvedValue({ ...plan, fingerprint: { ...plan.fingerprint, value: 'e'.repeat(64) } })
    expect((await validateRestoreExecution(client, {}, plan)).issues.filter((issue) => issue.code === 'RESTORE_PLAN_STALE')).toHaveLength(1)
  })
})
