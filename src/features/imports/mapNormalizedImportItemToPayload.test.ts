import { describe, expect, it } from 'vitest'
import { validNewsPost } from './imports.fixtures'
import { mapNormalizedImportItemToPayload } from './mapNormalizedImportItemToPayload'

describe('mapNormalizedImportItemToPayload', () => {
  it('maps camelCase fields to the explicit RPC payload', () => {
    const payload = mapNormalizedImportItemToPayload(validNewsPost({ publishedAt: '2026-07-12T10:00:00+09:00' }))
    expect(payload.category_id).toBe('economy')
    expect(payload.validation_mode).toBe('strict')
    expect(payload.published_at).toBe('2026-07-12T10:00:00+09:00')
    expect(payload.seo).toMatchObject({ representative_title: '경제 핵심 뉴스 정리' })
    expect(payload.sources[0]).toMatchObject({ source_name: 'Example', sort_order: 0 })
  })

  it('명시적 legacy mode를 execution payload에 보존한다', () => {
    expect(mapNormalizedImportItemToPayload(validNewsPost(), 'legacy').validation_mode).toBe('legacy')
  })

  it('does not include owner, internal IDs, or news tracking', () => {
    const payload = mapNormalizedImportItemToPayload({ ...validNewsPost(), ownerId: 'owner', id: 'post', newsTracking: { updates: [{ id: 'update' }] } })
    const json = JSON.stringify(payload)
    expect(json).not.toContain('owner')
    expect(json).not.toContain('newsTracking')
    expect(json).not.toContain('update')
  })

  it('maps every category metadata shape', () => {
    expect(mapNormalizedImportItemToPayload({ metadata: { fieldName: 'AI', difficulty: 'beginner', estimatedReadMin: 8, referenceDate: '2026-07-01' } }).metadata)
      .toEqual({ field_name: 'AI', difficulty: 'beginner', estimated_read_min: 8, reference_date: '2026-07-01' })
    expect(mapNormalizedImportItemToPayload({ metadata: { learningTopic: '경제', episodeListIncluded: false } }).metadata)
      .toEqual({ learning_topic: '경제', episode_list_included: false })
  })
  it('preserves source order as zero-based sort_order', () => {
    const source = validNewsPost().sources![0]
    const payload = mapNormalizedImportItemToPayload(validNewsPost({ sources: [source, { ...source, sourceUrl: 'https://example.com/two' }] }))
    expect(payload.sources.map((row) => (row as { sort_order: number }).sort_order)).toEqual([0, 1])
  })
  it('preserves explicit false metadata values', () => {
    expect(mapNormalizedImportItemToPayload({ metadata: { episodeListIncluded: false } }).metadata).toEqual({ episode_list_included: false })
  })
  it('normalizes missing optional values to null', () => {
    const payload = mapNormalizedImportItemToPayload({})
    expect(payload).toMatchObject({ briefing_date: null, published_on: null, published_at: null, display_id: null, series_no: null, wordpress_url: null, html_body: null, metadata: null })
  })
  it('keeps only string tags', () => {
    expect(mapNormalizedImportItemToPayload({ tags: ['one', 2, null, 'two'] }).tags).toEqual(['one', 'two'])
  })
  it('does not accept client-provided source sort order', () => {
    const payload = mapNormalizedImportItemToPayload({ sources: [{ sourceName: 'A', sourceTitle: 'A', sourceUrl: 'https://example.com/a', checkedPoint: 'A', sortOrder: 99 }] })
    expect(payload.sources[0]).toMatchObject({ sort_order: 0 })
  })
  it('maps draft empty SEO to an explicit safe object', () => {
    expect(mapNormalizedImportItemToPayload({}).seo).toEqual({ representative_title: '', alternative_titles: [], meta_description: '', focus_keyword: '' })
  })
})
