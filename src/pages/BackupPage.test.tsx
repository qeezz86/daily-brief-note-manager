import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../shared/supabase/client'
import { backupSnapshotFixture } from '../features/backups/backups.fixtures'
import { BackupPageContent } from './BackupPage'

const getSnapshotMock = vi.hoisted(() => vi.fn())
const estimateMock = vi.hoisted(() => ({
  data: { profile: 'core', sectionCounts: { posts: 1, generatedPrompts: 1 }, totalRecords: 2, categoryManifestCount: 1, includesOperationalHistory: false, includesNormalizedPayload: false },
  isPending: false,
  isError: false,
}))

vi.mock('../features/backups/backup.repository', () => ({ getBackupSnapshot: getSnapshotMock }))
vi.mock('../features/backups/backup.queries', () => ({ useBackupEstimateQuery: () => estimateMock }))

const client = {} as DatabaseClient

describe('BackupPageContent', () => {
  beforeEach(() => {
    getSnapshotMock.mockReset().mockResolvedValue(backupSnapshotFixture())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  it('백업 페이지 설명을 렌더링한다', () => {
    render(<BackupPageContent client={client} userId="owner" />)
    expect(screen.getByRole('heading', { name: '백업' })).toBeInTheDocument()
    expect(screen.getByText('Phase 4B-1')).toBeInTheDocument()
  })
  it('core를 기본 선택한다', () => {
    render(<BackupPageContent client={client} userId="owner" />)
    expect(screen.getByRole('radio', { name: /^핵심 데이터/ })).toBeChecked()
  })
  it('full 프로필을 선택하고 용량 안내를 표시한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('radio', { name: /^전체 데이터/ }))
    expect(screen.getByText(/Import job snapshot과 실행 이력/)).toBeInTheDocument()
  })
  it('예상 count를 표시한다', () => {
    render(<BackupPageContent client={client} userId="owner" />)
    expect(screen.getByText('예상 전체:')).toBeInTheDocument()
    expect(screen.getByText('2 records')).toBeInTheDocument()
  })
  it('생성 진행 단계와 완료 manifest를 표시한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('heading', { name: '백업 manifest' })).toBeInTheDocument()
    expect(screen.getByText('파일 준비 완료')).toHaveAttribute('aria-current', 'step')
  })
  it('section count와 byte size를 표시한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByText(/bytes|KB/)).toBeInTheDocument()
    expect(screen.getAllByText('posts').length).toBeGreaterThan(0)
  })
  it('관계와 checksum 검증 성공을 표시한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByText('검증 완료')).toBeInTheDocument()
    expect(screen.getByText('통과')).toBeInTheDocument()
  })
  it('checksum을 표시하고 복사한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'checksum 복사' }))
    expect(await screen.findByText('checksum을 복사했습니다.')).toBeInTheDocument()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/))
  })
  it('manifest JSON을 복사한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'manifest JSON 복사' }))
    expect(await screen.findByText('manifest JSON을 복사했습니다.')).toBeInTheDocument()
  })
  it('JSON 다운로드 버튼으로 최종 내용을 다운로드한다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'JSON 다운로드' }))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
  it('생성 중 중복 실행을 차단한다', async () => {
    let resolve!: (value: ReturnType<typeof backupSnapshotFixture>) => void
    getSnapshotMock.mockReturnValue(new Promise((done) => { resolve = done }))
    render(<BackupPageContent client={client} userId="owner" />)
    const button = screen.getByRole('button', { name: '백업 생성' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: '백업 생성 중' })).toBeDisabled()
    expect(getSnapshotMock).toHaveBeenCalledOnce()
    resolve(backupSnapshotFixture())
    await screen.findByRole('heading', { name: '백업 manifest' })
  })
  it('생성 오류를 안전한 문구로 표시한다', async () => {
    getSnapshotMock.mockRejectedValue(new Error('raw database secret'))
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('무결성 검증에 실패')
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw database')
  })
  it('Supabase 미설정 상태를 표시하고 생성을 차단한다', () => {
    render(<BackupPageContent client={null} userId="owner" />)
    expect(screen.getByText(/Supabase가 설정되지 않아/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '백업 생성' })).toBeDisabled()
  })
  it('프로필 변경 시 이전 생성 결과를 지운다', async () => {
    render(<BackupPageContent client={client} userId="owner" />)
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await screen.findByRole('heading', { name: '백업 manifest' })
    await userEvent.click(screen.getByRole('radio', { name: /^전체 데이터/ }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '백업 manifest' })).not.toBeInTheDocument())
  })
})
