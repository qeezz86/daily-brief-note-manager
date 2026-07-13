import { describe, expect, it } from 'vitest'
import { parseBriefingPromptRun, parseNewsBriefingPromptContext, validateSaveBriefingPromptRunInput } from './briefingPrompts.schema'
import { briefingPromptContextFixture as context, briefingPromptRunFixture as run, briefingPromptRunRow } from './briefingPrompts.fixtures'
import { buildNewsBriefingPrompt } from './buildBriefingPrompt'
import { validateBriefingPrompt } from './validateBriefingPrompt'
import { summarizeBriefingPromptValidation } from './briefingPromptValidation.types'

describe('briefing prompt context schema', () => {
  it('accepts schema version one', () => expect(parseNewsBriefingPromptContext(context).schemaVersion).toBe(1))
  it('rejects unknown schema versions', () => expect(() => parseNewsBriefingPromptContext({ ...context, schemaVersion: 2 })).toThrow())
  it('rejects malformed date-only values', () => expect(() => parseNewsBriefingPromptContext({ ...context, referenceDate: '2026-7-13' })).toThrow())
  it('defaults unexpected null arrays without hiding original counts', () => { const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: null, openTopics: null, pendingFollowups: null, recentClosedTopics: null }); expect(parsed.recentPosts).toEqual([]); expect(parsed.counts).toEqual(context.counts) })
  it('preserves duplicate rows and invalid counts for deterministic validation', () => { const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: [context.recentPosts[0], context.recentPosts[0]], counts: { recentPosts: 99, recentUpdates: 99, openTopics: 99, pendingFollowups: 99, overdueFollowups: 99, recentClosedTopics: 99 } }); expect(parsed.recentPosts).toHaveLength(2); expect(parsed.counts.recentPosts).toBe(99) })
  it('sorts post updates by item order', () => { const second = { ...context.recentPosts[0].updates[0], id: '66666666-6666-4666-8666-666666666666', itemOrder: 2 }; const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: [{ ...context.recentPosts[0], updates: [second, context.recentPosts[0].updates[0]] }] }); expect(parsed.recentPosts[0].updates.map((item) => item.itemOrder)).toEqual([1, 2]) })
})

describe('saved briefing prompt schema', () => {
  it('parses a saved immutable snapshot', () => expect(parseBriefingPromptRun(briefingPromptRunRow())).toEqual(run))
  it('safely parses a legacy run without a prompt template version', () => {
    const legacyContext = { ...context }
    delete legacyContext.promptTemplateVersion
    const parsed = parseBriefingPromptRun({ ...briefingPromptRunRow(), context_snapshot: legacyContext })
    expect(parsed.promptTemplateVersion).toBeNull()
    expect(parsed.contextSnapshot).not.toHaveProperty('promptTemplateVersion')
  })
  it('rejects a row and snapshot category mismatch', () => expect(() => parseBriefingPromptRun({ ...briefingPromptRunRow(), category_id: 'global' })).toThrow('snapshot 설정'))
  it('keeps prompt bytes while validating save input', () => {
    const settings = { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard' as const, closedLookbackDays: 90 }
    const promptText = buildNewsBriefingPrompt(context, 'standard')
    const result = validateBriefingPrompt({ promptText, context, mode: 'standard', settings, promptTemplateVersion: 1 })
    const validContext = { ...context, promptValidationVersion: 1 as const, promptValidationSummary: summarizeBriefingPromptValidation(result) ?? undefined }
    expect(validateSaveBriefingPromptRunInput({ settings, context: validContext, promptText }).promptText).toBe(promptText)
  })
  it('rejects stale save settings', () => expect(() => validateSaveBriefingPromptRunInput({ settings: { categoryId: 'global', referenceDate: '2026-07-13', mode: 'standard', closedLookbackDays: 90 }, context, promptText: 'x' })).toThrow('일치하지 않습니다'))
  it('rejects saving a new snapshot without the current prompt template version', () => {
    const legacyContext = { ...context }
    delete legacyContext.promptTemplateVersion
    expect(() => validateSaveBriefingPromptRunInput({ settings: { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard', closedLookbackDays: 90 }, context: legacyContext, promptText: 'x' })).toThrow('일치하지 않습니다')
  })
})
