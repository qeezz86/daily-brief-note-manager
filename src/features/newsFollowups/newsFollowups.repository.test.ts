import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { createNewsFollowup, resolveNewsFollowup, updateNewsFollowup } from './newsFollowups.repository'

function client(result: { data?: unknown; error?: { code?: string; message?: string; details?: string } }) { return { rpc: vi.fn().mockResolvedValue({ data: result.data ?? { id: 'f1' }, error: result.error ?? null }) } as unknown as DatabaseClient }
describe('news followup repository mutations', () => {
  it('maps create payload without owner or status', async () => { const c = client({}); await createNewsFollowup(c, { topicId: 't1', checkText: '확인', dueDate: null, priority: 'normal' }); expect(c.rpc).toHaveBeenCalledWith('create_news_followup', { p_topic_id: 't1', p_check_text: '확인', p_due_date: null, p_priority: 'normal' }) })
  it('maps update payload without identity fields', async () => { const c = client({}); await updateNewsFollowup(c, 'f1', { checkText: '수정', dueDate: '2026-07-20', priority: 'high' }); expect(c.rpc).toHaveBeenCalledWith('update_news_followup', { p_followup_id: 'f1', p_check_text: '수정', p_due_date: '2026-07-20', p_priority: 'high' }) })
  it('maps resolution payload without resolved time', async () => { const c = client({}); await resolveNewsFollowup(c, 'f1', { targetStatus: 'done', resolutionNote: '완료' }); expect(c.rpc).toHaveBeenCalledWith('resolve_news_followup', { p_followup_id: 'f1', p_target_status: 'done', p_resolution_note: '완료' }) })
  it('maps a closed topic error to friendly copy', async () => { await expect(createNewsFollowup(client({ error: { message: 'NEWS_FOLLOWUP_CLOSED_TOPIC' } }), { topicId: 't1', checkText: '확인', dueDate: null, priority: 'normal' })).rejects.toThrow('종료된 뉴스 주제') })
  it('maps resolved and resolution errors to friendly copy', async () => { await expect(resolveNewsFollowup(client({ error: { message: 'NEWS_FOLLOWUP_ALREADY_RESOLVED' } }), 'f1', { targetStatus: 'done', resolutionNote: 'x' })).rejects.toThrow('이미 처리된'); await expect(resolveNewsFollowup(client({ error: { message: 'NEWS_FOLLOWUP_RESOLUTION_REQUIRED' } }), 'f1', { targetStatus: 'done', resolutionNote: '' })).rejects.toThrow('완료 또는 취소 사유') })
  it('does not expose unknown database errors', async () => { await expect(updateNewsFollowup(client({ error: { message: 'relation internal_secret failed' } }), 'f1', { checkText: 'x', dueDate: null, priority: 'low' })).rejects.toThrow('후속 확인 항목 저장 중 오류가 발생했습니다.') })
})

