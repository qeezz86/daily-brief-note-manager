import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { NewsFollowup } from './newsFollowups.types'
import { NewsFollowupList } from './NewsFollowupList'

const topic = { id: 'topic-1', canonical_title: '금리 전망', status: 'active', category_id: 'economy', category: { id: 'economy', name: '경제', content_group: 'news' } }
function followup(status = 'pending', due = '2020-01-01'): NewsFollowup { return { id: 'f1', topic_id: 'topic-1', check_text: '한국은행 의결문 확인', status, due_date: due, priority: 'high', resolution_note: status === 'pending' ? null : '처리 메모', resolved_at: status === 'pending' ? null : '2026-07-12T00:00:00Z', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-12T00:00:00Z', topic } }
function renderList(item = followup(), onResolve = vi.fn()) { render(<MemoryRouter><NewsFollowupList items={[item]} onResolve={onResolve} /></MemoryRouter>); return onResolve }

describe('NewsFollowupList', () => {
  it('renders linked topic, priority, and overdue state', () => { renderList(); expect(screen.getByText('한국은행 의결문 확인')).toBeInTheDocument(); expect(screen.getByRole('link', { name: '금리 전망' })).toHaveAttribute('href', '/news-topics/topic-1'); expect(screen.getByText('마감 초과')).toBeInTheDocument(); expect(screen.getByText('높음')).toBeInTheDocument() })
  it('does not mark resolved past dates overdue or show edit', () => { renderList(followup('done')); expect(screen.queryByText('마감 초과')).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument(); expect(screen.getByText('처리 메모')).toBeInTheDocument() })
  it('requires a completion note', async () => { const user = userEvent.setup(); renderList(); await user.click(screen.getByRole('button', { name: '완료 처리' })); await user.click(screen.getAllByRole('button', { name: '완료 처리' })[0]); expect(screen.getByRole('alert')).toHaveTextContent('완료 또는 취소 사유를 입력해 주세요.') })
  it('submits a completion note', async () => { const user = userEvent.setup(); const resolve = renderList(); await user.click(screen.getByRole('button', { name: '완료 처리' })); await user.type(screen.getByLabelText('해결 메모'), '공식 발표 확인'); await user.click(screen.getAllByRole('button', { name: '완료 처리' })[0]); expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), { targetStatus: 'done', resolutionNote: '공식 발표 확인' }) })
  it('submits a cancellation reason', async () => { const user = userEvent.setup(); const resolve = renderList(); await user.click(screen.getByRole('button', { name: '취소 처리' })); await user.type(screen.getByLabelText('취소 사유'), '일정 철회'); await user.click(screen.getAllByRole('button', { name: '취소 처리' })[0]); expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), { targetStatus: 'cancelled', resolutionNote: '일정 철회' }) })
})
