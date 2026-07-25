import { describe, expect, it } from 'vitest'
import { canPrepareWordPressDraft } from './WordPressDraftCreationPanel.logic'

const ready = {
  planReady: true,
  stale: false,
  attemptsLoaded: true,
  guarded: false,
  pending: false,
  submitted: false,
}

describe('WordPress draft creation UI guard', () => {
  it('requires a successfully loaded attempt history', () => {
    expect(canPrepareWordPressDraft({ ...ready, attemptsLoaded: false })).toBe(false)
  })

  it('blocks a second submit for the same Dry Run', () => {
    expect(canPrepareWordPressDraft({ ...ready, submitted: true })).toBe(false)
  })

  it('allows preparation only when every guard is clear', () => {
    expect(canPrepareWordPressDraft(ready)).toBe(true)
    expect(canPrepareWordPressDraft({ ...ready, guarded: true })).toBe(false)
    expect(canPrepareWordPressDraft({ ...ready, stale: true })).toBe(false)
  })
})
