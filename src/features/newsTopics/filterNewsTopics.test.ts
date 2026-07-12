import { describe, expect, it } from 'vitest'
import { filterNewsTopics } from './filterNewsTopics'
import type { NewsTopic } from './newsTopics.types'

const topics: NewsTopic[] = [
  { id: '1', category_id: 'economy', topic_key: 'rate-outlook', canonical_title: '기준금리 전망', topic_summary: null, status: 'active', closed_reason: null, first_seen_at: '2026-07-01', last_seen_at: '2026-07-02', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' },
  { id: '2', category_id: 'global', topic_key: 'trade-policy', canonical_title: '글로벌 무역 정책', topic_summary: null, status: 'closed', closed_reason: '종료', first_seen_at: '2026-07-01', last_seen_at: '2026-07-01', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
]
describe('filterNewsTopics', () => {
  it('filters by category', () => expect(filterNewsTopics(topics, { categoryId: 'global', status: '', search: '' })).toHaveLength(1))
  it('filters by status', () => expect(filterNewsTopics(topics, { categoryId: '', status: 'closed', search: '' })[0].id).toBe('2'))
  it('searches canonical titles', () => expect(filterNewsTopics(topics, { categoryId: '', status: '', search: '기준금리' })[0].id).toBe('1'))
  it('searches topic keys case-insensitively', () => expect(filterNewsTopics(topics, { categoryId: '', status: '', search: 'TRADE-POLICY' })[0].id).toBe('2'))
  it('combines filters', () => expect(filterNewsTopics(topics, { categoryId: 'economy', status: 'closed', search: '' })).toHaveLength(0))
})
