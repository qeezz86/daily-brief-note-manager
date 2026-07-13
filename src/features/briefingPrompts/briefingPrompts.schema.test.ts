import { describe, expect, it } from 'vitest'
import { parseNewsBriefingPromptContext } from './briefingPrompts.schema'
import { briefingPromptContextFixture as context } from './briefingPrompts.fixtures'

describe('briefing prompt context schema', () => {
  it('accepts schema version one', () => expect(parseNewsBriefingPromptContext(context).schemaVersion).toBe(1))
  it('rejects unknown schema versions', () => expect(() => parseNewsBriefingPromptContext({ ...context, schemaVersion: 2 })).toThrow())
  it('rejects malformed date-only values', () => expect(() => parseNewsBriefingPromptContext({ ...context, referenceDate: '2026-7-13' })).toThrow())
  it('defaults unexpected null arrays to empty arrays', () => { const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: null, openTopics: null, pendingFollowups: null, recentClosedTopics: null }); expect(parsed.counts).toEqual({ recentPosts: 0, recentUpdates: 0, openTopics: 0, pendingFollowups: 0, overdueFollowups: 0, recentClosedTopics: 0 }) })
  it('deduplicates rows and recomputes counts', () => { const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: [context.recentPosts[0], context.recentPosts[0]], counts: { recentPosts: 99, recentUpdates: 99, openTopics: 99, pendingFollowups: 99, overdueFollowups: 99, recentClosedTopics: 99 } }); expect(parsed.counts).toEqual(context.counts) })
  it('sorts post updates by item order', () => { const second = { ...context.recentPosts[0].updates[0], id: '66666666-6666-4666-8666-666666666666', itemOrder: 2 }; const parsed = parseNewsBriefingPromptContext({ ...context, recentPosts: [{ ...context.recentPosts[0], updates: [second, context.recentPosts[0].updates[0]] }] }); expect(parsed.recentPosts[0].updates.map((item) => item.itemOrder)).toEqual([1, 2]) })
})
