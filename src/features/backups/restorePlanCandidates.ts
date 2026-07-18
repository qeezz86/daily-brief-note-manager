import { canonicalizeJson } from '../../shared/json/canonicalizeJson'
import { normalizeSourceUrl } from '../posts/publicationFields'
import type { ExistingRestoreRecord, ValidatedBackupBundle } from './backupRestore.types'
import type { RestoreCandidate, RestoreCandidateMatch } from './restorePlan.types'

function signature(value: unknown) { return canonicalizeJson(value) }
function sourceId(...parts: Array<string | number>) { return parts.join(':') }

export function buildRestoreCandidates(bundle: ValidatedBackupBundle): RestoreCandidate[] {
  const data = bundle.data
  const candidates: RestoreCandidate[] = [
    ...data.posts.map((row) => ({ section: 'posts', sourceId: row.id, entityId: row.id, reference: row.slug || row.title, categoryId: row.categoryId,
      keys: [`slug:${row.slug}`, ...(row.wordpressUrl ? [`wordpressUrl:${row.wordpressUrl}`] : []), ...(row.briefingDate ? [`briefing:${row.categoryId}|${row.briefingDate}`] : []), ...(row.seriesNo !== null ? [`series:${row.categoryId}|${row.seriesNo}`] : [])],
      signature: signature({ categoryId: row.categoryId, title: row.title, slug: row.slug, wordpressUrl: row.wordpressUrl, seriesNo: row.seriesNo, briefingDate: row.briefingDate, publishedOn: row.publishedOn, displayId: row.displayId }), dependencies: [`category:${row.categoryId}`], row })),
    ...data.seoData.map((row) => ({ section: 'seoData', sourceId: row.postId, reference: row.representativeTitle ?? row.postId.slice(0, 8), keys: [row.postId],
      signature: signature({ postId: row.postId, representativeTitle: row.representativeTitle, metaDescription: row.metaDescription, focusKeyword: row.focusKeyword }), dependencies: [`posts:${row.postId}`], row })),
    ...data.tags.map((row) => ({ section: 'tags', sourceId: row.id, entityId: row.id, reference: row.name, keys: [`normalizedName:${row.normalizedName}`],
      signature: signature({ name: row.name, normalizedName: row.normalizedName }), dependencies: [], row })),
    ...data.postTags.map((row) => ({ section: 'postTags', sourceId: sourceId(row.postId, row.tagId), reference: `${row.postId.slice(0, 8)}:${row.tagId.slice(0, 8)}`, keys: [`${row.postId}|${row.tagId}`], signature: '', dependencies: [`posts:${row.postId}`, `tags:${row.tagId}`], row })),
    ...data.sources.map((row) => ({ section: 'sources', sourceId: row.id, entityId: row.id, reference: row.sourceUrl, keys: [],
      signature: signature({ postId: row.postId, newsUpdateId: row.newsUpdateId, sourceUrl: row.sourceUrl, sortOrder: row.sortOrder }), dependencies: [`posts:${row.postId}`, ...(row.newsUpdateId ? [`newsUpdates:${row.newsUpdateId}`] : [])], row })),
    ...data.aiMetadata.map((row) => ({ section: 'aiMetadata', sourceId: row.postId, reference: row.postId.slice(0, 8), keys: [row.postId],
      signature: signature({ postId: row.postId, fieldName: row.fieldName, difficulty: row.difficulty, estimatedReadMin: row.estimatedReadMin }), dependencies: [`posts:${row.postId}`], row })),
    ...data.infoDbMetadata.map((row) => ({ section: 'infoDbMetadata', sourceId: row.postId, reference: row.postId.slice(0, 8), keys: [row.postId],
      signature: signature({ postId: row.postId, fieldName: row.fieldName, difficulty: row.difficulty, estimatedReadMin: row.estimatedReadMin, referenceDate: row.referenceDate }), dependencies: [`posts:${row.postId}`], row })),
    ...data.chineseMetadata.map((row) => ({ section: 'chineseMetadata', sourceId: row.postId, reference: row.originalUrl ?? row.postId.slice(0, 8),
      keys: [row.originalUrl ? `originalUrl:${normalizeSourceUrl(row.originalUrl).toLocaleLowerCase('en-US')}` : row.postId], signature: signature({ postId: row.postId, originalUrl: row.originalUrl, originalTitle: row.originalTitle, learningTopic: row.learningTopic }), dependencies: [`posts:${row.postId}`], row })),
    ...data.seriesCounters.map((row) => ({ section: 'seriesCounters', sourceId: row.categoryId, reference: row.categoryId, categoryId: row.categoryId, keys: [row.categoryId], signature: signature({ categoryId: row.categoryId, lastIssuedNo: row.lastIssuedNo }), dependencies: [`category:${row.categoryId}`], row })),
    ...data.newsTopics.map((row) => ({ section: 'newsTopics', sourceId: row.id, entityId: row.id, reference: row.topicKey, categoryId: row.categoryId, keys: [`topic:${row.categoryId}|${row.topicKey}`],
      signature: signature({ categoryId: row.categoryId, topicKey: row.topicKey, canonicalTitle: row.canonicalTitle, topicSummary: row.topicSummary, status: row.status }), dependencies: [`category:${row.categoryId}`], row })),
    ...data.newsStatusHistory.map((row) => ({ section: 'newsStatusHistory', sourceId: row.id, entityId: row.id, reference: `${row.toStatus}:${row.changedAt}`, keys: [],
      signature: signature({ topicId: row.topicId, toStatus: row.toStatus, changedAt: row.changedAt }), dependencies: [`newsTopics:${row.topicId}`], row })),
    ...data.newsUpdates.map((row) => ({ section: 'newsUpdates', sourceId: row.id, entityId: row.id, reference: row.headline, keys: [],
      signature: signature({ postId: row.postId, topicId: row.topicId, itemOrder: row.itemOrder, updateType: row.updateType, headline: row.headline }), dependencies: [`posts:${row.postId}`, `newsTopics:${row.topicId}`, ...(row.previousUpdateId ? [`newsUpdates:${row.previousUpdateId}`] : [])], row })),
    ...data.newsFollowups.map((row) => ({ section: 'newsFollowups', sourceId: row.id, entityId: row.id, reference: row.checkText, keys: [],
      signature: signature({ topicId: row.topicId, checkText: row.checkText, status: row.status }), dependencies: [`newsTopics:${row.topicId}`], row })),
    ...data.generatedPrompts.map((row) => ({ section: 'generatedPrompts', sourceId: row.id, entityId: row.id, reference: `${row.categoryId}:${row.referenceDate}`, categoryId: row.categoryId, keys: [],
      signature: signature({ categoryId: row.categoryId, requestedPostCount: row.requestedPostCount, actualPostCount: row.actualPostCount, promptMode: row.promptMode, referenceDate: row.referenceDate, closedLookbackDays: row.closedLookbackDays, contextSchemaVersion: row.contextSchemaVersion, contextSnapshot: row.contextSnapshot, promptText: row.promptText, generatedAt: row.generatedAt }), dependencies: [`category:${row.categoryId}`], row })),
    ...(data.wordpressTaxonomyMappings ?? []).map((row) => ({ section: 'wordpressTaxonomyMappings', sourceId: row.id, entityId: row.id, reference: `${row.mappingKind}:${row.localKey}`, keys: [`mapping:${row.siteOrigin}|${row.mappingKind}|${row.localKey}`],
      signature: signature({ siteOrigin: row.siteOrigin, mappingKind: row.mappingKind, localKey: row.localKey, wordpressTaxonomy: row.wordpressTaxonomy, wordpressTermId: row.wordpressTermId, wordpressTermSlug: row.wordpressTermSlug, wordpressTermName: row.wordpressTermName }), dependencies: [], row })),
    ...(data.importJobs ?? []).map((row) => ({ section: 'importJobs', sourceId: row.id, entityId: row.id, reference: row.sourceName ?? row.id.slice(0, 8), keys: [`fingerprint:${row.sourceFingerprint}`], signature: signature({ sourceFingerprint: row.sourceFingerprint, status: row.status }), dependencies: [], row })),
    ...(data.importJobItems ?? []).map((row) => ({ section: 'importJobItems', sourceId: row.id, entityId: row.id, reference: row.externalKey, keys: [], signature: signature({ jobId: row.jobId, itemIndex: row.itemIndex, payloadFingerprint: row.payloadFingerprint }), dependencies: [`importJobs:${row.jobId}`, ...(row.postId ? [`posts:${row.postId}`] : [])], row })),
    ...(data.importJobItemAttempts ?? []).map((row) => ({ section: 'importJobItemAttempts', sourceId: row.id, entityId: row.id, reference: `${row.stage}:${row.attemptNo}`, keys: [], signature: signature({ jobItemId: row.jobItemId, stage: row.stage, attemptNo: row.attemptNo, status: row.status }), dependencies: [`importJobItems:${row.jobItemId}`], row })),
  ]
  return candidates.sort((left, right) => `${left.section}|${left.sourceId}`.localeCompare(`${right.section}|${right.sourceId}`))
}

export function matchRestoreCandidate(candidate: RestoreCandidate, records: ExistingRestoreRecord[]): RestoreCandidateMatch {
  const existing = records.filter((record) => record.section === candidate.section)
  const idMatch = candidate.entityId ? existing.find((record) => record.id === candidate.entityId) : undefined
  const keyMatch = existing.find((record) => record.key && candidate.keys.includes(record.key))
  if (!candidate.entityId && keyMatch) {
    return { candidate, existing: keyMatch, conflictType: candidate.signature && keyMatch.signature === candidate.signature ? 'exact_same' : candidate.section === 'postTags' ? 'relation_conflict' : 'key_conflict' }
  }
  if (idMatch && candidate.signature && idMatch.signature === candidate.signature) return { candidate, existing: idMatch, conflictType: 'exact_same' }
  if (idMatch) return { candidate, existing: idMatch, conflictType: 'id_conflict' }
  if (keyMatch && candidate.signature && keyMatch.signature === candidate.signature) return { candidate, existing: keyMatch, conflictType: 'exact_same' }
  if (keyMatch) return { candidate, existing: keyMatch, conflictType: 'key_conflict' }
  return { candidate, conflictType: 'safe_new' }
}
