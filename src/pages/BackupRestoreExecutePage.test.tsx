import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ValidatedBackupBundle } from '../features/backups/backupRestore.types'
import type { RestorePlan } from '../features/backups/restorePlan.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { BackupRestoreExecutePageContent } from './BackupRestoreExecutePage'

const mocks = vi.hoisted(() => ({ parse: vi.fn(), validate: vi.fn(), build: vi.fn(), prepare: vi.fn() }))
vi.mock('../features/backups/parseBackupFile', () => ({ parseBackupFile: mocks.parse }))
vi.mock('../features/backups/validateRestoreExecution', () => ({ validateRestoreExecution: mocks.validate }))
vi.mock('../features/backups/prepareRestoreJob', () => ({ buildPreparedRestoreRecords: mocks.build }))
vi.mock('../features/backups/prepareRestoreExecution', () => ({ prepareRestoreExecution: mocks.prepare }))

const client = {} as DatabaseClient
const jobId = '00000000-0000-4000-8000-000000000001'
const bundle = { format: 'daily-brief-note-backup', schemaVersion: 1, profile: 'core', checksum: { algorithm: 'SHA-256', value: 'a'.repeat(64) } } as ValidatedBackupBundle
const plan = { backup: { checksum: 'a'.repeat(64) }, fingerprint: { value: 'b'.repeat(64) }, summary: { expectedCreateRows: 7, expectedReuseRows: 3, expectedSkippedRows: 2, actionCounts: { preserve_id: 4, remap_id: 2 }, sectionCounts: { seriesCounters: 1 } }, executionStages: [{ order: 1 }] } as unknown as RestorePlan

function view(props: { client?: DatabaseClient | null; userId?: string } = {}) {
  return render(<MemoryRouter initialEntries={['/backups/restore/execute']}><Routes><Route path="/backups/restore/execute" element={<BackupRestoreExecutePageContent client={props.client === undefined ? client : props.client} userId={props.userId ?? 'owner'} />} /><Route path="/backups/restore/jobs/:jobId" element={<p>job detail destination</p>} /></Routes></MemoryRouter>)
}
async function selectFiles() {
  await userEvent.upload(screen.getByLabelText('원본 backup JSON'), new File(['{}'], 'backup.json', { type: 'application/json' }))
  await userEvent.upload(screen.getByLabelText('restore plan JSON'), new File([JSON.stringify(plan)], 'plan.json', { type: 'application/json' }))
}
async function validateFiles() { await selectFiles(); await userEvent.click(screen.getByRole('button', { name: '실행 직전 재검증' })) }

describe('BackupRestoreExecutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.parse.mockResolvedValue({ value: {}, issues: [] }); mocks.validate.mockResolvedValue({ valid: true, issues: [], bundle, plan, categories: [] }); mocks.build.mockResolvedValue(Array.from({ length: 9 }, () => ({}))); mocks.prepare.mockResolvedValue({ jobId, status: 'ready' })
  })
  it('backup과 plan 두 입력을 요구한다', () => { view(); expect(screen.getByRole('button', { name: '실행 직전 재검증' })).toBeDisabled() })
  it('두 파일 선택 후 실행 전 검증을 허용한다', async () => { view(); await selectFiles(); expect(screen.getByRole('button', { name: '실행 직전 재검증' })).toBeEnabled() })
  it('검증 중 파일과 중복 클릭을 잠근다', async () => {
    let resolve!: (value: unknown) => void; mocks.validate.mockReturnValue(new Promise((done) => { resolve = done })); view(); await selectFiles(); await userEvent.click(screen.getByRole('button', { name: '실행 직전 재검증' }))
    expect(screen.getByRole('button', { name: '재검증 중' })).toBeDisabled(); expect(screen.getByLabelText('원본 backup JSON')).toBeDisabled(); resolve({ valid: false, issues: [], bundle: null, plan: null, categories: [] })
  })
  it('생성·preserve·remap·reuse·skip·counter 수를 표시한다', async () => {
    view(); await validateFiles(); await screen.findByText('실행 직전 재검증을 통과했습니다.')
    for (const label of ['생성 예정', 'preserve ID', 'remap ID', 'reuse', 'skip', 'counter']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('생성 예정').nextSibling).toHaveTextContent('7'); expect(screen.getByText('counter').nextSibling).toHaveTextContent('1')
  })
  it('실제 준비 record count를 표시한다', async () => { view(); await validateFiles(); expect(await screen.findByText('전체 실행 record')).toHaveProperty('nextSibling.textContent', '9') })
  it('full include 계획은 운영 이력 수와 실행 잠금·core 유지 정책을 표시한다', async () => {
    const fullBundle = { ...bundle, profile: 'full' } as ValidatedBackupBundle
    const fullPlan = { ...plan, backup: { ...plan.backup, profile: 'full' }, policies: { operationalHistory: 'include' }, summary: { ...plan.summary, sectionCounts: { ...plan.summary.sectionCounts, importJobs: 2, importJobItems: 3, importJobItemAttempts: 4 } } } as unknown as RestorePlan
    mocks.validate.mockResolvedValue({ valid: true, issues: [], bundle: fullBundle, plan: fullPlan, categories: [] })
    view(); await validateFiles()
    expect(await screen.findByRole('heading', { name: 'Import 운영 이력' })).toBeInTheDocument()
    expect(screen.getByText('Import job').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('Import item').nextSibling).toHaveTextContent('3')
    expect(screen.getByText('Import attempt').nextSibling).toHaveTextContent('4')
    expect(screen.getByText(/신규 운영 이력은 실행 잠금 상태로 복원/)).toBeInTheDocument()
    expect(screen.getByText(/운영 stage가 실패해도 완료된 core 데이터는 유지/)).toBeInTheDocument()
  })
  it.each(['기존 row를 overwrite하지 않습니다.', '완료 stage는 자동 rollback되지 않습니다.', '수동 retry합니다.', '브라우저가 닫혀 있으면 실행되지 않습니다.', '운영 Import 이력과 restore undo는 지원하지 않습니다.', '이미 생성된 row는 유지합니다.'])('%s 안내를 표시한다', async (message) => { view(); await validateFiles(); expect(await screen.findByText(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument() })
  it('RESTORE 문자열 불일치 시 job 생성을 차단한다', async () => {
    view(); await validateFiles(); const button = await screen.findByRole('button', { name: '영구 restore job 생성' }); await userEvent.type(screen.getByLabelText('계속하려면 RESTORE 입력'), 'restore'); expect(button).toBeDisabled(); expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('RESTORE 문자열 일치 시 job을 준비하고 상세로 이동한다', async () => {
    view(); await validateFiles(); await userEvent.type(screen.getByLabelText('계속하려면 RESTORE 입력'), 'RESTORE'); await userEvent.click(screen.getByRole('button', { name: '영구 restore job 생성' }))
    expect(await screen.findByText('job detail destination')).toBeInTheDocument(); expect(mocks.prepare).toHaveBeenCalledWith(client, expect.objectContaining({ sourceName: 'backup.json' }))
  })
  it('기존 job 반환도 같은 상세 경로로 이동한다', async () => {
    mocks.prepare.mockResolvedValue({ jobId, status: 'completed', isExisting: true }); view(); await validateFiles(); await userEvent.type(screen.getByLabelText('계속하려면 RESTORE 입력'), 'RESTORE'); await userEvent.click(screen.getByRole('button', { name: '영구 restore job 생성' })); expect(await screen.findByText('job detail destination')).toBeInTheDocument()
  })
  it('준비 실패는 raw 오류 없이 재개 안내를 표시한다', async () => {
    mocks.prepare.mockRejectedValue(new Error('owner_id raw secret')); view(); await validateFiles(); await userEvent.type(screen.getByLabelText('계속하려면 RESTORE 입력'), 'RESTORE'); await userEvent.click(screen.getByRole('button', { name: '영구 restore job 생성' })); const status = await screen.findByRole('status'); expect(status).toHaveTextContent('동일 파일로 다시 실행'); expect(status).not.toHaveTextContent('owner_id')
  })
  it('검증 issue를 안전한 code와 함께 표시한다', async () => {
    mocks.validate.mockResolvedValue({ valid: false, issues: [{ code: 'RESTORE_PLAN_STALE', message: '계획이 오래되었습니다.' }], bundle: null, plan, categories: [] }); view(); await validateFiles(); expect(await screen.findByRole('alert')).toHaveTextContent('RESTORE_PLAN_STALE')
  })
  it('입력 파일 변경 시 이전 검증과 confirmation을 초기화한다', async () => {
    view(); await validateFiles(); await userEvent.type(screen.getByLabelText('계속하려면 RESTORE 입력'), 'RESTORE'); await userEvent.upload(screen.getByLabelText('restore plan JSON'), new File(['{}'], 'other.json')); await waitFor(() => expect(screen.queryByText('최종 실행 요약')).not.toBeInTheDocument())
  })
  it('Supabase 미설정 상태를 알리고 검증을 차단한다', async () => { view({ client: null }); expect(screen.getByRole('alert')).toHaveTextContent('Supabase가 설정되지 않아'); await selectFiles(); expect(screen.getByRole('button', { name: '실행 직전 재검증' })).toBeDisabled() })
  it('미인증 userId에서는 검증을 차단한다', async () => { view({ userId: '' }); await selectFiles(); expect(screen.getByRole('button', { name: '실행 직전 재검증' })).toBeDisabled() })
})
