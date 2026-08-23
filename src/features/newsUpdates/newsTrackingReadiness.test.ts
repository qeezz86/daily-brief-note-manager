import { describe, expect, it } from 'vitest'

import { deriveNewsTrackingReadiness } from './newsTrackingReadiness'

describe('deriveNewsTrackingReadiness', () => {
  it('classifies non-news content as NOT_APPLICABLE', () => {
    expect(deriveNewsTrackingReadiness('ai', 0)).toBe('NOT_APPLICABLE')
  })

  it('classifies news content with no linked updates as NOT_RECORDED', () => {
    expect(deriveNewsTrackingReadiness('news', 0)).toBe('NOT_RECORDED')
  })

  it('classifies news content with one linked update as RECORDED', () => {
    expect(deriveNewsTrackingReadiness('news', 1)).toBe('RECORDED')
  })

  it('classifies news content with multiple linked updates as RECORDED', () => {
    expect(deriveNewsTrackingReadiness('news', 3)).toBe('RECORDED')
  })

  it('is deterministic and derives state without a persistence callback', () => {
    const first = deriveNewsTrackingReadiness('news', 2)
    const second = deriveNewsTrackingReadiness('news', 2)

    expect(first).toBe('RECORDED')
    expect(second).toBe(first)
    expect(deriveNewsTrackingReadiness.length).toBe(2)
  })
})
