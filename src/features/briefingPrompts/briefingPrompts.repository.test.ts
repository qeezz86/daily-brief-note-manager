import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { getNewsBriefingPromptContext, getPromptRunById, listPromptRuns, savePromptRun, setPromptRunPinned } from './briefingPrompts.repository'
import { briefingPromptContextFixture as context, briefingPromptRunFixture as run, briefingPromptRunRow } from './briefingPrompts.fixtures'

const settings = { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard' as const, closedLookbackDays: 90 }
describe('briefing prompt repository', () => {
  it('sends bounded RPC parameters', async () => { const rpc = vi.fn().mockResolvedValue({ data: context, error: null }); await getNewsBriefingPromptContext({ rpc } as unknown as DatabaseClient, settings); expect(rpc).toHaveBeenCalledWith('get_news_briefing_prompt_context', { p_category_id: 'economy', p_reference_date: '2026-07-13', p_recent_post_limit: 5, p_closed_lookback_days: 90, p_closed_limit: 20 }) })
  it('returns a safe RPC error message', async () => { const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL' } }) } as unknown as DatabaseClient; await expect(getNewsBriefingPromptContext(client, settings)).rejects.toThrow('브리핑 프롬프트 데이터를 불러오지 못했습니다.'); await expect(getNewsBriefingPromptContext(client, settings)).rejects.not.toThrow('private SQL') })
  it('rejects invalid RPC JSON', async () => { const client = { rpc: vi.fn().mockResolvedValue({ data: { schemaVersion: 2 }, error: null }) } as unknown as DatabaseClient; await expect(getNewsBriefingPromptContext(client, settings)).rejects.toThrow('데이터 형식이 올바르지 않습니다') })
})

describe('briefing prompt history repository', () => {
  it('selects explicit history fields and deterministic ordering', async () => {
    const builder = { select: vi.fn(), order: vi.fn() }
    builder.select.mockReturnValue(builder)
    builder.order.mockReturnValueOnce(builder).mockResolvedValueOnce({ data: [briefingPromptRunRow()], error: null })
    const client = { from: vi.fn(() => builder) } as unknown as DatabaseClient
    await expect(listPromptRuns(client)).resolves.toEqual([run])
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
    expect(builder.order).toHaveBeenNthCalledWith(1, 'generated_at', { ascending: false })
    expect(builder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
  })
  it('returns not-found safely for an inaccessible detail', async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(getPromptRunById({ from: vi.fn(() => builder) } as unknown as DatabaseClient, run.id)).resolves.toBeNull()
  })
  it('saves the exact preview and snapshot through the dedicated RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: briefingPromptRunRow(), error: null })
    const promptText = run.promptText
    await expect(savePromptRun({ rpc } as unknown as DatabaseClient, { settings, context, promptText })).resolves.toEqual(run)
    expect(rpc).toHaveBeenCalledWith('save_news_briefing_prompt_run', expect.objectContaining({ p_context_snapshot: context, p_prompt_text: promptText, p_category_id: 'economy', p_reference_date: '2026-07-13', p_prompt_mode: 'standard', p_closed_lookback_days: 90 }))
  })
  it('does not expose RPC error details', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL' } }) } as unknown as DatabaseClient
    await expect(savePromptRun(client, { settings, context, promptText: run.promptText })).rejects.toThrow('저장하지 못했습니다')
    await expect(setPromptRunPinned(client, run.id, true)).rejects.toThrow('변경하지 못했습니다')
  })
  it('pins only through the dedicated RPC', async () => {
    const pinned = { ...run, isPinned: true }
    const rpc = vi.fn().mockResolvedValue({ data: briefingPromptRunRow(pinned), error: null })
    await expect(setPromptRunPinned({ rpc } as unknown as DatabaseClient, run.id, true)).resolves.toEqual(pinned)
    expect(rpc).toHaveBeenCalledWith('set_news_briefing_prompt_run_pinned', { p_prompt_run_id: run.id, p_is_pinned: true })
  })
})
