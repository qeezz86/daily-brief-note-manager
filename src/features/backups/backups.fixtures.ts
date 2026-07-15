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
    posts: [{ id: ids.post, categoryId: 'economy', createdAt: '2026-07-15T00:00:00Z', title: '게시물', summary: '요약' }],
    seoData: [{ postId: ids.post, representativeTitle: '대표 제목' }],
    tags: [{ id: ids.tag, normalizedName: '태그', name: '태그' }],
    postTags: [{ postId: ids.post, tagId: ids.tag }],
    sources: [{ id: ids.source, postId: ids.post, newsUpdateId: ids.update, sortOrder: 0 }],
    aiMetadata: [],
    infoDbMetadata: [],
    chineseMetadata: [{ postId: ids.post, episodeListIncluded: false }],
    seriesCounters: [{ categoryId: 'economy', lastIssuedNo: 0 }],
    newsTopics: [{ id: ids.topic, categoryId: 'economy', topicKey: 'topic-key' }],
    newsStatusHistory: [{ id: ids.history, topicId: ids.topic, changedAt: '2026-07-15T00:00:00Z' }],
    newsUpdates: [{ id: ids.update, postId: ids.post, topicId: ids.topic, previousUpdateId: null, itemOrder: 1 }],
    newsFollowups: [{ id: ids.followup, topicId: ids.topic, createdAt: '2026-07-15T00:00:00Z' }],
    generatedPrompts: [{ id: ids.prompt, categoryId: 'economy', contextSnapshot: { schemaVersion: 1 }, generatedAt: '2026-07-15T00:00:00Z' }],
  }
  if (profile === 'full') {
    data.importJobs = [{ id: ids.job, createdAt: '2026-07-15T00:00:00Z' }]
    data.importJobItems = [{ id: ids.item, jobId: ids.job, postId: ids.post, itemIndex: 0, normalizedPayload: { content: { title: '게시물' } } }]
    data.importJobItemAttempts = [{ id: ids.attempt, jobItemId: ids.item, attemptNo: 1 }]
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
