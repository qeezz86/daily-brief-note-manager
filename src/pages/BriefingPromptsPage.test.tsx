import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../features/categories/categories.types'
import { getSeoulDate } from '../features/briefingPrompts/briefingPromptDates'
import { briefingPromptContextFixture as context, briefingPromptRunRow } from '../features/briefingPrompts/briefingPrompts.fixtures'
import type { DatabaseClient } from '../shared/supabase/client'
import { BriefingPromptsPageContent } from './BriefingPromptsPage'

const categories: Category[] = [
  { id: 'economy', content_group: 'news', name: '경제', sort_order: 1, display_id_pattern: '#YYYY-MM-DD-ECO', slug_pattern: 'economy-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing economy' },
  { id: 'global', content_group: 'news', name: '국제', sort_order: 2, display_id_pattern: '#YYYY-MM-DD-GLO', slug_pattern: 'global-briefing-YYYY-MM-DD', wrapper_class: 'daily-brief-note news-briefing global' },
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', sort_order: 2, display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column' },
]
function createClient(data = context, saveError: { message: string } | null = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.order.mockResolvedValue({ data: categories, error: null })
  const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve(name === 'get_news_briefing_prompt_context' ? { data, error: null } : { data: saveError ? null : briefingPromptRunRow(), error: saveError }))
  return { rpc, client: { from: vi.fn(() => builder), rpc } as unknown as DatabaseClient }
}
function renderPage(client: DatabaseClient | null = createClient().client) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { ...render(<QueryClientProvider client={queryClient}><MemoryRouter><BriefingPromptsPageContent client={client} userId="owner" /></MemoryRouter></QueryClientProvider>), queryClient }
}

describe('BriefingPromptsPage', () => {
  it('renders the protected page content fields', async () => { renderPage(); expect(screen.getByRole('heading', { name: '브리핑 프롬프트' })).toBeInTheDocument(); expect(await screen.findByLabelText('뉴스 카테고리')).toBeInTheDocument(); expect(screen.getByLabelText('작성 기준일')).toBeInTheDocument(); expect(screen.getByLabelText('프롬프트 모드')).toBeInTheDocument(); expect(screen.getByLabelText('종료 뉴스 조회 기간')).toBeInTheDocument() })
  it('offers only active news categories', async () => { renderPage(); expect(await screen.findByRole('option', { name: '경제' })).toBeInTheDocument(); expect(screen.queryByRole('option', { name: 'AI 칼럼' })).not.toBeInTheDocument() })
  it('defaults to the current Seoul date without UTC conversion', async () => { renderPage(); expect(await screen.findByLabelText('작성 기준일')).toHaveValue(getSeoulDate()) })
  it('defaults to standard mode and a 90-day lookback', async () => { renderPage(); expect(await screen.findByLabelText('프롬프트 모드')).toHaveValue('standard'); expect(screen.getByLabelText('종료 뉴스 조회 기간')).toHaveValue(90) })
  it('validates lookback range', async () => { const user = userEvent.setup(); renderPage(); const input = await screen.findByLabelText('종료 뉴스 조회 기간'); await user.clear(input); await user.type(input, '181'); expect(screen.getByText('1~180 사이의 정수를 입력해 주세요.')).toBeInTheDocument(); expect(screen.getByRole('button', { name: '프롬프트 생성' })).toBeDisabled() })
  it('sends selected settings to the aggregate RPC', async () => { const user = userEvent.setup(); const { client, rpc } = createClient(); renderPage(client); await screen.findByRole('option', { name: '경제' }); await user.clear(screen.getByLabelText('작성 기준일')); await user.type(screen.getByLabelText('작성 기준일'), '2026-07-13'); await user.selectOptions(screen.getByLabelText('프롬프트 모드'), 'detailed'); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_news_briefing_prompt_context', expect.objectContaining({ p_category_id: 'economy', p_reference_date: '2026-07-13', p_recent_post_limit: 5, p_closed_lookback_days: 90, p_closed_limit: 20 }))) })
  it('renders aggregate result and detailed mode preview', async () => { const user = userEvent.setup(); renderPage(); await screen.findByRole('option', { name: '경제' }); await user.selectOptions(screen.getByLabelText('프롬프트 모드'), 'detailed'); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); expect((await screen.findByLabelText('복사용 프롬프트') as HTMLTextAreaElement).value).toContain('중요성:') })
  it('renders empty aggregate results without blocking generation', async () => { const user = userEvent.setup(); const empty = { ...context, recentPosts: [], openTopics: [], pendingFollowups: [], recentClosedTopics: [], counts: { recentPosts: 0, recentUpdates: 0, openTopics: 0, pendingFollowups: 0, overdueFollowups: 0, recentClosedTopics: 0 } }; renderPage(createClient(empty).client); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); expect(await screen.findByText('최근 브리핑이 없습니다.')).toBeInTheDocument(); expect((screen.getByLabelText('복사용 프롬프트') as HTMLTextAreaElement).value).toContain('최근 게시물 없음') })
  it('shows the Supabase configuration state', () => { renderPage(null); expect(screen.getByRole('heading', { name: 'Supabase 연결이 설정되지 않았습니다' })).toBeInTheDocument() })
  it('disables save before generation and enables it after a valid preview', async () => { const user = userEvent.setup(); renderPage(); expect(screen.getByRole('button', { name: '현재 프롬프트 저장' })).toBeDisabled(); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); expect(await screen.findByRole('button', { name: '현재 프롬프트 저장' })).toBeEnabled() })
  it.each([
    ['category', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('뉴스 카테고리'), 'global')],
    ['reference date', async (user: ReturnType<typeof userEvent.setup>) => { await user.clear(screen.getByLabelText('작성 기준일')); await user.type(screen.getByLabelText('작성 기준일'), '2026-07-12') }],
    ['mode', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('프롬프트 모드'), 'detailed')],
    ['lookback', async (user: ReturnType<typeof userEvent.setup>) => { await user.clear(screen.getByLabelText('종료 뉴스 조회 기간')); await user.type(screen.getByLabelText('종료 뉴스 조회 기간'), '30') }],
  ])('marks preview stale after %s changes', async (_label, change) => { const user = userEvent.setup(); renderPage(); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await screen.findByLabelText('복사용 프롬프트'); await change(user); expect(screen.getByText(/미리보기가 오래되었습니다/)).toBeInTheDocument(); expect(screen.getByRole('button', { name: '현재 프롬프트 저장' })).toBeDisabled() })
  it('allows saving again after regenerating changed settings', async () => { const user = userEvent.setup(); renderPage(); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await screen.findByLabelText('복사용 프롬프트'); await user.selectOptions(screen.getByLabelText('프롬프트 모드'), 'detailed'); expect(screen.getByRole('button', { name: '현재 프롬프트 저장' })).toBeDisabled(); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await waitFor(() => expect(screen.getByRole('button', { name: '현재 프롬프트 저장' })).toBeEnabled()) })
  it('saves the exact preview text and context snapshot', async () => { const user = userEvent.setup(); const { client, rpc } = createClient(); renderPage(client); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); const preview = await screen.findByLabelText('복사용 프롬프트') as HTMLTextAreaElement; await user.click(screen.getByRole('button', { name: '현재 프롬프트 저장' })); await waitFor(() => expect(rpc).toHaveBeenCalledWith('save_news_briefing_prompt_run', expect.objectContaining({ p_prompt_text: preview.value, p_context_snapshot: context }))); expect(screen.getByText(/프롬프트 이력을 저장했습니다/)).toBeInTheDocument() })
  it('shows a safe save error', async () => { const user = userEvent.setup(); renderPage(createClient(context, { message: 'private SQL' }).client); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await screen.findByLabelText('복사용 프롬프트'); await user.click(screen.getByRole('button', { name: '현재 프롬프트 저장' })); expect(await screen.findByText('프롬프트 이력을 저장하지 못했습니다.')).toBeInTheDocument(); expect(screen.queryByText('private SQL')).not.toBeInTheDocument() })
  it('blocks duplicate clicks while a save is pending', async () => {
    const user = userEvent.setup(); const { client, rpc } = createClient(); let finishSave: ((value: unknown) => void) | undefined
    rpc.mockImplementation((name: string) => name === 'get_news_briefing_prompt_context' ? Promise.resolve({ data: context, error: null }) : new Promise((resolve) => { finishSave = resolve }))
    renderPage(client); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await screen.findByLabelText('복사용 프롬프트')
    const button = screen.getByRole('button', { name: '현재 프롬프트 저장' }); await user.click(button); expect(screen.getByRole('button', { name: '저장 중' })).toBeDisabled(); await user.click(screen.getByRole('button', { name: '저장 중' }))
    expect(rpc.mock.calls.filter(([name]) => name === 'save_news_briefing_prompt_run')).toHaveLength(1)
    await act(async () => { finishSave?.({ data: briefingPromptRunRow(), error: null }) }); expect(await screen.findByText(/프롬프트 이력을 저장했습니다/)).toBeInTheDocument()
  })
  it('invalidates the user history cache after save', async () => { const user = userEvent.setup(); const { client } = createClient(); const rendered = renderPage(client); const invalidate = vi.spyOn(rendered.queryClient, 'invalidateQueries'); await screen.findByRole('option', { name: '경제' }); await user.click(screen.getByRole('button', { name: '프롬프트 생성' })); await screen.findByLabelText('복사용 프롬프트'); await user.click(screen.getByRole('button', { name: '현재 프롬프트 저장' })); await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['briefing-prompts', 'history', 'owner'] })) })
})
