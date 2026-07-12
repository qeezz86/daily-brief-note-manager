import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../features/categories/categories.types'
import type { NewsTopic } from '../features/newsTopics/newsTopics.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { NewsTopicsPageContent } from './NewsTopicsPage'

const categories: Category[] = [
  { id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: null, slug_pattern: 'x', wrapper_class: 'news' },
  { id: 'global', content_group: 'news', name: '국제', sort_order: 2, display_id_pattern: null, slug_pattern: 'x', wrapper_class: 'news' },
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', sort_order: 3, display_id_pattern: null, slug_pattern: 'x', wrapper_class: 'ai' },
]
const topics: NewsTopic[] = [
  { id: '1', category_id: 'economy', topic_key: 'rate-outlook', canonical_title: '기준금리 전망', topic_summary: null, status: 'active', closed_reason: null, first_seen_at: '2026-07-01', last_seen_at: '2026-07-03', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-03T00:00:00Z' },
  { id: '2', category_id: 'global', topic_key: 'trade-policy', canonical_title: '글로벌 무역 정책', topic_summary: null, status: 'closed', closed_reason: '협상 종료', first_seen_at: '2026-07-01', last_seen_at: '2026-07-02', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' },
]
function client() {
  const categoryBuilder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }; categoryBuilder.select.mockReturnValue(categoryBuilder); categoryBuilder.eq.mockReturnValue(categoryBuilder); categoryBuilder.order.mockResolvedValue({ data: categories, error: null })
  const topicBuilder = { select: vi.fn(), order: vi.fn() }; topicBuilder.select.mockReturnValue(topicBuilder); topicBuilder.order.mockReturnValueOnce(topicBuilder).mockResolvedValueOnce({ data: topics, error: null })
  return { from: vi.fn((table: string) => table === 'categories' ? categoryBuilder : topicBuilder) } as unknown as DatabaseClient
}
function renderPage() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={qc}><MemoryRouter><NewsTopicsPageContent client={client()} userId="owner" /></MemoryRouter></QueryClientProvider>) }

describe('NewsTopicsPage', () => {
  it('renders news topic cards', async () => { renderPage(); expect(await screen.findByRole('heading', { name: '기준금리 전망' })).toBeInTheDocument(); expect(screen.getByText('협상 종료')).toBeInTheDocument() })
  it('shows only news categories', async () => { renderPage(); expect(await screen.findByRole('option', { name: '경제' })).toBeInTheDocument(); expect(screen.queryByRole('option', { name: 'AI 칼럼' })).not.toBeInTheDocument() })
  it('filters by category', async () => { const user = userEvent.setup(); renderPage(); await screen.findByText('기준금리 전망'); await user.selectOptions(screen.getByLabelText('카테고리'), 'global'); expect(screen.queryByText('기준금리 전망')).not.toBeInTheDocument() })
  it('filters by status', async () => { const user = userEvent.setup(); renderPage(); await screen.findByText('기준금리 전망'); await user.selectOptions(screen.getByLabelText('상태'), 'closed'); expect(screen.getByText('글로벌 무역 정책')).toBeInTheDocument(); expect(screen.queryByText('기준금리 전망')).not.toBeInTheDocument() })
  it('searches title and topic key', async () => { const user = userEvent.setup(); renderPage(); await screen.findByText('기준금리 전망'); await user.type(screen.getByLabelText('대표 제목·주제 키 검색'), 'trade-policy'); expect(screen.getByText('글로벌 무역 정책')).toBeInTheDocument(); expect(screen.queryByText('기준금리 전망')).not.toBeInTheDocument() })
  it('resets all filters and search', async () => { const user = userEvent.setup(); renderPage(); await screen.findByText('기준금리 전망'); await user.selectOptions(screen.getByLabelText('카테고리'), 'global'); await user.type(screen.getByLabelText('대표 제목·주제 키 검색'), 'trade'); await user.click(screen.getByRole('button', { name: '필터·검색 초기화' })); expect(screen.getByText('기준금리 전망')).toBeInTheDocument(); expect(screen.getByLabelText('카테고리')).toHaveValue('') })
})
