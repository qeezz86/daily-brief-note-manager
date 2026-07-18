import { canonicalizeJson } from '../../shared/json/canonicalizeJson'
import { normalizeSourceUrl } from '../posts/publicationFields'
import type {
  BackupConflictLookupResult,
  BackupRestoreConflict,
  RestoreAnalysisSection,
  RestoreIdPolicyCounts,
  ValidatedBackupBundle,
} from './backupRestore.types'

interface Candidate {
  section: string
  id?: string
  keys: string[]
  reference: string
  categoryId?: string
  signature: string
}

function shortId(id: string | undefined) {
  return id ? id.slice(0, 8) : undefined
}

function signature(value: unknown) {
  return canonicalizeJson(value)
}

function candidates(bundle: ValidatedBackupBundle): Candidate[] {
  const data = bundle.data
  const values: Candidate[] = [
    ...data.posts.map((row) => ({
      section: 'posts', id: row.id, categoryId: row.categoryId, reference: row.slug || row.title || shortId(row.id)!,
      keys: [`slug:${row.slug}`, ...(row.wordpressUrl ? [`wordpressUrl:${row.wordpressUrl}`] : []), ...(row.briefingDate ? [`briefing:${row.categoryId}|${row.briefingDate}`] : []), ...(row.seriesNo !== null ? [`series:${row.categoryId}|${row.seriesNo}`] : [])],
      signature: signature({ categoryId: row.categoryId, title: row.title, slug: row.slug, wordpressUrl: row.wordpressUrl, seriesNo: row.seriesNo, briefingDate: row.briefingDate, publishedOn: row.publishedOn, displayId: row.displayId }),
    })),
    ...data.tags.map((row) => ({ section: 'tags', id: row.id, reference: row.name, keys: [`normalizedName:${row.normalizedName}`], signature: signature({ name: row.name, normalizedName: row.normalizedName }) })),
    ...data.seoData.map((row) => ({ section: 'seoData', reference: shortId(row.postId)!, keys: [row.postId], signature: signature({ postId: row.postId, representativeTitle: row.representativeTitle, metaDescription: row.metaDescription, focusKeyword: row.focusKeyword }) })),
    ...data.sources.map((row) => ({ section: 'sources', id: row.id, reference: row.sourceUrl || shortId(row.id)!, keys: [], signature: signature({ postId: row.postId, newsUpdateId: row.newsUpdateId, sourceUrl: row.sourceUrl, sortOrder: row.sortOrder }) })),
    ...data.aiMetadata.map((row) => ({ section: 'aiMetadata', reference: shortId(row.postId)!, keys: [row.postId], signature: signature({ postId: row.postId, fieldName: row.fieldName, difficulty: row.difficulty, estimatedReadMin: row.estimatedReadMin }) })),
    ...data.infoDbMetadata.map((row) => ({ section: 'infoDbMetadata', reference: shortId(row.postId)!, keys: [row.postId], signature: signature({ postId: row.postId, fieldName: row.fieldName, difficulty: row.difficulty, estimatedReadMin: row.estimatedReadMin, referenceDate: row.referenceDate }) })),
    ...data.chineseMetadata.map((row) => ({ section: 'chineseMetadata', reference: row.originalUrl ?? shortId(row.postId)!, keys: [row.originalUrl ? `originalUrl:${normalizeSourceUrl(row.originalUrl).toLocaleLowerCase('en-US')}` : row.postId], signature: signature({ postId: row.postId, originalUrl: row.originalUrl, originalTitle: row.originalTitle, learningTopic: row.learningTopic }) })),
    ...data.seriesCounters.map((row) => ({ section: 'seriesCounters', categoryId: row.categoryId, reference: row.categoryId, keys: [row.categoryId], signature: signature({ categoryId: row.categoryId, lastIssuedNo: row.lastIssuedNo }) })),
    ...data.newsTopics.map((row) => ({ section: 'newsTopics', id: row.id, categoryId: row.categoryId, reference: row.topicKey, keys: [`topic:${row.categoryId}|${row.topicKey}`], signature: signature({ categoryId: row.categoryId, topicKey: row.topicKey, canonicalTitle: row.canonicalTitle, topicSummary: row.topicSummary, status: row.status }) })),
    ...data.newsUpdates.map((row) => ({ section: 'newsUpdates', id: row.id, reference: row.headline || shortId(row.id)!, keys: [], signature: signature({ postId: row.postId, topicId: row.topicId, itemOrder: row.itemOrder, updateType: row.updateType, headline: row.headline }) })),
    ...data.newsStatusHistory.map((row) => ({ section: 'newsStatusHistory', id: row.id, reference: `${shortId(row.topicId)}:${row.toStatus}`, keys: [], signature: signature({ topicId: row.topicId, toStatus: row.toStatus, changedAt: row.changedAt }) })),
    ...data.newsFollowups.map((row) => ({ section: 'newsFollowups', id: row.id, reference: row.checkText || shortId(row.id)!, keys: [], signature: signature({ topicId: row.topicId, checkText: row.checkText, status: row.status }) })),
    ...data.generatedPrompts.map((row) => ({ section: 'generatedPrompts', id: row.id, categoryId: row.categoryId, reference: `${row.categoryId}:${row.referenceDate}`, keys: [], signature: signature({ categoryId: row.categoryId, requestedPostCount: row.requestedPostCount, actualPostCount: row.actualPostCount, promptMode: row.promptMode, referenceDate: row.referenceDate, closedLookbackDays: row.closedLookbackDays, contextSchemaVersion: row.contextSchemaVersion, contextSnapshot: row.contextSnapshot, promptText: row.promptText, generatedAt: row.generatedAt }) })),
    ...(data.wordpressTaxonomyMappings ?? []).map((row) => ({ section: 'wordpressTaxonomyMappings', id: row.id, reference: `${row.mappingKind}:${row.localKey}`, keys: [`mapping:${row.siteOrigin}|${row.mappingKind}|${row.localKey}`], signature: signature({ siteOrigin: row.siteOrigin, mappingKind: row.mappingKind, localKey: row.localKey, wordpressTaxonomy: row.wordpressTaxonomy, wordpressTermId: row.wordpressTermId, wordpressTermSlug: row.wordpressTermSlug, wordpressTermName: row.wordpressTermName }) })),
    ...data.postTags.map((row) => ({ section: 'postTags', reference: `${shortId(row.postId)}:${shortId(row.tagId)}`, keys: [`${row.postId}|${row.tagId}`], signature: '' })),
    ...(data.importJobs ?? []).map((row) => ({ section: 'importJobs', id: row.id, reference: row.sourceName || shortId(row.id)!, keys: [`fingerprint:${row.sourceFingerprint}`], signature: signature({ sourceFingerprint: row.sourceFingerprint, status: row.status }) })),
    ...(data.importJobItems ?? []).map((row) => ({ section: 'importJobItems', id: row.id, reference: row.externalKey || shortId(row.id)!, keys: [], signature: signature({ jobId: row.jobId, itemIndex: row.itemIndex, payloadFingerprint: row.payloadFingerprint }) })),
    ...(data.importJobItemAttempts ?? []).map((row) => ({ section: 'importJobItemAttempts', id: row.id, reference: `${shortId(row.jobItemId)}:${row.attemptNo}`, keys: [], signature: signature({ jobItemId: row.jobItemId, stage: row.stage, attemptNo: row.attemptNo, status: row.status }) })),
  ]
  return values.sort((left, right) => `${left.section}|${left.reference}|${left.id ?? ''}`.localeCompare(`${right.section}|${right.reference}|${right.id ?? ''}`))
}

export function analyzeBackupConflicts(bundle: ValidatedBackupBundle, lookup: BackupConflictLookupResult) {
  const bySection = new Map<string, typeof lookup.records>()
  lookup.records.forEach((record) => bySection.set(record.section, [...(bySection.get(record.section) ?? []), record]))
  const conflicts: BackupRestoreConflict[] = []
  const idPolicyCandidates: RestoreIdPolicyCounts = { preserve: 0, remapRequired: 0, reuseCandidate: 0, conflict: 0 }
  const sections: Record<string, RestoreAnalysisSection> = {}

  candidates(bundle).forEach((candidate) => {
    const existing = bySection.get(candidate.section) ?? []
    const idMatch = candidate.id ? existing.find((row) => row.id === candidate.id) : undefined
    const keyMatch = existing.find((row) => row.key && candidate.keys.includes(row.key))
    let type: BackupRestoreConflict['type'] = 'safe_new'
    if (!candidate.id && keyMatch) type = 'relation_conflict'
    else if (idMatch && candidate.signature && idMatch.signature === candidate.signature) type = 'exact_same'
    else if (idMatch) type = 'id_conflict'
    else if (keyMatch && candidate.signature && keyMatch.signature === candidate.signature) type = 'exact_same'
    else if (keyMatch) type = 'key_conflict'

    const policy = type === 'safe_new' ? 'preserve' : type === 'exact_same' ? 'reuse_candidate' : type === 'id_conflict' ? 'remap_required' : 'conflict'
    if (policy === 'preserve') idPolicyCandidates.preserve += 1
    else if (policy === 'reuse_candidate') idPolicyCandidates.reuseCandidate += 1
    else if (policy === 'remap_required') idPolicyCandidates.remapRequired += 1
    else idPolicyCandidates.conflict += 1
    const section = sections[candidate.section] ?? { total: 0, candidates: [] }
    section.total += 1
    section.candidates.push({ reference: candidate.reference, policy, conflictType: type })
    sections[candidate.section] = section
    conflicts.push({ section: candidate.section, type, reference: candidate.reference, recordId: shortId(candidate.id), key: keyMatch?.key, categoryId: candidate.categoryId, message: type === 'safe_new' ? '현재 DB에 같은 ID와 key가 없습니다.' : type === 'exact_same' ? '같은 의미의 기존 데이터 후보입니다.' : type === 'id_conflict' ? '같은 UUID가 다른 데이터에 사용되어 remap이 필요합니다.' : type === 'key_conflict' ? '고유 key가 기존 데이터와 충돌해 정책 선택이 필요합니다.' : '관계가 이미 존재해 재사용 또는 건너뛰기 검토가 필요합니다.' })
  })
  return { conflicts, idPolicyCandidates, sections }
}
