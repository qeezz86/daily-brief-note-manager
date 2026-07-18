import { buildPayload } from './payloadBuilder.ts'
import { checkDuplicateSlug } from './duplicateCheck.ts'
import type { CallerDatabase, PlanIssue, TaxonomyCatalog } from './schemas.ts'
import { resolveTaxonomies } from './taxonomyResolver.ts'
import type { PublicationWordPressClient } from './wordpressClient.ts'

function sorted(issues: PlanIssue[]) {
  return [...issues].sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message))
}

export async function preparePublicationPlan(input: {
  database: CallerDatabase
  wordpress: PublicationWordPressClient
  catalog: TaxonomyCatalog
  siteOrigin: string
  contentId: string
  now?: () => Date
}) {
  const content = await input.database.loadContent(input.contentId, input.siteOrigin)
  if (!content) return null
  const mappings = await input.database.loadMappings(input.siteOrigin)
  const resolution = resolveTaxonomies(content, input.catalog, mappings)
  const built = await buildPayload(content, resolution.categoryIds, resolution.tagIds)
  const duplicate = await checkDuplicateSlug(input.wordpress, content.slug)
  const blockers: PlanIssue[] = [...built.blockers]
  if (resolution.categories.missing.length) blockers.push({ code: 'CATEGORY_MAPPING_MISSING', message: 'WordPress 카테고리 매핑이 없습니다.' })
  if (resolution.categories.stale.length) blockers.push({ code: 'CATEGORY_MAPPING_STALE', message: '저장된 WordPress 카테고리 매핑이 현재 catalog와 다릅니다.' })
  if (resolution.categories.ambiguous.length) blockers.push({ code: 'CATEGORY_MAPPING_AMBIGUOUS', message: 'WordPress 카테고리 후보를 하나로 확정할 수 없습니다.' })
  if (resolution.tags.missing.length) blockers.push({ code: 'TAG_MAPPING_MISSING', message: '일부 WordPress 태그 매핑이 없습니다.' })
  if (resolution.tags.stale.length) blockers.push({ code: 'TAG_MAPPING_STALE', message: '저장된 WordPress 태그 매핑이 현재 catalog와 다릅니다.' })
  if (resolution.tags.ambiguous.length) blockers.push({ code: 'TAG_MAPPING_AMBIGUOUS', message: '일부 WordPress 태그 후보를 하나로 확정할 수 없습니다.' })
  if (duplicate.inconsistent) blockers.push({ code: 'WORDPRESS_DUPLICATE_INCONSISTENT', message: '동일 slug의 WordPress 글이 여러 건 발견되었습니다.' })
  else if (duplicate.conflict) blockers.push({ code: 'WORDPRESS_DUPLICATE_SLUG', message: '동일 slug의 WordPress 글이 이미 있습니다.' })
  const latestUpdatedAt = await input.database.readContentUpdatedAt(content.id)
  if (latestUpdatedAt !== content.updatedAt) blockers.push({ code: 'CONTENT_UPDATED_DURING_PREVIEW', message: 'Dry Run 도중 콘텐츠가 변경되었습니다.' })
  const finalBlockers = sorted(blockers)
  const warnings = sorted([...built.warnings, ...resolution.warnings])
  return {
    schemaVersion: 1 as const, ok: true as const, mode: 'dry-run' as const, writePerformed: false as const,
    checkedAt: (input.now ?? (() => new Date()))().toISOString(),
    source: { contentId: content.id, contentType: content.contentGroup, categoryId: content.categoryId, updatedAt: content.updatedAt, seriesId: content.seriesNo },
    site: { origin: input.siteOrigin },
    taxonomy: { categories: resolution.categories, tags: resolution.tags },
    duplicate: { conflict: duplicate.conflict, matches: duplicate.matches },
    payload: built.payload, payloadFingerprint: built.payloadFingerprint, payloadSize: built.size,
    readyForDraftCreation: finalBlockers.length === 0, blockers: finalBlockers, warnings,
  }
}
