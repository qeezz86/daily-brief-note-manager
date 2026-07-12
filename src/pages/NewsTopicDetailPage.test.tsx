import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../shared/supabase/client'
import { NewsTopicDetailPageContent } from './NewsTopicDetailPage'

const topic = { id: 'topic-1', category_id: 'economy', topic_key: 'rate-outlook', canonical_title: '금리 전망', topic_summary: '요약', status: 'active', closed_reason: null, first_seen_at: '2026-07-01', last_seen_at: '2026-07-02', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' }
function mockClient() {
  const category = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }; category.select.mockReturnValue(category); category.eq.mockReturnValue(category); category.order.mockResolvedValue({ data: [{ id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: null, slug_pattern: 'x', wrapper_class: 'news' }], error: null })
  const detail = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }; detail.select.mockReturnValue(detail); detail.eq.mockReturnValue(detail); detail.maybeSingle.mockResolvedValue({ data: topic, error: null })
  const history = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }; history.select.mockReturnValue(history); history.eq.mockReturnValue(history); history.order.mockResolvedValue({ data: [{ id: 'history-1', topic_id: 'topic-1', from_status: 'monitoring', to_status: 'active', reason: '다시 활성 추적', changed_at: '2026-07-02T00:00:00Z' }], error: null })
  const updates = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }; updates.select.mockReturnValue(updates); updates.eq.mockReturnValue(updates); updates.order.mockResolvedValue({ data: [], error: null })
  const followups = { select: vi.fn(), eq: vi.fn() }; followups.select.mockReturnValue(followups); followups.eq.mockResolvedValue({ data: [], error: null })
  return { from: vi.fn((table: string) => table === 'categories' ? category : table === 'news_status_history' ? history : table === 'news_updates' ? updates : table === 'news_followups' ? followups : detail), rpc: vi.fn() } as unknown as DatabaseClient
}
function renderDetail() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={qc}><MemoryRouter><NewsTopicDetailPageContent client={mockClient()} userId="owner" topicId="topic-1" /></MemoryRouter></QueryClientProvider>) }

describe('NewsTopicDetailPage', () => {
  it('renders topic details and status history', async () => { renderDetail(); expect(await screen.findByRole('heading', { name: '금리 전망' })).toBeInTheDocument(); expect(screen.getByText('모니터링 → 활성')).toBeInTheDocument(); expect(screen.getByText('다시 활성 추적')).toBeInTheDocument() })
  it('offers only allowed transitions', async () => { renderDetail(); await screen.findByText('금리 전망'); expect(screen.getByRole('option', { name: '모니터링' })).toBeInTheDocument(); expect(screen.getByRole('option', { name: '종료' })).toBeInTheDocument(); expect(screen.queryByRole('option', { name: '재개' })).not.toBeInTheDocument() })
  it('blocks closing without a reason before confirmation', async () => { const user = userEvent.setup(); renderDetail(); await screen.findByText('금리 전망'); await user.selectOptions(screen.getByLabelText('변경할 상태'), 'closed'); await user.click(screen.getByRole('button', { name: '상태 변경' })); expect(screen.getByRole('alert')).toHaveTextContent('종료 사유를 입력해 주세요.') })
  it('renders a distinct followup section with zero counts', async () => { renderDetail(); await screen.findByText('금리 전망'); expect(screen.getByRole('heading', { name: '후속 확인' })).toBeInTheDocument(); expect(screen.getByRole('link', { name: '후속 확인 추가' })).toHaveAttribute('href', '/news-topics/topic-1/followups/new'); expect(screen.getByText('등록된 후속 확인 항목이 없습니다.')).toBeInTheDocument() })
})
