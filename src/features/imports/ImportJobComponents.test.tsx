import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ImportJobActions } from './ImportJobActions'
import { ImportJobItemList } from './ImportJobItemList'
import { ImportJobList } from './ImportJobList'
import { ImportJobProgress } from './ImportJobProgress'
import type { ImportJobDetail, ImportJobItem, ImportJobListItem } from './importJobs.types'

const listJob: ImportJobListItem = { id: '00000000-0000-0000-0000-000000000001', format: 'daily-brief-note-content-import', schemaVersion: 1, sourceName: 'bundle.json', sourceFingerprint: 'a'.repeat(64), status: 'completed_with_errors', totalCount: 2, completedCount: 2, successCount: 1, failedCount: 1, pendingCount: 0, progressPercent: 100, createdAt: '2027-01-01T00:00:00Z', startedAt: '2027-01-01T00:01:00Z', completedAt: '2027-01-01T00:02:00Z' }
const detail: ImportJobDetail = { ...listJob, readyCount: 2, warningCount: 0, invalidCount: 0, duplicateCount: 0, acknowledgedWarningCount: 0, dryRunSummary: {}, runningCount: 0, contentImportedCount: 2, contentFailedCount: 0, trackingImportedCount: 1, trackingFailedCount: 1, trackingNotPresentCount: 0, trackingNotApplicableCount: 0, cancelledCount: 0, retryableFailureCount: 1, contentRetryableFailureCount: 0, trackingRetryableFailureCount: 1, nonRetryableFailureCount: 0, cancelledAt: null }
function item(overrides: Partial<ImportJobItem> = {}): ImportJobItem { return { id: '00000000-0000-0000-0000-000000000011', itemIndex: 0, externalKey: 'external-one', payloadFingerprint: 'b'.repeat(64), title: '첫 번째 뉴스', categoryId: 'economy', validationStatus: 'ready', warningAcknowledged: false, contentStatus: 'imported', trackingStatus: 'failed', overallStatus: 'failed', postId: '00000000-0000-0000-0000-000000000012', contentAttemptCount: 1, trackingAttemptCount: 2, contentErrorCode: null, contentErrorMessage: null, contentRetryable: false, trackingErrorCode: 'IMPORT_TRACKING_TOPIC_CONFLICT', trackingErrorMessage: '안전한 tracking 오류', trackingRetryable: true, topicCount: null, reusedTopicCount: null, createdTopicCount: null, updateCount: null, followupCount: null, sourceLinkCount: null, contentStartedAt: null, contentCompletedAt: null, trackingStartedAt: null, trackingCompletedAt: null, attempts: [{ id: '00000000-0000-0000-0000-000000000013', stage: 'tracking', attemptNo: 1, status: 'failed', safeErrorCode: 'IMPORT_TRACKING_TOPIC_CONFLICT', safeErrorMessage: '안전한 tracking 오류', retryable: true, startedAt: '2027-01-01T00:00:00Z', completedAt: '2027-01-01T00:00:01Z' }], ...overrides } }

describe('Import job UI components', () => {
  it('DB 집계 진행률을 표시한다', () => { render(<ImportJobProgress job={detail} />); expect(screen.getByText('2 / 2 완료 · 100%')).toBeInTheDocument(); expect(screen.getByText(/재시도 가능/)).toHaveTextContent('1') })
  it('retry 가능한 실패 액션을 활성화한다', async () => { const run = vi.fn(); render(<ImportJobActions job={detail} busy={false} onExecute={run} onCancel={vi.fn()} onResume={vi.fn()} />); await userEvent.click(screen.getByRole('button', { name: 'tracking 실패 재시도' })); expect(run).toHaveBeenCalledWith('tracking_failed') })
  it('pending이 없으면 계속 실행을 비활성화한다', () => { render(<ImportJobActions job={detail} busy={false} onExecute={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()} />); expect(screen.getByRole('button', { name: '계속 실행' })).toBeDisabled() })
  it('취소된 job에는 재개 버튼만 제공한다', () => { render(<ImportJobActions job={{ ...detail, status: 'cancelled' }} busy={false} onExecute={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()} />); expect(screen.getByRole('button', { name: '취소된 작업 재개' })).toBeEnabled(); expect(screen.queryByRole('button', { name: '작업 취소' })).not.toBeInTheDocument() })
  it('작업 목록에 source, 상태, 시각, 진행률과 상세 링크를 표시한다', () => { render(<MemoryRouter><ImportJobList jobs={[listJob]} /></MemoryRouter>); expect(screen.getByRole('link', { name: 'bundle.json' })).toHaveAttribute('href', `/imports/history/${listJob.id}`); expect(screen.getByText('시작')).toBeInTheDocument(); expect(screen.getByText('완료 시각')).toBeInTheDocument(); expect(screen.getByText('2/2 (100%)')).toBeInTheDocument(); expect(screen.getByText('성공').nextSibling).toHaveTextContent('1') })
  it('빈 작업 목록 상태를 표시한다', () => { render(<ImportJobList jobs={[]} />); expect(screen.getByText('조건에 맞는 Import 작업이 없습니다.')).toBeInTheDocument() })
  it('item별 콘텐츠·tracking 상태와 attempt 수를 표시한다', () => { render(<MemoryRouter><ImportJobItemList items={[item()]} /></MemoryRouter>); expect(screen.getByText('imported (1회)')).toBeInTheDocument(); expect(screen.getByText('failed (2회)')).toBeInTheDocument() })
  it('안전한 오류와 retryable 여부를 표시한다', () => { render(<MemoryRouter><ImportJobItemList items={[item()]} /></MemoryRouter>); expect(screen.getAllByText(/안전한 tracking 오류/)[0]).toHaveTextContent('재시도 가능') })
  it('생성된 게시물 링크를 표시한다', () => { render(<MemoryRouter><ImportJobItemList items={[item()]} /></MemoryRouter>); expect(screen.getByRole('link', { name: '생성된 게시물 열기' })).toHaveAttribute('href', '/content/00000000-0000-0000-0000-000000000012') })
  it('tracking 결과 집계를 표시한다', () => { render(<MemoryRouter><ImportJobItemList items={[item({ topicCount: 2, reusedTopicCount: 1, createdTopicCount: 1, updateCount: 3, followupCount: 4, sourceLinkCount: 5 })]} /></MemoryRouter>); expect(screen.getByText(/tracking 집계/)).toHaveTextContent('topic 2 · 재사용 1 · 생성 1 · update 3 · followup 4 · source 5') })
  it('시도 기록을 펼쳐 stage와 번호를 표시한다', async () => { render(<MemoryRouter><ImportJobItemList items={[item()]} /></MemoryRouter>); await userEvent.click(screen.getByText('시도 기록 1개')); expect(screen.getByText(/tracking #1/)).toBeInTheDocument() })
  it('제목과 external key로 검색한다', async () => { render(<MemoryRouter><ImportJobItemList items={[item(), item({ id: '00000000-0000-0000-0000-000000000021', itemIndex: 1, title: '두 번째 뉴스', externalKey: 'external-two' })]} /></MemoryRouter>); await userEvent.type(screen.getByPlaceholderText('제목 또는 external key'), '두 번째'); expect(screen.queryByText(/1\. 첫 번째 뉴스/)).not.toBeInTheDocument(); expect(screen.getByText(/2\. 두 번째 뉴스/)).toBeInTheDocument() })
  it('payload snapshot과 HTML 원문은 렌더링하지 않는다', () => { render(<MemoryRouter><ImportJobItemList items={[item()]} /></MemoryRouter>); expect(screen.getByText(/snapshot 원문과 HTML은/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain('<div class=') })
  it('복원된 작업 목록에 badge, 실행 잠금과 origin checksum을 표시한다', () => {
    render(<MemoryRouter><ImportJobList jobs={[{ ...listJob, restoredFromBackup: true, executionLocked: true, restoreOriginChecksum: 'c'.repeat(64) }]} /></MemoryRouter>)
    expect(screen.getByText(/completed_with_errors · 복원된 과거 이력/)).toBeInTheDocument()
    expect(screen.getByText(/실행 잠금 · origin cccccccccccc…/)).toBeInTheDocument()
  })
  it('일반 작업 목록에는 복원 badge와 실행 잠금을 표시하지 않는다', () => {
    render(<MemoryRouter><ImportJobList jobs={[listJob]} /></MemoryRouter>)
    expect(screen.queryByText(/복원된 과거 이력/)).not.toBeInTheDocument()
    expect(screen.queryByText(/실행 잠금/)).not.toBeInTheDocument()
  })
  it('실행 잠금 작업은 안내만 표시하고 모든 실행 액션을 숨긴다', () => {
    const handlers = { onExecute: vi.fn(), onCancel: vi.fn(), onResume: vi.fn() }
    render(<ImportJobActions job={{ ...detail, executionLocked: true, restoredFromBackup: true, restoreOriginChecksum: 'c'.repeat(64) }} busy={false} {...handlers} />)
    expect(screen.getByText('복원된 과거 이력')).toBeInTheDocument()
    expect(screen.getByText(/콘텐츠와 tracking을 다시 실행할 수 없습니다/)).toBeInTheDocument()
    for (const name of ['계속 실행', '실패 항목 재시도', '콘텐츠 실패 재시도', 'tracking 실패 재시도', '작업 취소', '취소된 작업 재개']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
