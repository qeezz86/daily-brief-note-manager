import { describe, expect, it } from 'vitest'
import { getSeoulDate, isNewsFollowupOverdue } from './newsFollowupDates'

describe('news followup dates', () => {
  it('uses the Asia/Seoul calendar date', () => expect(getSeoulDate(new Date('2026-07-11T15:30:00Z'))).toBe('2026-07-12'))
  it('marks a past pending due date overdue', () => expect(isNewsFollowupOverdue({ status: 'pending', due_date: '2026-07-11' }, '2026-07-12')).toBe(true))
  it('does not mark today overdue', () => expect(isNewsFollowupOverdue({ status: 'pending', due_date: '2026-07-12' }, '2026-07-12')).toBe(false))
  it.each(['done', 'cancelled'])('does not mark %s overdue', (status) => expect(isNewsFollowupOverdue({ status, due_date: '2026-07-01' }, '2026-07-12')).toBe(false))
})

