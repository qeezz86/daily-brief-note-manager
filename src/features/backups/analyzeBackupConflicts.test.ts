import { describe, expect, it, vi } from 'vitest'
import { analyzeBackupConflicts } from './analyzeBackupConflicts'
import { backupRestoreBundleFixture } from './backupRestore.fixtures'
import type { BackupConflictLookupResult } from './backupRestore.types'

const lookup = (records: BackupConflictLookupResult['records'], databaseCheck: BackupConflictLookupResult['databaseCheck'] = 'complete'): BackupConflictLookupResult => ({ databaseCheck, records })

describe('analyzeBackupConflicts', () => {
  it('DB row가 없으면 preserve 후보를 만든다', async () => expect(analyzeBackupConflicts(await backupRestoreBundleFixture(), lookup([])).idPolicyCandidates.preserve).toBeGreaterThan(0))
  it('같은 post signature를 reuse 후보로 둔다', async () => {
    const bundle = await backupRestoreBundleFixture(); const row = bundle.data.posts[0]
    const signature = JSON.stringify({ briefingDate: row.briefingDate, categoryId: row.categoryId, displayId: row.displayId, publishedOn: row.publishedOn, seriesNo: row.seriesNo, slug: row.slug, title: row.title, wordpressUrl: row.wordpressUrl })
    expect(analyzeBackupConflicts(bundle, lookup([{ section: 'posts', id: row.id, key: `slug:${row.slug}`, signature }])).conflicts.some((item) => item.type === 'exact_same')).toBe(true)
  })
  it('같은 ID의 다른 row는 remap_required다', async () => {
    const bundle = await backupRestoreBundleFixture(); const id = bundle.data.posts[0].id
    expect(analyzeBackupConflicts(bundle, lookup([{ section: 'posts', id, signature: '{"different":true}' }])).idPolicyCandidates.remapRequired).toBe(1)
  })
  it('같은 slug의 다른 row는 key conflict다', async () => {
    const bundle = await backupRestoreBundleFixture(); const row = bundle.data.posts[0]
    expect(analyzeBackupConflicts(bundle, lookup([{ section: 'posts', id: crypto.randomUUID(), key: `slug:${row.slug}`, signature: '{}' }])).conflicts.some((item) => item.type === 'key_conflict')).toBe(true)
  })
  it('기존 post-tag는 relation conflict다', async () => {
    const bundle = await backupRestoreBundleFixture(); const row = bundle.data.postTags[0]
    expect(analyzeBackupConflicts(bundle, lookup([{ section: 'postTags', key: `${row.postId}|${row.tagId}`, signature: '' }])).conflicts.some((item) => item.type === 'relation_conflict')).toBe(true)
  })
  it('같은 중국어 original URL은 relation conflict다', async () => {
    const bundle = await backupRestoreBundleFixture(); bundle.data.chineseMetadata = [{ postId: bundle.data.posts[0].id, learningTopic: '학습', programName: 'CCTV', originalTitle: '원문', originalUrl: 'https://example.cn/item', originalPublishedAt: null, episodeListIncluded: false, verifiedCoreFact: null, difficulty: null, learningPoints: null }]
    const result = analyzeBackupConflicts(bundle, lookup([{ section: 'chineseMetadata', key: 'originalUrl:https://example.cn/item', signature: '{}' }]))
    expect(result.conflicts.some((item) => item.section === 'chineseMetadata' && item.type === 'relation_conflict')).toBe(true)
  })
  it('원 UUID는 UI reference에서 8자로 축약한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const result = analyzeBackupConflicts(bundle, lookup([]))
    expect(result.conflicts.find((item) => item.section === 'postTags')?.reference).not.toContain(bundle.data.postTags[0].postId)
  })
  it('새 UUID를 생성하지 않고 원 ID를 그대로 분석한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const spy = vi.spyOn(crypto, 'randomUUID')
    analyzeBackupConflicts(bundle, lookup([])); expect(spy).not.toHaveBeenCalled(); spy.mockRestore()
  })
  it('같은 입력은 결정적으로 같은 결과를 만든다', async () => {
    const bundle = await backupRestoreBundleFixture(); const first = analyzeBackupConflicts(bundle, lookup([])); const second = analyzeBackupConflicts(bundle, lookup([]))
    expect(second).toEqual(first)
  })
})
