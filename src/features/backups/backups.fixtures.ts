import { BACKUP_SECTIONS_BY_PROFILE } from './backup.constants'
import type { BackupProfile, BackupSnapshot } from './backup.types'

const ids = {
  post: '10000000-0000-4000-8000-000000000001',
  tag: '20000000-0000-4000-8000-000000000001',
  source: '30000000-0000-4000-8000-000000000001',
  topic: '40000000-0000-4000-8000-000000000001',
  update: '50000000-0000-4000-8000-000000000001',
  history: '60000000-0000-4000-8000-000000000001',
  followup: '70000000-0000-4000-8000-000000000001',
  prompt: '80000000-0000-4000-8000-000000000001',
  job: '90000000-0000-4000-8000-000000000001',
  item: 'a0000000-0000-4000-8000-000000000001',
  attempt: 'b0000000-0000-4000-8000-000000000001',
}

export function backupSnapshotFixture(profile: BackupProfile = 'core'): BackupSnapshot {
  const data: BackupSnapshot['data'] = {
    posts: [{
      id: ids.post, categoryId: 'economy', seriesNo: null, briefingDate: '2026-07-15',
      publishedOn: '2026-07-15', displayId: '#2026-07-15-ECO', title: '게시물', summary: '요약',
      htmlBody: '<div class="daily-brief-note news-briefing economy"><h1>게시물</h1></div>',
      slug: 'economy-briefing-2026-07-15', wordpressUrl: 'https://example.com/economy-briefing-2026-07-15',
      contentStatus: 'published', publishedAt: '2026-07-15T00:00:00Z', sourceImportType: 'manual_entry',
      imagePrompt: '전문 경제 뉴스 이미지', imageAlt: '경제 브리핑', imagePromptVersion: 1,
      imagePromptUpdatedAt: '2026-07-15T00:00:00Z', createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z',
    }],
    seoData: [{ postId: ids.post, representativeTitle: '대표 제목', alternativeTitles: ['대안 1', '대안 2', '대안 3', '대안 4'], metaDescription: '메타 설명', focusKeyword: '경제', createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' }],
    tags: [{ id: ids.tag, normalizedName: '태그', name: '태그', createdAt: '2026-07-15T00:00:00Z' }],
    postTags: [{ postId: ids.post, tagId: ids.tag }],
    sources: [{ id: ids.source, postId: ids.post, newsUpdateId: ids.update, sourceName: '기관', sourceTitle: '원문', sourceUrl: 'https://example.org/article', sourcePublishedAt: '2026-07-14T00:00:00Z', checkedAt: '2026-07-15T00:00:00Z', checkedPoint: '핵심 사실', sortOrder: 0, createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' }],
    aiMetadata: [],
    infoDbMetadata: [],
    chineseMetadata: [],
    seriesCounters: [{ categoryId: 'economy', lastIssuedNo: 0, updatedAt: '2026-07-15T00:00:00Z' }],
    newsTopics: [{ id: ids.topic, categoryId: 'economy', topicKey: 'topic-key', canonicalTitle: '경제 주제', topicSummary: '주제 요약', status: 'active', closedReason: null, firstSeenAt: '2026-07-15', lastSeenAt: '2026-07-15', createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' }],
    newsStatusHistory: [{ id: ids.history, topicId: ids.topic, fromStatus: null, toStatus: 'active', reason: null, changedAt: '2026-07-15T00:00:00Z' }],
    newsUpdates: [{ id: ids.update, postId: ids.post, topicId: ids.topic, previousUpdateId: null, itemOrder: 1, updateType: 'new', headline: '새 소식', factSummary: '사실 요약', importanceSummary: '중요성', impactSummary: '영향', changeSummary: null, createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' }],
    newsFollowups: [{ id: ids.followup, topicId: ids.topic, checkText: '후속 확인', status: 'pending', dueDate: null, priority: 'normal', resolutionNote: null, resolvedAt: null, createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z' }],
    generatedPrompts: [{ id: ids.prompt, categoryId: 'economy', requestedPostCount: 5, actualPostCount: 1, promptMode: 'standard', referenceDate: '2026-07-15', closedLookbackDays: 90, contextSchemaVersion: 1, contextSnapshot: { schemaVersion: 1 }, promptText: '안전한 프롬프트', isPinned: false, generatedAt: '2026-07-15T00:00:00Z' }],
  }
  if (profile === 'full') {
    data.importJobs = [{ id: ids.job, format: 'daily-brief-note-content-import', schemaVersion: 1, sourceName: 'import.json', sourceFingerprint: 'a'.repeat(64), status: 'completed', expectedItemCount: 1, totalCount: 1, readyCount: 1, warningCount: 0, invalidCount: 0, duplicateCount: 0, acknowledgedWarningCount: 0, dryRunSummary: {}, startedAt: '2026-07-15T00:00:00Z', completedAt: '2026-07-15T00:01:00Z', cancelledAt: null, createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:01:00Z' }]
    data.importJobItems = [{ id: ids.item, jobId: ids.job, postId: ids.post, itemIndex: 0, externalKey: 'item-1', payloadFingerprint: 'b'.repeat(64), title: '게시물', categoryId: 'economy', validationStatus: 'valid', normalizedPayload: { content: { title: '게시물' } }, warningAcknowledged: false, contentStatus: 'imported', trackingStatus: 'imported', contentAttemptCount: 1, trackingAttemptCount: 1, contentErrorCode: null, contentErrorMessage: null, contentRetryable: false, trackingErrorCode: null, trackingErrorMessage: null, trackingRetryable: false, topicCount: 1, reusedTopicCount: 0, createdTopicCount: 1, updateCount: 1, followupCount: 1, sourceLinkCount: 1, contentStartedAt: '2026-07-15T00:00:00Z', contentCompletedAt: '2026-07-15T00:00:30Z', trackingStartedAt: '2026-07-15T00:00:30Z', trackingCompletedAt: '2026-07-15T00:01:00Z', createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:01:00Z' }]
    data.importJobItemAttempts = [{ id: ids.attempt, jobItemId: ids.item, stage: 'content', attemptNo: 1, status: 'succeeded', safeErrorCode: null, safeErrorMessage: null, retryable: false, startedAt: '2026-07-15T00:00:00Z', completedAt: '2026-07-15T00:00:30Z' }]
  }
  const sectionCounts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows?.length ?? 0]))
  return {
    profile,
    snapshotSchemaVersion: 1,
    categoryManifest: [{
      id: 'economy', contentGroup: 'news', name: '경제', code: 'ECO',
      wrapperClass: 'daily-brief-note news-briefing economy',
      displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD',
      sortOrder: 10, enabled: true,
    }],
    sectionCounts,
    totalRecords: BACKUP_SECTIONS_BY_PROFILE[profile].reduce((sum, key) => sum + (sectionCounts[key] ?? 0), 0),
    includesOperationalHistory: profile === 'full',
    relationshipCheck: 'passed',
    data,
  }
}
