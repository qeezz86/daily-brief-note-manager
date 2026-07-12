import { describe, expect, it } from 'vitest'
import { newsFollowupFormSchema } from './newsFollowupFormSchema'

describe('newsFollowupFormSchema', () => {
  it('accepts a valid form', () => expect(newsFollowupFormSchema.safeParse({ checkText: '공식 발표 확인', priority: 'high', dueDate: '2026-07-20' }).success).toBe(true))
  it('allows a nullable UI due date', () => expect(newsFollowupFormSchema.safeParse({ checkText: '확인', priority: 'normal', dueDate: '' }).success).toBe(true))
  it('requires check text', () => expect(newsFollowupFormSchema.safeParse({ checkText: '  ', priority: 'normal', dueDate: '' }).success).toBe(false))
  it('rejects unknown priority and malformed dates', () => { expect(newsFollowupFormSchema.safeParse({ checkText: '확인', priority: 'urgent', dueDate: '' }).success).toBe(false); expect(newsFollowupFormSchema.safeParse({ checkText: '확인', priority: 'low', dueDate: '07/12/2026' }).success).toBe(false) })
})

