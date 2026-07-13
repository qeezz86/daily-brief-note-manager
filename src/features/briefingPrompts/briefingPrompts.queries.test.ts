import { describe, expect, it } from 'vitest'
import { briefingPromptQueryKeys } from './briefingPrompts.queries'

const settings = { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard' as const, closedLookbackDays: 90 }
describe('briefing prompt query keys', () => {
  it('isolates cache by user', () => expect(briefingPromptQueryKeys.context('owner-a', settings)).not.toEqual(briefingPromptQueryKeys.context('owner-b', settings)))
  it('includes all settings', () => expect(briefingPromptQueryKeys.context('owner', settings)).toEqual(['briefing-prompts', 'context', 'owner', 'economy', '2026-07-13', 'standard', 90]))
  it('isolates history and detail caches by user', () => {
    expect(briefingPromptQueryKeys.history('owner-a')).not.toEqual(briefingPromptQueryKeys.history('owner-b'))
    expect(briefingPromptQueryKeys.detail('owner-a', 'run')).not.toEqual(briefingPromptQueryKeys.detail('owner-b', 'run'))
  })
})
