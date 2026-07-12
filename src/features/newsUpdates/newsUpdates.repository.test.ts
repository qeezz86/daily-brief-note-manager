import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { createNewsUpdate, reorderNewsUpdates, updateNewsUpdate } from './newsUpdates.repository'
import type { CreateNewsUpdateInput } from './newsUpdates.types'

const input: CreateNewsUpdateInput = { postId: 'post', topicId: 'topic', updateType: 'follow_up', headline: ' 제목 ', factSummary: '사실', importanceSummary: null, impactSummary: null, changeSummary: '변화', previousUpdateId: 'previous', sourceIds: ['source'] }
function client(result: { data?: unknown; error?: { code?: string; message?: string } }) { return { rpc: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }) } as unknown as DatabaseClient }

describe('newsUpdates repository', () => {
  it('maps create input to the RPC without owner or item order', async () => { const c = client({ data: { id: 'update' } }); await createNewsUpdate(c, input); expect(c.rpc).toHaveBeenCalledWith('create_news_update', expect.objectContaining({ p_post_id: 'post', p_topic_id: 'topic', p_previous_update_id: 'previous', p_source_ids: ['source'] })); expect(c.rpc).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ owner_id: expect.anything(), item_order: expect.anything() })) })
  it('maps mutable update fields only', async () => { const c = client({ data: { id: 'update' } }); await updateNewsUpdate(c, 'update', input); expect(c.rpc).toHaveBeenCalledWith('update_news_update', expect.objectContaining({ p_update_id: 'update', p_headline: ' 제목 ', p_source_ids: ['source'] })); expect(c.rpc).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ p_update_type: expect.anything() })) })
  it('maps reorder IDs to the dedicated RPC', async () => { const c = client({ data: null }); await reorderNewsUpdates(c, 'post', ['b', 'a']); expect(c.rpc).toHaveBeenCalledWith('reorder_news_updates', { p_post_id: 'post', p_update_ids: ['b', 'a'] }) })
  it.each([
    ['CATEGORY_MISMATCH', '카테고리가 일치하지 않습니다'],
    ['PREVIOUS_REQUIRED', '이전 업데이트가 필요합니다'],
    ['CHANGE_REQUIRED', '변경 내용을 입력해 주세요'],
    ['PREVIOUS_TOPIC_MISMATCH', '같은 뉴스 주제'],
    ['CLOSED_TOPIC_REQUIRED', '종료된 뉴스 주제'],
    ['SOURCE_REQUIRED', '하나 이상의 출처'],
    ['SOURCE_INVALID', '출처를 이 뉴스 항목에 연결'],
    ['REORDER_INVALID', '순서를 저장할 수 없습니다'],
    ['NOT_FOUND', '접근 권한이 없습니다'],
  ])('maps %s to a safe Korean message', async (code, message) => { const c = client({ error: { message: code } }); await expect(createNewsUpdate(c, input)).rejects.toThrow(message) })
  it('does not expose an unknown database error', async () => { const c = client({ error: { message: 'constraint_secret_internal' } }); await expect(createNewsUpdate(c, input)).rejects.toThrow('뉴스 항목 저장 중 오류가 발생했습니다.'); await expect(createNewsUpdate(c, input)).rejects.not.toThrow('constraint_secret_internal') })
})
