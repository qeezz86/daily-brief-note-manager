import { describe, expect, it } from 'vitest'
import { reconcile } from './reconciliation'

const stored = { id: 'a', contentId: 'c', wordpressPostId: 1, status: 'draft' as const, slug: 'old', link: 'https://example.com/old' }
const remote = { wordpressPostId: 1, status: 'publish' as const, slug: 'new', link: 'https://example.com/new', modifiedGmt: '2026-08-24T00:00:00', dateGmt: null }
describe('post reconciliation', () => {
  it('reports all safe deltas without inferring modified time', () => expect(reconcile(stored, remote)).toEqual({ primary: 'IN_SYNC', deltas: ['STATUS_CHANGED', 'SLUG_CHANGED', 'LINK_CHANGED'] }))
  it('prioritizes identity mismatch', () => expect(reconcile(stored, { ...remote, wordpressPostId: 2 })).toEqual({ primary: 'REMOTE_IDENTITY_MISMATCH', deltas: [] }))
})
