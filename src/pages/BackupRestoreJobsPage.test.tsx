import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestoreJobAggregate } from '../features/backups/restoreExecution.types'
import { BackupRestoreJobsPageContent } from './BackupRestoreJobsPage'

const query = vi.hoisted(() => vi.fn())
vi.mock('../features/backups/restoreExecution.queries', () => ({ useRestoreJobsQuery: query }))
const id = '00000000-0000-4000-8000-000000000001'
const job: RestoreJobAggregate = { id, sourceName: 'backup.json', backupProfile: 'core', backupChecksum: 'a'.repeat(64), planFingerprint: 'b'.repeat(64), status: 'running', currentStageKey: 'posts', totalCount: 10, pendingCount: 5, runningCount: 0, appliedCount: 2, reusedCount: 1, skippedCount: 1, failedCount: 1, cancelledCount: 0, retryableFailureCount: 1, completedStageCount: 1, stageCount: 3, progressPercent: 50, stageProgressPercent: 25, createdAt: '2026-07-15T00:00:00Z', startedAt: null, completedAt: null }
const view = () => render(<MemoryRouter><BackupRestoreJobsPageContent client={{} as never} userId="owner" /></MemoryRouter>)

describe('BackupRestoreJobsPage', () => {
  beforeEach(() => query.mockReset().mockReturnValue({ isPending: false, isError: false, data: [job] }))
  it('최근 100개 DB 집계라는 범위를 표시한다', () => { view(); expect(screen.getByText(/최근 100개 restore job/)).toBeInTheDocument() })
  it('작업 이름과 상세 링크를 렌더링한다', () => { view(); expect(screen.getByRole('link', { name: 'backup.json' })).toHaveAttribute('href', `/backups/restore/jobs/${id}`) })
  it('진행률과 현재 stage를 표시한다', () => { view(); expect(screen.getByText('진행률').nextSibling).toHaveTextContent('50%'); expect(screen.getByText('현재 stage').nextSibling).toHaveTextContent('posts') })
  it('applied·reused·skipped 합계를 성공으로 표시한다', () => { view(); expect(screen.getByText('성공').nextSibling).toHaveTextContent('4') })
  it('실패 수를 표시한다', () => { view(); expect(screen.getByText('실패').nextSibling).toHaveTextContent('1') })
  it('빈 목록 상태를 표시한다', () => { query.mockReturnValue({ isPending: false, isError: false, data: [] }); view(); expect(screen.getByText('아직 복원 작업이 없습니다.')).toBeInTheDocument() })
  it('loading과 오류 상태를 각각 표시한다', () => { query.mockReturnValue({ isPending: true, isError: false }); const rendered = view(); expect(screen.getByRole('status')).toBeInTheDocument(); rendered.unmount(); query.mockReturnValue({ isPending: false, isError: true }); view(); expect(screen.getByRole('alert')).toBeInTheDocument() })
})
