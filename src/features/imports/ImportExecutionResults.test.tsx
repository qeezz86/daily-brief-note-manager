import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ImportExecutionResults } from './ImportExecutionResults'

const result = {
  startedAt: '2026-07-14T00:00:00Z', completedAt: '2026-07-14T00:01:00Z', total: 2, imported: 1, failed: 1, skipped: 0,
  items: [
    { externalKey: 'one', title: '성공 글', categoryId: 'economy', status: 'imported' as const, postId: '00000000-0000-0000-0000-000000000001', postPath: '/content/00000000-0000-0000-0000-000000000001' },
    { externalKey: 'two', title: '실패 글', categoryId: 'economy', status: 'failed' as const, errorCode: 'IMPORT_DUPLICATE_SLUG', message: '중복입니다.' },
  ],
}

describe('ImportExecutionResults', () => {
  it('shows counts and a created-post detail link', () => {
    render(<MemoryRouter><ImportExecutionResults result={result} onCopyAll={vi.fn()} onCopyFailures={vi.fn()} copyMessage={null} /></MemoryRouter>)
    expect(screen.getByText(/성공 1 · 실패 1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '생성된 게시물 열기' })).toHaveAttribute('href', result.items[0].postPath)
  })
  it('filters successful and failed items', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><ImportExecutionResults result={result} onCopyAll={vi.fn()} onCopyFailures={vi.fn()} copyMessage={null} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '실패 항목만 보기' }))
    expect(screen.queryByText('성공 글')).not.toBeInTheDocument(); expect(screen.getByText('실패 글')).toBeInTheDocument()
  })
  it('exposes both result copy actions', async () => {
    const user = userEvent.setup(); const copyAll = vi.fn(); const copyFailures = vi.fn()
    render(<MemoryRouter><ImportExecutionResults result={result} onCopyAll={copyAll} onCopyFailures={copyFailures} copyMessage={null} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '결과 복사' })); await user.click(screen.getByRole('button', { name: '실패 결과 복사' }))
    expect(copyAll).toHaveBeenCalledOnce(); expect(copyFailures).toHaveBeenCalledOnce()
  })
  it('filters successful items independently', async () => {
    const user = userEvent.setup(); render(<MemoryRouter><ImportExecutionResults result={result} onCopyAll={vi.fn()} onCopyFailures={vi.fn()} copyMessage={null} /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: '성공 항목만 보기' })); expect(screen.getByText('성공 글')).toBeInTheDocument(); expect(screen.queryByText('실패 글')).not.toBeInTheDocument()
  })
  it('renders the clipboard status message', () => {
    render(<MemoryRouter><ImportExecutionResults result={result} onCopyAll={vi.fn()} onCopyFailures={vi.fn()} copyMessage="복사 완료" /></MemoryRouter>)
    expect(screen.getByRole('status')).toHaveTextContent('복사 완료')
  })
  it('disables failure copy when there are no failures', () => {
    render(<MemoryRouter><ImportExecutionResults result={{ ...result, failed: 0, items: [result.items[0]] }} onCopyAll={vi.fn()} onCopyFailures={vi.fn()} copyMessage={null} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '실패 결과 복사' })).toBeDisabled()
  })
})
