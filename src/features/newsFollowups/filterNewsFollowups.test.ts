import { describe, expect, it } from 'vitest'
import { filterNewsFollowups, sortNewsFollowups } from './filterNewsFollowups'
import type { NewsFollowup, NewsFollowupFilters } from './newsFollowups.types'

const topic = { id: 't1', canonical_title: '금리 전망', status: 'active', category_id: 'economy', category: { id: 'economy', name: '경제', content_group: 'news' } }
function item(id: string, status: string, priority: string, due_date: string | null, check_text = id, categoryId = 'economy'): NewsFollowup { return { id, topic_id: topic.id, check_text, status, due_date, priority, resolution_note: null, resolved_at: null, created_at: '2026-07-01T00:00:00Z', updated_at: `2026-07-0${id.length}T00:00:00Z`, topic: { ...topic, category_id: categoryId, category: { ...topic.category, id: categoryId } } } }
const items = [item('done', 'done', 'high', '2026-07-01'), item('low', 'pending', 'low', null), item('overdue', 'pending', 'normal', '2026-07-01', '한국은행 발표 확인'), item('high', 'pending', 'high', '2026-07-20'), item('cancel', 'cancelled', 'high', '2026-07-01')]
const empty: NewsFollowupFilters = { categoryId: '', status: '', priority: '', overdueOnly: false, dueFrom: '', dueTo: '', search: '' }

describe('filterNewsFollowups', () => {
  it('sorts pending and overdue first', () => expect(sortNewsFollowups(items, '2026-07-12').map((x) => x.id)).toEqual(['overdue', 'high', 'low', 'done', 'cancel']))
  it('filters status', () => expect(filterNewsFollowups(items, { ...empty, status: 'done' }, '2026-07-12').map((x) => x.id)).toEqual(['done']))
  it('filters priority', () => expect(filterNewsFollowups(items, { ...empty, priority: 'low' }, '2026-07-12').map((x) => x.id)).toEqual(['low']))
  it('filters overdue only', () => expect(filterNewsFollowups(items, { ...empty, overdueOnly: true }, '2026-07-12').map((x) => x.id)).toEqual(['overdue']))
  it('searches topic title and check text', () => { expect(filterNewsFollowups(items, { ...empty, search: '금리' }).length).toBe(5); expect(filterNewsFollowups(items, { ...empty, search: '한국은행' }).map((x) => x.id)).toEqual(['overdue']) })
  it('filters due date range', () => expect(filterNewsFollowups(items, { ...empty, dueFrom: '2026-07-10', dueTo: '2026-07-31' }).map((x) => x.id)).toEqual(['high']))
  it('filters category', () => expect(filterNewsFollowups([items[0], item('global', 'pending', 'normal', null, '국제', 'global')], { ...empty, categoryId: 'global' }).map((x) => x.id)).toEqual(['global']))
})

