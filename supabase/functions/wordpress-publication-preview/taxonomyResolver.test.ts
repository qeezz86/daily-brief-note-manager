import { describe, expect, it } from 'vitest'
import type { SourceContent, TaxonomyCatalog, TaxonomyMapping } from './schemas'
import { resolveTaxonomies } from './taxonomyResolver'

const content: SourceContent = { id: crypto.randomUUID(), categoryId: 'economy', categoryName: '경제', contentGroup: 'news', wrapperClass: 'daily-brief-note news-briefing economy', slugPattern: 'economy-briefing-YYYY-MM-DD', seriesNo: null, briefingDate: '2026-07-18', publishedOn: null, contentStatus: 'ready', updatedAt: '2026-07-18T00:00:00Z', representativeTitle: '제목', metaDescription: '설명', htmlBody: '<div></div>', slug: 'economy-briefing-2026-07-18', tags: [{ id: crypto.randomUUID(), name: '인공지능', normalizedName: '인공지능' }] }
const catalog: TaxonomyCatalog = { categories: [{ id: 1, name: '경제', slug: 'economy', parent: 0, count: 1 }], tags: [{ id: 2, name: '인공지능', slug: 'ai', count: 1 }], categoryPages: 1, tagPages: 1 }
const mapping = (kind: 'category' | 'tag', overrides: Partial<TaxonomyMapping> = {}): TaxonomyMapping => ({ id: crypto.randomUUID(), siteOrigin: 'https://example.com', mappingKind: kind, localKey: kind === 'category' ? 'economy' : '인공지능', wordpressTaxonomy: kind === 'category' ? 'category' : 'post_tag', wordpressTermId: kind === 'category' ? 1 : 2, wordpressTermSlug: kind === 'category' ? 'economy' : 'ai', wordpressTermName: kind === 'category' ? '경제' : '인공지능', verifiedAt: null, ...overrides })

describe('taxonomy resolver', () => {
  it('explicit category mapping을 우선한다', () => expect(resolveTaxonomies(content, catalog, [mapping('category')]).categoryIds).toEqual([1]))
  it('저장 term ID가 없으면 stale이다', () => expect(resolveTaxonomies(content, catalog, [mapping('category', { wordpressTermId: 99 })]).categories.stale).toHaveLength(1))
  it('저장 slug가 바뀌면 stale이다', () => expect(resolveTaxonomies(content, catalog, [mapping('category', { wordpressTermSlug: 'old' })]).categories.stale).toHaveLength(1))
  it('explicit mapping이 없으면 exact category slug를 사용한다', () => expect(resolveTaxonomies(content, catalog, []).categoryIds).toEqual([1]))
  it('name만 일치하는 category는 자동 확정하지 않는다', () => expect(resolveTaxonomies({ ...content, categoryId: 'local-economy' }, catalog, []).categories.missing[0].candidates).toHaveLength(1))
  it('exact tag name을 해석한다', () => expect(resolveTaxonomies(content, catalog, []).tagIds).toEqual([2]))
  it('exact tag slug를 해석한다', () => expect(resolveTaxonomies({ ...content, tags: [{ ...content.tags[0], name: 'ai' }] }, catalog, []).tagIds).toEqual([2]))
  it('name과 slug가 다른 term이면 ambiguous이다', () => { const result = resolveTaxonomies({ ...content, tags: [{ ...content.tags[0], name: 'ai' }] }, { ...catalog, tags: [{ id: 2, name: 'AI', slug: 'other', count: 0 }, { id: 3, name: '다른', slug: 'ai', count: 0 }] }, []); expect(result.tags.ambiguous).toHaveLength(1) })
  it('없는 tag를 missing으로 분류한다', () => expect(resolveTaxonomies(content, { ...catalog, tags: [] }, []).tags.missing).toHaveLength(1))
  it('explicit tag mapping stale을 찾는다', () => expect(resolveTaxonomies(content, catalog, [mapping('tag', { wordpressTermSlug: 'old' })]).tags.stale).toHaveLength(1))
  it('변경된 term name은 warning이다', () => expect(resolveTaxonomies(content, { ...catalog, tags: [{ ...catalog.tags[0], name: 'AI 변경' }] }, [mapping('tag')]).warnings[0].code).toBe('TAG_NAME_CHANGED'))
})
