import { describe, expect, it, vi } from 'vitest'
import { PublicationError } from './errors'
import { loadTaxonomyCatalog } from './taxonomyCatalog'
import type { PublicationWordPressClient } from './wordpressClient'

function client(overrides: Partial<PublicationWordPressClient> = {}): PublicationWordPressClient {
  return {
    getCatalogPage: vi.fn(async (taxonomy, page) => ({
      data: taxonomy === 'categories'
        ? [{ id: page, name: `Category ${page}`, slug: `category-${page}`, parent: 0, count: 1 }]
        : [{ id: page + 10, name: `Tag ${page}`, slug: `tag-${page}`, count: 2 }],
      total: 1, totalPages: 1,
    })),
    getStatuses: vi.fn(), findPostsBySlug: vi.fn(), ...overrides,
  }
}

describe('taxonomy catalog', () => {
  it('category와 tag 한 페이지를 읽는다', async () => expect(await loadTaxonomyCatalog(client())).toMatchObject({ categoryPages: 1, tagPages: 1, categories: [{ id: 1 }], tags: [{ id: 11 }] }))
  it('모든 페이지를 순차 병합하고 ID로 정렬한다', async () => {
    const mock = client({ getCatalogPage: vi.fn(async (taxonomy, page) => ({ data: taxonomy === 'categories' ? [{ id: 3 - page, name: `C${page}`, slug: `c${page}`, parent: 0, count: 0 }] : [{ id: 13 - page, name: `T${page}`, slug: `t${page}`, count: 0 }], total: 2, totalPages: 2 })) })
    const result = await loadTaxonomyCatalog(mock)
    expect(result.categories.map((item) => item.id)).toEqual([1, 2]); expect(mock.getCatalogPage).toHaveBeenCalledTimes(4)
  })
  it('malformed pagination을 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async () => ({ data: [], total: 0, totalPages: 0 })) }))).rejects.toBeInstanceOf(PublicationError))
  it('20 page 상한 초과를 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async () => ({ data: [], total: 21, totalPages: 21 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
  it('2,000 term 상한 초과를 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async () => ({ data: [], total: 2001, totalPages: 1 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
  it('duplicate ID를 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async (taxonomy) => ({ data: taxonomy === 'categories' ? [{ id: 1, name: 'A', slug: 'a', parent: 0, count: 0 }, { id: 1, name: 'B', slug: 'b', parent: 0, count: 0 }] : [], total: taxonomy === 'categories' ? 2 : 0, totalPages: 1 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
  it('duplicate slug를 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async (taxonomy) => ({ data: taxonomy === 'tags' ? [{ id: 1, name: 'A', slug: 'same', count: 0 }, { id: 2, name: 'B', slug: 'same', count: 0 }] : [], total: taxonomy === 'tags' ? 2 : 0, totalPages: 1 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
  it('invalid integer term을 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async (taxonomy) => ({ data: taxonomy === 'categories' ? [{ id: 0, name: 'A', slug: 'a', parent: 0, count: 0 }] : [], total: taxonomy === 'categories' ? 1 : 0, totalPages: 1 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
  it('빈 slug를 차단한다', async () => await expect(loadTaxonomyCatalog(client({ getCatalogPage: vi.fn(async (taxonomy) => ({ data: taxonomy === 'tags' ? [{ id: 1, name: 'A', slug: ' ', count: 0 }] : [], total: taxonomy === 'tags' ? 1 : 0, totalPages: 1 })) }))).rejects.toMatchObject({ code: 'WORDPRESS_CATALOG_INCOMPLETE' }))
})
