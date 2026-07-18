import { PublicationError } from './errors.ts'
import type { TaxonomyCatalog, WordPressCategoryTerm, WordPressTagTerm } from './schemas.ts'
import type { CatalogTaxonomy, PublicationWordPressClient, WordPressReadResponse } from './wordpressClient.ts'

const MAX_PAGES = 20
const MAX_TERMS = 2_000

function integer(value: unknown, allowZero = true): number {
  if (!Number.isSafeInteger(value) || Number(value) < (allowZero ? 0 : 1)) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  return Number(value)
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  return value
}

function parsePage(response: WordPressReadResponse, taxonomy: CatalogTaxonomy): Array<WordPressCategoryTerm | WordPressTagTerm> {
  if (!Array.isArray(response.data)) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  return response.data.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
    const item = raw as Record<string, unknown>
    const common = { id: integer(item.id, false), name: text(item.name), slug: text(item.slug), count: integer(item.count) }
    return taxonomy === 'categories' ? { ...common, parent: integer(item.parent) } : common
  })
}

async function load(client: PublicationWordPressClient, taxonomy: CatalogTaxonomy) {
  const first = await client.getCatalogPage(taxonomy, 1)
  if (!Number.isSafeInteger(first.total) || first.total < 0 || !Number.isSafeInteger(first.totalPages) || first.totalPages < 1 || first.totalPages > MAX_PAGES || first.total > MAX_TERMS) {
    throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  }
  const items = parsePage(first, taxonomy)
  for (let page = 2; page <= first.totalPages; page += 1) {
    const response = await client.getCatalogPage(taxonomy, page)
    if (response.total !== first.total || response.totalPages !== first.totalPages) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
    items.push(...parsePage(response, taxonomy))
  }
  if (items.length !== first.total || items.length > MAX_TERMS) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  const ids = new Set<number>()
  const slugs = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id) || slugs.has(item.slug)) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
    ids.add(item.id); slugs.add(item.slug)
  }
  return { items: items.sort((left, right) => left.id - right.id), pages: first.totalPages }
}

export async function loadTaxonomyCatalog(client: PublicationWordPressClient): Promise<TaxonomyCatalog> {
  const [categories, tags] = await Promise.all([load(client, 'categories'), load(client, 'tags')])
  return { categories: categories.items as WordPressCategoryTerm[], tags: tags.items as WordPressTagTerm[], categoryPages: categories.pages, tagPages: tags.pages }
}
