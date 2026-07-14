import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImportExecutionProgress } from './ImportExecutionProgress'

describe('ImportExecutionProgress', () => {
  it('shows current item and all counters', () => {
    render(<ImportExecutionProgress progress={{ completed: 1, total: 4, currentTitle: '현재 글', imported: 1, failed: 0, skipped: 1 }} />)
    expect(screen.getByText('현재 항목: 현재 글')).toBeInTheDocument(); expect(screen.getByText('성공 1')).toBeInTheDocument(); expect(screen.getByText('남음 3')).toBeInTheDocument()
  })
  it('shows completion when no item is active', () => {
    render(<ImportExecutionProgress progress={{ completed: 2, total: 2, currentTitle: null, imported: 1, failed: 1, skipped: 0 }} />)
    expect(screen.getByText('실행을 마쳤습니다.')).toBeInTheDocument(); expect(screen.getByText('남음 0')).toBeInTheDocument()
  })
  it('sets the native progress value', () => {
    render(<ImportExecutionProgress progress={{ completed: 2, total: 5, currentTitle: 'A', imported: 1, failed: 1, skipped: 0 }} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2'); expect(screen.getByRole('progressbar')).toHaveAttribute('max', '5')
  })
  it('never reports a negative remaining count', () => {
    render(<ImportExecutionProgress progress={{ completed: 3, total: 2, currentTitle: null, imported: 2, failed: 1, skipped: 0 }} />)
    expect(screen.getByText('남음 0')).toBeInTheDocument()
  })
})
