import { describe, expect, it } from 'vitest'
import { validImportBundle, validNewsPost, validNewsTracking, emptyImportReferenceData } from './imports.fixtures'
import { validateImportBundle } from './validateImportBundle'
import { defaultImportSelection, importItemClientKey, isImportItemAllowed } from './importSelection'

describe('import selection policy', () => {
  it('selects ready items by default and leaves warnings unselected', () => {
    const result = validateImportBundle(validImportBundle([validNewsPost(), validNewsPost({ externalKey: 'warning', title: '경고 경제 뉴스', slug: 'economy-briefing-2026-07-13', briefingDate: '2026-07-13', publishedOn: '2026-07-13', displayId: '#2026-07-13-ECO', wordpressUrl: 'https://example.org/economy-2026-07-13', newsTracking: validNewsTracking('warning-topic'), seo: { ...validNewsPost().seo!, metaDescription: 'short' } })]), emptyImportReferenceData)
    const selection = defaultImportSelection(result.items)
    expect(selection.has(importItemClientKey(result.items[0]))).toBe(true)
    expect(selection.has(importItemClientKey(result.items[1]))).toBe(false)
  })
  it('allows warning only after explicit approval and never allows invalid', () => {
    const warning = validateImportBundle(validImportBundle([validNewsPost({ seo: { ...validNewsPost().seo!, metaDescription: 'short' } })]), emptyImportReferenceData).items[0]
    const key = importItemClientKey(warning)
    expect(isImportItemAllowed(warning, new Set())).toBe(false)
    expect(isImportItemAllowed(warning, new Set([key]))).toBe(true)
    expect(isImportItemAllowed({ ...warning, status: 'invalid' }, new Set([key]))).toBe(false)
  })
  it('uses externalKey as the preferred stable identity', () => {
    const item = validateImportBundle(validImportBundle(), emptyImportReferenceData).items[0]
    expect(importItemClientKey(item)).toBe('external:economy-2026-07-12')
  })
  it('builds a content identity when externalKey is absent', () => {
    const item = validateImportBundle(validImportBundle([validNewsPost({ externalKey: undefined })]), emptyImportReferenceData).items[0]
    expect(importItemClientKey(item)).toMatch(/^content:economy\|economy-briefing-2026-07-12\|fnv1a-/)
  })
  it('never selects warning, invalid, or duplicate by default', () => {
    const base = validateImportBundle(validImportBundle(), emptyImportReferenceData).items[0]
    const selection = defaultImportSelection([{ ...base, status: 'warning' }, { ...base, externalKey: 'invalid', status: 'invalid' }, { ...base, externalKey: 'duplicate', status: 'duplicate' }])
    expect(selection.size).toBe(0)
  })
  it('allows ready without any approval state', () => {
    const item = validateImportBundle(validImportBundle(), emptyImportReferenceData).items[0]
    expect(isImportItemAllowed(item, new Set())).toBe(true)
  })
})
