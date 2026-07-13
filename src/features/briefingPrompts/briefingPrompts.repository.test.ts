import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { getNewsBriefingPromptContext } from './briefingPrompts.repository'
import { briefingPromptContextFixture as context } from './briefingPrompts.fixtures'

const settings = { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard' as const, closedLookbackDays: 90 }
describe('briefing prompt repository', () => {
  it('sends bounded RPC parameters', async () => { const rpc = vi.fn().mockResolvedValue({ data: context, error: null }); await getNewsBriefingPromptContext({ rpc } as unknown as DatabaseClient, settings); expect(rpc).toHaveBeenCalledWith('get_news_briefing_prompt_context', { p_category_id: 'economy', p_reference_date: '2026-07-13', p_recent_post_limit: 5, p_closed_lookback_days: 90, p_closed_limit: 20 }) })
  it('returns a safe RPC error message', async () => { const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL' } }) } as unknown as DatabaseClient; await expect(getNewsBriefingPromptContext(client, settings)).rejects.toThrow('브리핑 프롬프트 데이터를 불러오지 못했습니다.'); await expect(getNewsBriefingPromptContext(client, settings)).rejects.not.toThrow('private SQL') })
  it('rejects invalid RPC JSON', async () => { const client = { rpc: vi.fn().mockResolvedValue({ data: { schemaVersion: 2 }, error: null }) } as unknown as DatabaseClient; await expect(getNewsBriefingPromptContext(client, settings)).rejects.toThrow('데이터 형식이 올바르지 않습니다') })
})
