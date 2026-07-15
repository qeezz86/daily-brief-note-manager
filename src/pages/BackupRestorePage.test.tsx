import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { backupRestoreBundleFixture, currentCategoriesFromBundle } from '../features/backups/backupRestore.fixtures'
import type { ValidatedBackupBundle } from '../features/backups/backupRestore.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { BackupRestorePageContent } from './BackupRestorePage'

const mocks = vi.hoisted(() => ({ categories: vi.fn(), conflicts: vi.fn() }))
vi.mock('../features/backups/backupConflicts.repository', () => ({ getBackupRestoreCategories: mocks.categories, getBackupConflictReferenceData: mocks.conflicts }))

const client = {} as DatabaseClient
let bundle: ValidatedBackupBundle

function view(props: { client?: DatabaseClient | null; userId?: string } = {}) {
  return render(<MemoryRouter><BackupRestorePageContent client={props.client === undefined ? client : props.client} userId={props.userId ?? 'owner'} /></MemoryRouter>)
}

function paste(value = JSON.stringify(bundle)) {
  fireEvent.change(screen.getByLabelText('백업 JSON text'), { target: { value } })
}

describe('BackupRestorePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks(); bundle = await backupRestoreBundleFixture()
    mocks.categories.mockResolvedValue(currentCategoriesFromBundle(bundle))
    mocks.conflicts.mockResolvedValue({ databaseCheck: 'complete', records: [] })
  })
  it('페이지 설명과 read-only 범위를 렌더링한다', () => {
    view(); expect(screen.getByRole('heading', { name: '백업 복원 Dry Run' })).toBeInTheDocument(); expect(screen.getByText('Phase 4B-2')).toBeInTheDocument(); expect(screen.getByText(/DB 쓰기는 수행하지 않습니다/)).toBeInTheDocument()
  })
  it('JSON text를 붙여넣고 검사한다', async () => {
    view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); expect(await screen.findByRole('heading', { name: '복원 가능' })).toBeInTheDocument()
  })
  it('JSON parse 오류를 안전한 code로 표시한다', async () => {
    view(); paste('{'); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); expect(await screen.findByRole('alert')).toHaveTextContent('BACKUP_JSON_PARSE_FAILED')
  })
  it('파일을 선택하면 text 입력을 비운다', async () => {
    view(); paste(); const file = new File([JSON.stringify(bundle)], 'backup.json', { type: 'application/json' }); await userEvent.upload(screen.getByLabelText('JSON 파일'), file)
    expect(screen.getByLabelText('백업 JSON text')).toHaveValue(''); expect(screen.getByText(/backup.json/)).toBeInTheDocument()
  })
  it('text를 입력하면 선택 파일을 해제한다', async () => {
    view(); const file = new File([JSON.stringify(bundle)], 'backup.json', { type: 'application/json' }); await userEvent.upload(screen.getByLabelText('JSON 파일'), file); paste()
    expect(screen.queryByText(/backup.json/)).not.toBeInTheDocument()
  })
  it('검사 중 중복 실행을 차단한다', async () => {
    let resolve!: (value: ReturnType<typeof currentCategoriesFromBundle>) => void
    mocks.categories.mockReturnValue(new Promise((done) => { resolve = done })); view(); paste(); const button = screen.getByRole('button', { name: '복원 Dry Run 검사' }); await userEvent.click(button)
    expect(screen.getByRole('button', { name: '복원 Dry Run 검사 중' })).toBeDisabled(); expect(mocks.categories).toHaveBeenCalledOnce(); resolve(currentCategoriesFromBundle(bundle)); await screen.findByRole('heading', { name: '복원 가능' })
  })
  it('checksum과 profile·section count를 표시한다', async () => {
    view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' }));
    await screen.findByRole('heading', { name: '복원 가능' }); expect(screen.getByText('valid')).toBeInTheDocument(); expect(screen.getAllByText('core').length).toBeGreaterThan(0); expect(screen.getAllByText('posts').length).toBeGreaterThan(0)
  })
  it('DB ID conflict와 remap count를 표시한다', async () => {
    mocks.conflicts.mockResolvedValue({ databaseCheck: 'complete', records: [{ section: 'posts', id: bundle.data.posts[0].id, signature: '{}' }] }); view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' }))
    expect(await screen.findByRole('heading', { name: '경고 있음' })).toBeInTheDocument(); expect(screen.getByText('id_conflict', { selector: 'strong' })).toBeInTheDocument(); expect(screen.getByText('ID remap 후보').nextSibling).toHaveTextContent('1')
  })
  it('충돌 유형 filter와 검색을 적용한다', async () => {
    mocks.conflicts.mockResolvedValue({ databaseCheck: 'complete', records: [{ section: 'posts', id: bundle.data.posts[0].id, signature: '{}' }] }); view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); await screen.findByText('id_conflict', { selector: 'strong' })
    await userEvent.selectOptions(screen.getByLabelText('충돌 유형'), 'safe_new'); expect(screen.queryByText('id_conflict', { selector: 'strong' })).not.toBeInTheDocument(); fireEvent.change(screen.getByPlaceholderText(/title, slug/), { target: { value: 'no-match' } }); expect(screen.getByText(/조건에 맞는 충돌 후보가 없습니다/)).toBeInTheDocument()
  })
  it('restore analysis와 문제 목록을 복사한다', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } }); const writeText = vi.mocked(navigator.clipboard.writeText); view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); await screen.findByRole('heading', { name: '복원 가능' }); await userEvent.click(screen.getByRole('button', { name: 'restore analysis JSON 복사' })); expect(writeText).toHaveBeenCalledWith(expect.stringContaining('backupFingerprint')); await userEvent.click(screen.getByRole('button', { name: '문제 목록 복사' })); expect(writeText).toHaveBeenCalledTimes(2)
  })
  it('입력 변경 시 결과를 stale 처리하고 초기화한다', async () => {
    view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); await screen.findByRole('heading', { name: '복원 가능' }); paste(`${JSON.stringify(bundle)} `); expect(screen.queryByRole('heading', { name: '복원 가능' })).not.toBeInTheDocument(); expect(screen.getByText(/이전 검사 결과를 초기화/)).toBeInTheDocument()
  })
  it('입력 초기화가 file, text와 결과를 지운다', async () => {
    view(); paste(); await userEvent.click(screen.getByRole('button', { name: '입력 초기화' })); expect(screen.getByLabelText('백업 JSON text')).toHaveValue(''); expect(screen.getByRole('button', { name: '복원 Dry Run 검사' })).toBeDisabled()
  })
  it('Supabase 미설정 상태에서 검사를 차단한다', () => {
    view({ client: null }); expect(screen.getByText(/Supabase가 설정되지 않아/)).toBeInTheDocument(); paste(); expect(screen.getByRole('button', { name: '복원 Dry Run 검사' })).toBeDisabled()
  })
  it('raw DB 오류를 노출하지 않는다', async () => {
    mocks.categories.mockRejectedValue(new Error('raw owner_id secret')); view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); expect(await screen.findByRole('alert')).not.toHaveTextContent('owner_id'); expect(screen.getByRole('alert')).toHaveTextContent('데이터는 변경되지 않았습니다')
  })
  it('입력 파일이 바뀌면 기존 결과를 제거한다', async () => {
    view(); paste(); await userEvent.click(screen.getByRole('button', { name: '복원 Dry Run 검사' })); await screen.findByRole('heading', { name: '복원 가능' }); const file = new File([JSON.stringify(bundle)], 'other.json'); await userEvent.upload(screen.getByLabelText('JSON 파일'), file); await waitFor(() => expect(screen.queryByRole('heading', { name: '복원 가능' })).not.toBeInTheDocument())
  })
})
