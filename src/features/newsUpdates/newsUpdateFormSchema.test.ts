import { describe, expect, it } from 'vitest'
import { newsUpdateFormSchema } from './newsUpdateFormSchema'
const base = { topicId: 'topic', updateType: 'new' as const, headline: '제목', factSummary: '확인된 사실', importanceSummary: '', impactSummary: '', changeSummary: '', previousUpdateId: '', sourceIds: ['source'] }
describe('newsUpdateFormSchema', () => {
  it('accepts a sourced new update without a previous update', () => { expect(newsUpdateFormSchema.safeParse(base).success).toBe(true) })
  it.each(['follow_up', 'correction', 'closure_note'] as const)('requires previous and change for %s', (updateType) => { const result = newsUpdateFormSchema.safeParse({ ...base, updateType }); expect(result.success).toBe(false); if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['previousUpdateId', 'changeSummary'])) })
  it('rejects a previous update for new', () => { expect(newsUpdateFormSchema.safeParse({ ...base, previousUpdateId: 'old' }).success).toBe(false) })
  it('requires at least one source', () => { expect(newsUpdateFormSchema.safeParse({ ...base, sourceIds: [] }).success).toBe(false) })
  it('trims and limits headline and fact summary', () => { expect(newsUpdateFormSchema.safeParse({ ...base, headline: ' ', factSummary: ' ' }).success).toBe(false); expect(newsUpdateFormSchema.safeParse({ ...base, headline: 'x'.repeat(201) }).success).toBe(false) })
  it('rejects an empty topic', () => { expect(newsUpdateFormSchema.safeParse({ ...base, topicId: '' }).success).toBe(false) })
  it('accepts optional importance and impact summaries', () => { expect(newsUpdateFormSchema.safeParse({ ...base, importanceSummary: '중요', impactSummary: '영향' }).success).toBe(true) })
  it('accepts a valid follow-up link', () => { expect(newsUpdateFormSchema.safeParse({ ...base, updateType: 'follow_up', previousUpdateId: 'old', changeSummary: '새 수치' }).success).toBe(true) })
  it('accepts a valid correction link', () => { expect(newsUpdateFormSchema.safeParse({ ...base, updateType: 'correction', previousUpdateId: 'old', changeSummary: '오류 수정' }).success).toBe(true) })
  it('accepts a structurally valid closure note', () => { expect(newsUpdateFormSchema.safeParse({ ...base, updateType: 'closure_note', previousUpdateId: 'old', changeSummary: '추적 종료' }).success).toBe(true) })
  it('allows multiple distinct sources', () => { expect(newsUpdateFormSchema.safeParse({ ...base, sourceIds: ['one', 'two'] }).success).toBe(true) })
  it('rejects an overlong fact summary', () => { expect(newsUpdateFormSchema.safeParse({ ...base, factSummary: 'x'.repeat(4001) }).success).toBe(false) })
  it('returns the source error next to sourceIds', () => { const result = newsUpdateFormSchema.safeParse({ ...base, sourceIds: [] }); if (result.success) throw new Error('expected failure'); expect(result.error.issues[0].path).toEqual(['sourceIds']) })
  it('returns the headline error next to headline', () => { const result = newsUpdateFormSchema.safeParse({ ...base, headline: '' }); if (result.success) throw new Error('expected failure'); expect(result.error.issues[0].path).toEqual(['headline']) })
})
