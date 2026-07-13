import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  briefingPromptRunFixture as run,
  briefingPromptRunRow,
} from '../features/briefingPrompts/briefingPrompts.fixtures'
import type { DatabaseClient } from '../shared/supabase/client'
import { BriefingPromptRunDetailPageContent } from './BriefingPromptRunDetailPage'

afterEach(() => vi.restoreAllMocks())

function detailClient(options: { found?: boolean; pinError?: boolean } = {}) {
  let current = run
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder)
  builder.maybeSingle.mockImplementation(() => Promise.resolve({ data: options.found === false ? null : briefingPromptRunRow(current), error: null }))
  const rpc = vi.fn().mockImplementation((_name: string, args: { p_is_pinned: boolean }) => {
    if (options.pinError) return Promise.resolve({ data: null, error: { message: 'private SQL' } })
    current = { ...current, isPinned: args.p_is_pinned }
    return Promise.resolve({ data: briefingPromptRunRow(current), error: null })
  })
  return { client: { from: vi.fn(() => builder), rpc } as unknown as DatabaseClient, rpc }
}

function renderPage(client: DatabaseClient | null = detailClient().client) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/briefing-prompts/history/${run.id}`]}><Routes><Route path="/briefing-prompts/history/:runId" element={<BriefingPromptRunDetailPageContent client={client} userId="owner" runId={run.id} />} /><Route path="/briefing-prompts/history" element={<p>history page</p>} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('BriefingPromptRunDetailPage', () => {
  it('renders only the saved prompt and snapshot metadata', async () => {
    const { client } = detailClient(); renderPage(client)
    expect(await screen.findByRole('textbox', { name: '저장된 프롬프트' })).toHaveValue(run.promptText)
    expect(screen.getByText(/"referenceDate": "2026-07-13"/)).toBeInTheDocument()
    expect(screen.getByText('Context schema').nextElementSibling).toHaveTextContent('v1')
    expect(screen.getByText('Template version').nextElementSibling).toHaveTextContent('v1')
    expect(screen.getByText(/게시물 1 · 뉴스 항목 1/)).toBeInTheDocument()
    expect(client.rpc).not.toHaveBeenCalledWith('get_news_briefing_prompt_context', expect.anything())
  })
  it('copies the exact saved prompt and JSON', async () => {
    const user = userEvent.setup(); const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); renderPage(); await screen.findByRole('textbox', { name: '저장된 프롬프트' })
    await user.click(screen.getByRole('button', { name: '프롬프트 복사' })); expect(writeText).toHaveBeenCalledWith(run.promptText)
    await user.click(screen.getByRole('button', { name: 'Context JSON 복사' })); expect(writeText).toHaveBeenCalledWith(JSON.stringify(run.contextSnapshot, null, 2))
  })
  it('pins and unpins through the RPC', async () => {
    const user = userEvent.setup(); const { client, rpc } = detailClient(); renderPage(client); await screen.findByRole('textbox', { name: '저장된 프롬프트' })
    await user.click(screen.getByRole('button', { name: '고정' })); await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_news_briefing_prompt_run_pinned', { p_prompt_run_id: run.id, p_is_pinned: true })); expect(await screen.findByText('프롬프트를 고정했습니다.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '고정 해제' })).toBeInTheDocument()); await user.click(screen.getByRole('button', { name: '고정 해제' })); await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_news_briefing_prompt_run_pinned', { p_prompt_run_id: run.id, p_is_pinned: false }))
  })
  it('shows a safe pin error', async () => {
    const user = userEvent.setup(); renderPage(detailClient({ pinError: true }).client); await screen.findByRole('textbox', { name: '저장된 프롬프트' }); await user.click(screen.getByRole('button', { name: '고정' })); expect(await screen.findByText('프롬프트 고정 상태를 변경하지 못했습니다.')).toBeInTheDocument(); expect(screen.queryByText('private SQL')).not.toBeInTheDocument()
  })
  it('uses the same not-found state for missing or inaccessible runs', async () => { renderPage(detailClient({ found: false }).client); expect(await screen.findByRole('heading', { name: '프롬프트 이력을 찾을 수 없습니다' })).toBeInTheDocument() })
  it('shows a safe label for a legacy run without a template version', async () => {
    const legacyRun = { ...run, promptTemplateVersion: null, contextSnapshot: { ...run.contextSnapshot, promptTemplateVersion: undefined } }
    const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.maybeSingle.mockResolvedValue({ data: briefingPromptRunRow(legacyRun), error: null })
    renderPage({ from: vi.fn(() => builder), rpc: vi.fn() } as unknown as DatabaseClient)
    expect((await screen.findByText('Template version')).nextElementSibling).toHaveTextContent('기록 없음 (이전 이력)')
  })
  it('shows the Supabase configuration state', () => { renderPage(null); expect(screen.getByRole('heading', { name: 'Supabase 연결이 설정되지 않았습니다' })).toBeInTheDocument() })
})
