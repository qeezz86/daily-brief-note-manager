import { BACKUP_SECTIONS_BY_PROFILE } from './backup.constants'
import type {
  BackupSnapshot,
  BackupValidationIssue,
  BackupValidationResult,
} from './backup.types'

function duplicateIds(
  section: string,
  rows: Array<{ id?: string }>,
  issues: BackupValidationIssue[],
) {
  const seen = new Set<string>()
  rows.forEach((row) => {
    if (!row.id) return
    if (seen.has(row.id)) {
      issues.push({ code: 'DUPLICATE_ID', section, message: `${section}에 중복 ID가 있습니다.` })
    }
    seen.add(row.id)
  })
}

function missing(
  condition: boolean,
  code: string,
  section: string,
  message: string,
  issues: BackupValidationIssue[],
) {
  if (condition) issues.push({ code, section, message })
}

export function validateBackupRelationships(
  snapshot: BackupSnapshot,
): BackupValidationResult {
  const issues: BackupValidationIssue[] = []
  const data = snapshot.data
  const expectedSections = BACKUP_SECTIONS_BY_PROFILE[snapshot.profile]
  const actualSections = Object.keys(data)

  missing(
    actualSections.length !== expectedSections.length
      || expectedSections.some((section) => !actualSections.includes(section)),
    'SECTION_SET_MISMATCH',
    'manifest',
    '프로필의 section 구성이 일치하지 않습니다.',
    issues,
  )

  const postIds = new Set(data.posts.map((row) => row.id))
  const tagIds = new Set(data.tags.map((row) => row.id))
  const topicIds = new Set(data.newsTopics.map((row) => row.id))
  const updateIds = new Set(data.newsUpdates.map((row) => row.id))
  const updateTopics = new Map(data.newsUpdates.map((row) => [row.id, row.topicId]))
  const categoryIds = new Set(snapshot.categoryManifest.map((row) => row.id))
  const jobIds = new Set((data.importJobs ?? []).map((row) => row.id))
  const jobItemIds = new Set((data.importJobItems ?? []).map((row) => row.id))

  ;([
    ['posts', data.posts],
    ['tags', data.tags],
    ['sources', data.sources],
    ['newsTopics', data.newsTopics],
    ['newsStatusHistory', data.newsStatusHistory],
    ['newsUpdates', data.newsUpdates],
    ['newsFollowups', data.newsFollowups],
    ['generatedPrompts', data.generatedPrompts],
    ['importJobs', data.importJobs ?? []],
    ['importJobItems', data.importJobItems ?? []],
    ['importJobItemAttempts', data.importJobItemAttempts ?? []],
  ] as const).forEach(([section, rows]) => duplicateIds(section, rows, issues))

  data.postTags.forEach((row) => {
    missing(!postIds.has(row.postId), 'POST_TAG_POST_MISSING', 'postTags', '태그 관계의 게시물이 없습니다.', issues)
    missing(!tagIds.has(row.tagId), 'POST_TAG_TAG_MISSING', 'postTags', '태그 관계의 태그가 없습니다.', issues)
  })
  data.sources.forEach((row) => {
    missing(!postIds.has(row.postId), 'SOURCE_POST_MISSING', 'sources', '출처의 게시물이 없습니다.', issues)
    missing(row.newsUpdateId !== null && !updateIds.has(row.newsUpdateId), 'SOURCE_UPDATE_MISSING', 'sources', '출처의 뉴스 업데이트가 없습니다.', issues)
  })
  ;[...data.seoData, ...data.aiMetadata, ...data.infoDbMetadata, ...data.chineseMetadata].forEach((row) => {
    missing(!postIds.has(row.postId), 'METADATA_POST_MISSING', 'metadata', '메타데이터의 게시물이 없습니다.', issues)
  })
  data.newsStatusHistory.forEach((row) => {
    missing(!topicIds.has(row.topicId), 'HISTORY_TOPIC_MISSING', 'newsStatusHistory', '상태 이력의 주제가 없습니다.', issues)
  })
  data.newsUpdates.forEach((row) => {
    missing(!topicIds.has(row.topicId), 'UPDATE_TOPIC_MISSING', 'newsUpdates', '뉴스 업데이트의 주제가 없습니다.', issues)
    missing(!postIds.has(row.postId), 'UPDATE_POST_MISSING', 'newsUpdates', '뉴스 업데이트의 게시물이 없습니다.', issues)
    missing(row.previousUpdateId !== null && !updateIds.has(row.previousUpdateId), 'UPDATE_PREVIOUS_MISSING', 'newsUpdates', '이전 뉴스 업데이트가 없습니다.', issues)
    missing(row.previousUpdateId !== null && updateTopics.get(row.previousUpdateId) !== row.topicId, 'UPDATE_PREVIOUS_TOPIC_MISMATCH', 'newsUpdates', '이전 업데이트의 주제가 다릅니다.', issues)
  })
  data.newsFollowups.forEach((row) => {
    missing(!topicIds.has(row.topicId), 'FOLLOWUP_TOPIC_MISSING', 'newsFollowups', '후속 항목의 주제가 없습니다.', issues)
  })
  data.generatedPrompts.forEach((row) => {
    missing(!categoryIds.has(row.categoryId), 'PROMPT_CATEGORY_MISSING', 'generatedPrompts', '프롬프트의 카테고리가 manifest에 없습니다.', issues)
  })
  ;(data.importJobItems ?? []).forEach((row) => {
    missing(!jobIds.has(row.jobId), 'IMPORT_ITEM_JOB_MISSING', 'importJobItems', 'Import 항목의 작업이 없습니다.', issues)
  })
  ;(data.importJobItemAttempts ?? []).forEach((row) => {
    missing(!jobItemIds.has(row.jobItemId), 'IMPORT_ATTEMPT_ITEM_MISSING', 'importJobItemAttempts', 'Import 시도의 항목이 없습니다.', issues)
  })

  for (const section of expectedSections) {
    const rows = data[section as keyof typeof data]
    const actual = Array.isArray(rows) ? rows.length : -1
    missing(snapshot.sectionCounts[section] !== actual, 'SECTION_COUNT_MISMATCH', section, `${section} 개수가 manifest와 다릅니다.`, issues)
  }
  const actualTotal = expectedSections.reduce((sum, section) => sum + (snapshot.sectionCounts[section] ?? 0), 0)
  missing(snapshot.totalRecords !== actualTotal, 'TOTAL_COUNT_MISMATCH', 'manifest', '전체 record 개수가 일치하지 않습니다.', issues)
  missing(snapshot.relationshipCheck !== 'passed', 'DATABASE_RELATIONSHIP_CHECK_FAILED', 'manifest', 'DB snapshot 관계 검사를 통과하지 못했습니다.', issues)

  return { valid: issues.length === 0, issues }
}
