import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { saveTaxonomyMapping, taxonomyMappingLocalKey } from './wordpressTaxonomy.repository'

describe('wordpress taxonomy repository', () => {
  it('local key를 NFC/공백/소문자로 정규화한다', () => expect(taxonomyMappingLocalKey('  Daily   BRIEF  ')).toBe('daily brief'))

  it('category mapping을 owner-scoped unique key로 upsert한다', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'mapping-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const db = { from: vi.fn(() => ({ upsert })) } as unknown as DatabaseClient
    await saveTaxonomyMapping(db, { ownerId: 'owner-1', siteOrigin: 'https://wordpress.example.com', mappingKind: 'category', localKey: 'economy', wordpressTermId: 7, wordpressTermSlug: 'economy', wordpressTermName: '경제' })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'owner-1', mapping_kind: 'category', wordpress_taxonomy: 'category', wordpress_term_id: 7 }), { onConflict: 'owner_id,site_origin,mapping_kind,local_key' })
  })

  it('tag mapping은 post_tag taxonomy로 고정한다', async () => {
    const upsert = vi.fn(() => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: {}, error: null }) }) }))
    const db = { from: vi.fn(() => ({ upsert })) } as unknown as DatabaseClient
    await saveTaxonomyMapping(db, { ownerId: 'owner-1', siteOrigin: 'https://wordpress.example.com', mappingKind: 'tag', localKey: 'ai', wordpressTermId: 8, wordpressTermSlug: 'ai', wordpressTermName: 'AI' })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ wordpress_taxonomy: 'post_tag' }), expect.anything())
  })
})
