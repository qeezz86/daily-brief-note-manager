import { comparisonKey, taxonomyLocalKey, uniqueSortedIntegers } from './normalization.ts'
import type { PlanIssue, SourceContent, TaxonomyCatalog, TaxonomyMapping } from './schemas.ts'

interface ResolutionItem { localKey: string; localName: string; termId?: number; termSlug?: string; termName?: string; candidates?: Array<{ id: number; slug: string; name: string }> }
interface ResolutionGroup { resolved: ResolutionItem[]; missing: ResolutionItem[]; ambiguous: ResolutionItem[]; stale: ResolutionItem[] }

function empty(): ResolutionGroup { return { resolved: [], missing: [], ambiguous: [], stale: [] } }
function sort(group: ResolutionGroup) {
  for (const values of [group.resolved, group.missing, group.ambiguous, group.stale]) {
    values.sort((left, right) => left.localKey.localeCompare(right.localKey))
  }
}

export function resolveTaxonomies(content: SourceContent, catalog: TaxonomyCatalog, mappings: TaxonomyMapping[]) {
  const categories = empty()
  const tags = empty()
  const warnings: PlanIssue[] = []
  const categoryKey = content.categoryId
  const explicitCategory = mappings.find((mapping) => mapping.mappingKind === 'category' && mapping.localKey === categoryKey)
  if (explicitCategory) {
    const term = catalog.categories.find((item) => item.id === explicitCategory.wordpressTermId)
    const base = { localKey: categoryKey, localName: content.categoryName, termId: explicitCategory.wordpressTermId, termSlug: explicitCategory.wordpressTermSlug, termName: explicitCategory.wordpressTermName }
    if (!term || term.slug !== explicitCategory.wordpressTermSlug) categories.stale.push(base)
    else {
      categories.resolved.push({ ...base, termName: term.name })
      if (term.name !== explicitCategory.wordpressTermName) warnings.push({ code: 'CATEGORY_NAME_CHANGED', message: '저장된 WordPress 카테고리 이름이 변경되었습니다.' })
    }
  } else {
    const slugMatches = catalog.categories.filter((item) => item.slug === categoryKey)
    if (slugMatches.length === 1) categories.resolved.push({ localKey: categoryKey, localName: content.categoryName, termId: slugMatches[0].id, termSlug: slugMatches[0].slug, termName: slugMatches[0].name })
    else if (slugMatches.length > 1) categories.ambiguous.push({ localKey: categoryKey, localName: content.categoryName, candidates: slugMatches })
    else {
      const nameCandidates = catalog.categories.filter((item) => comparisonKey(item.name) === comparisonKey(content.categoryName))
      categories.missing.push({ localKey: categoryKey, localName: content.categoryName, candidates: nameCandidates })
    }
  }

  for (const localTag of content.tags) {
    const localKey = taxonomyLocalKey(localTag.name)
    const explicit = mappings.find((mapping) => mapping.mappingKind === 'tag' && mapping.localKey === localKey)
    if (explicit) {
      const term = catalog.tags.find((item) => item.id === explicit.wordpressTermId)
      const base = { localKey, localName: localTag.name, termId: explicit.wordpressTermId, termSlug: explicit.wordpressTermSlug, termName: explicit.wordpressTermName }
      if (!term || term.slug !== explicit.wordpressTermSlug) tags.stale.push(base)
      else {
        tags.resolved.push({ ...base, termName: term.name })
        if (term.name !== explicit.wordpressTermName) warnings.push({ code: 'TAG_NAME_CHANGED', message: `WordPress 태그 이름이 변경되었습니다: ${localTag.name}` })
      }
      continue
    }
    const nameMatches = catalog.tags.filter((item) => comparisonKey(item.name) === comparisonKey(localTag.name))
    const slugMatches = catalog.tags.filter((item) => item.slug === localTag.name.normalize('NFC').trim())
    const candidates = [...new Map([...nameMatches, ...slugMatches].map((item) => [item.id, item])).values()]
    if (candidates.length === 1) tags.resolved.push({ localKey, localName: localTag.name, termId: candidates[0].id, termSlug: candidates[0].slug, termName: candidates[0].name })
    else if (candidates.length > 1) tags.ambiguous.push({ localKey, localName: localTag.name, candidates })
    else tags.missing.push({ localKey, localName: localTag.name })
  }
  sort(categories); sort(tags)
  return {
    categories, tags, warnings,
    categoryIds: uniqueSortedIntegers(categories.resolved.flatMap((item) => item.termId ? [item.termId] : [])),
    tagIds: uniqueSortedIntegers(tags.resolved.flatMap((item) => item.termId ? [item.termId] : [])),
  }
}
