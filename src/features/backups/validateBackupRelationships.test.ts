import { describe, expect, it } from 'vitest'
import { backupSnapshotFixture } from './backups.fixtures'
import { validateBackupRelationships } from './validateBackupRelationships'

function changed(change: (snapshot: ReturnType<typeof backupSnapshotFixture>) => void, profile: 'core' | 'full' = 'core') {
  const snapshot = structuredClone(backupSnapshotFixture(profile))
  change(snapshot)
  return validateBackupRelationships(snapshot)
}

describe('validateBackupRelationships', () => {
  it('유효한 관계를 통과시킨다', () => expect(validateBackupRelationships(backupSnapshotFixture()).valid).toBe(true))
  it('post-tag missing post를 찾는다', () => expect(changed((s) => { s.data.postTags[0].postId = crypto.randomUUID() }).issues[0].code).toBe('POST_TAG_POST_MISSING'))
  it('post-tag missing tag를 찾는다', () => expect(changed((s) => { s.data.postTags[0].tagId = crypto.randomUUID() }).issues[0].code).toBe('POST_TAG_TAG_MISSING'))
  it('source missing post를 찾는다', () => expect(changed((s) => { s.data.sources[0].postId = crypto.randomUUID() }).issues[0].code).toBe('SOURCE_POST_MISSING'))
  it('source missing update를 찾는다', () => expect(changed((s) => { s.data.sources[0].newsUpdateId = crypto.randomUUID() }).issues[0].code).toBe('SOURCE_UPDATE_MISSING'))
  it('update missing topic을 찾는다', () => expect(changed((s) => { s.data.newsUpdates[0].topicId = crypto.randomUUID() }).issues.some((i) => i.code === 'UPDATE_TOPIC_MISSING')).toBe(true))
  it('update missing previous를 찾는다', () => expect(changed((s) => { s.data.newsUpdates[0].previousUpdateId = crypto.randomUUID() }).issues.some((i) => i.code === 'UPDATE_PREVIOUS_MISSING')).toBe(true))
  it('followup missing topic을 찾는다', () => expect(changed((s) => { s.data.newsFollowups[0].topicId = crypto.randomUUID() }).issues[0].code).toBe('FOLLOWUP_TOPIC_MISSING'))
  it('import item missing job을 찾는다', () => expect(changed((s) => { s.data.importJobItems![0].jobId = crypto.randomUUID() }, 'full').issues[0].code).toBe('IMPORT_ITEM_JOB_MISSING'))
  it('attempt missing item을 찾는다', () => expect(changed((s) => { s.data.importJobItemAttempts![0].jobItemId = crypto.randomUUID() }, 'full').issues[0].code).toBe('IMPORT_ATTEMPT_ITEM_MISSING'))
  it('동일 primary ID 중복을 찾는다', () => expect(changed((s) => { s.data.posts.push({ ...s.data.posts[0] }) }).issues.some((i) => i.code === 'DUPLICATE_ID')).toBe(true))
  it('manifest section count 불일치를 찾는다', () => expect(changed((s) => { s.sectionCounts.posts = 2 }).issues.some((i) => i.code === 'SECTION_COUNT_MISMATCH')).toBe(true))
  it('nullable false 값을 관계 오류로 취급하지 않는다', () => expect(validateBackupRelationships(backupSnapshotFixture()).valid).toBe(true))
})
