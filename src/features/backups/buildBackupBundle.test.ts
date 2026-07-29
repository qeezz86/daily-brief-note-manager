import { describe, expect, it } from 'vitest'
import { buildBackupBundle } from './buildBackupBundle'
import { backupSnapshotFixture, backupSnapshotWithMappingFixture } from './backups.fixtures'

describe('buildBackupBundle', () => {
  it('공식 format과 schema version 1 core bundle을 만든다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture(), { now: new Date('2026-07-15T06:30:00Z'), appVersion: '1.2.3' })
    expect(result.bundle).toMatchObject({ format: 'daily-brief-note-backup', schemaVersion: 1, profile: 'core', exportedAt: '2026-07-15T06:30:00.000Z', appVersion: '1.2.3' })
  })
  it.each([5, 10, 15] as const)('requested count %s를 schema v1에서 round trip한다', async (requestedPostCount) => {
    const result = await buildBackupBundle(backupSnapshotFixture('core', requestedPostCount))
    expect(result.bundle.schemaVersion).toBe(1)
    expect(result.bundle.data.generatedPrompts[0]).toMatchObject({
      requestedPostCount,
      actualPostCount: 1,
    })
  })
  it('schema v1에서 기존 image prompt와 ALT 구조를 그대로 보존한다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture())
    expect(result.bundle.schemaVersion).toBe(1)
    expect(result.bundle.data.posts[0]).toMatchObject({
      imagePrompt: '전문 경제 뉴스 이미지',
      imageAlt: '경제 브리핑',
    })
    expect(result.bundle.data.posts[0]).not.toHaveProperty('imageMetadata')
  })
  it('appVersion null을 허용한다', async () => {
    expect((await buildBackupBundle(backupSnapshotFixture(), { appVersion: null })).bundle.appVersion).toBeNull()
  })
  it('manifest에 count, category manifest와 관계 결과를 보존한다', async () => {
    const manifest = (await buildBackupBundle(backupSnapshotFixture())).bundle.manifest
    expect(manifest.categoryManifest).toHaveLength(1)
    expect(manifest.sectionCounts.posts).toBe(1)
    expect(manifest.relationshipCheck).toBe('passed')
  })
  it('full profile에 operational section을 포함한다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture('full'))
    expect(result.bundle.manifest.includesOperationalHistory).toBe(true)
    expect(result.bundle.data.importJobItems).toHaveLength(1)
  })
  it('checksum 구조와 pretty JSON을 만든다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture())
    expect(result.bundle.checksum).toEqual({ algorithm: 'SHA-256', value: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(result.json).toContain('\n  "format"')
  })
  it('UTF-8 byte size를 계산하고 BOM을 넣지 않는다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture())
    expect(result.byteSize).toBe(new TextEncoder().encode(result.json).byteLength)
    expect(result.json.charCodeAt(0)).not.toBe(0xfeff)
  })
  it('동일 생성 결과의 JSON은 재사용 가능하다', async () => {
    const now = new Date('2026-07-15T06:30:00Z')
    const one = await buildBackupBundle(backupSnapshotFixture(), { now })
    const two = await buildBackupBundle(backupSnapshotFixture(), { now })
    expect(one.json).toBe(two.json)
  })
  it('WordPress taxonomy mapping을 credential 없이 core backup에 포함한다', async () => {
    const result = await buildBackupBundle(backupSnapshotWithMappingFixture())
    expect(result.bundle.manifest.sectionNames).toContain('wordpressTaxonomyMappings')
    expect(result.bundle.data.wordpressTaxonomyMappings).toHaveLength(1)
    expect(JSON.stringify(result.bundle.data.wordpressTaxonomyMappings)).not.toMatch(/password|authorization|credential/i)
  })
  it('기존 schema v1 snapshot은 신규 optional section 없이 계속 생성한다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture())
    expect(result.bundle.manifest.sectionNames).not.toContain('wordpressTaxonomyMappings')
    expect(result.bundle.data.wordpressTaxonomyMappings).toBeUndefined()
  })
})
