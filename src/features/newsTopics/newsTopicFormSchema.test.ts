import { describe, expect, it } from 'vitest'
import { createNewsTopicSchema, editNewsTopicSchema } from './newsTopicFormSchema'

const valid = { categoryId: 'economy', topicKey: 'rate-outlook', canonicalTitle: '금리 전망', topicSummary: '', initialStatus: 'active' as const, firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-02' }

describe('news topic form schemas', () => {
  it('accepts a valid active topic', () => expect(createNewsTopicSchema.safeParse(valid).success).toBe(true))
  it('accepts monitoring as an initial status', () => expect(createNewsTopicSchema.safeParse({ ...valid, initialStatus: 'monitoring' }).success).toBe(true))
  it('requires a news category selection', () => expect(createNewsTopicSchema.safeParse({ ...valid, categoryId: '' }).success).toBe(false))
  it('requires a canonical title', () => expect(createNewsTopicSchema.safeParse({ ...valid, canonicalTitle: ' ' }).success).toBe(false))
  it('requires a stable lowercase topic key', () => expect(createNewsTopicSchema.safeParse({ ...valid, topicKey: 'Rate Outlook' }).success).toBe(false))
  it('rejects last seen before first seen', () => expect(createNewsTopicSchema.safeParse({ ...valid, lastSeenAt: '2026-06-30' }).success).toBe(false))
  it('rejects an invalid edit date order', () => expect(editNewsTopicSchema.safeParse({ canonicalTitle: 'Title', topicSummary: '', firstSeenAt: '2026-07-02', lastSeenAt: '2026-07-01' }).success).toBe(false))
})
