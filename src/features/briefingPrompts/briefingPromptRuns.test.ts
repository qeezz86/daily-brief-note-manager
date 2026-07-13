import { describe, expect, it } from 'vitest'
import { briefingPromptRunFixture as run } from './briefingPrompts.fixtures'
import { filterPromptRuns, formatPromptRunDateTime, summarizePromptText } from './briefingPromptRuns'

const other = { ...run, id: '77777777-7777-4777-8777-777777777777', categoryId: 'global', promptMode: 'detailed' as const, isPinned: true }
describe('briefing prompt runs', () => {
  it('filters category, mode and pin state', () => {
    expect(filterPromptRuns([run, other], { categoryId: 'global', promptMode: 'detailed', pin: 'pinned' })).toEqual([other])
    expect(filterPromptRuns([run, other], { categoryId: '', promptMode: '', pin: 'unpinned' })).toEqual([run])
  })
  it('formats generated time in Seoul', () => expect(formatPromptRunDateTime('2026-07-13T15:30:00Z')).toContain('07. 14'))
  it('uses the task line as a summary', () => expect(summarizePromptText(run.promptText)).toBe('작업: 경제 뉴스 브리핑 작성'))
})
