import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  briefingPromptRunFixture as run,
  briefingPromptRunRow,
} from '../features/briefingPrompts/briefingPrompts.fixtures'
import type { DatabaseClient } from '../shared/supabase/client'
import { BriefingPromptHistoryPageContent } from './BriefingPromptHistoryPage'

const pinnedGlobal = {
  ...run,
  id: '77777777-7777-4777-8777-777777777777',
  categoryId: 'global',
  promptMode: 'detailed' as const,
  promptText: '작업: 국제 뉴스 브리핑 작성',
  isPinned: true,
  contextSnapshot: { ...run.contextSnapshot, category: { ...run.contextSnapshot.category, id: 'global', name: '국제' } },
}

function historyClient(rows = [briefingPromptRunRow(run), briefingPromptRunRow(pinnedGlobal)]) {
  const builder = { select: vi.fn(), order: vi.fn() }
  builder.select.mockReturnValue(builder)
  builder.order.mockImplementation((column: string) => column === 'id' ? Promise.resolve({ data: rows, error: null }) : builder)
  return { from: vi.fn(() => builder) } as unknown as DatabaseClient
}

function renderPage(client: DatabaseClient | null = historyClient()) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><BriefingPromptHistoryPageContent client={client} userId="owner" /></MemoryRouter></QueryClientProvider>)
}

describe('BriefingPromptHistoryPage', () => {
  it('renders saved category, mode, dates, counts and pin state', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: '작업: 경제 뉴스 브리핑 작성' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByText('표준')).not.toHaveLength(0)
    expect(screen.getAllByText('2026-07-13')).not.toHaveLength(0)
    expect(screen.getAllByText(/게시물 1 · 추적 1/)).not.toHaveLength(0)
    expect(screen.getAllByText('고정')).not.toHaveLength(0)
  })
  it('filters by category, mode and pin state', async () => {
    const user = userEvent.setup(); renderPage(); await screen.findByText('2개 이력')
    await user.selectOptions(screen.getByLabelText('카테고리'), 'global')
    expect(screen.getByText('1개 이력')).toBeInTheDocument(); expect(screen.queryByRole('link', { name: '작업: 경제 뉴스 브리핑 작성' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('모드'), 'detailed'); await user.selectOptions(screen.getByLabelText('고정 상태'), 'pinned')
    expect(screen.getByRole('link', { name: '작업: 국제 뉴스 브리핑 작성' })).toBeInTheDocument()
  })
  it('explains category retention and unpin cleanup', async () => {
    renderPage(); await screen.findByText(/카테고리별 고정하지 않은 최근 프롬프트 30개/)
    expect(screen.getByText(/오래된 고정 프롬프트를 해제하면/)).toBeInTheDocument()
  })
  it('shows empty and configuration states', async () => {
    const view = renderPage(historyClient([])); expect(await screen.findByText('조건에 맞는 프롬프트 이력이 없습니다.')).toBeInTheDocument(); view.unmount()
    renderPage(null); expect(screen.getByRole('heading', { name: 'Supabase 연결이 설정되지 않았습니다' })).toBeInTheDocument()
  })
})
