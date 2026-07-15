import { describe, expect, it } from 'vitest'
import { buildBackupBundle } from './buildBackupBundle'
import { backupSnapshotFixture } from './backups.fixtures'

describe('buildBackupBundle', () => {
  it('공식 format과 schema version 1 core bundle을 만든다', async () => {
    const result = await buildBackupBundle(backupSnapshotFixture(), { now: new Date('2026-07-15T06:30:00Z'), appVersion: '1.2.3' })
    expect(result.bundle).toMatchObject({ format: 'daily-brief-note-backup', schemaVersion: 1, profile: 'core', exportedAt: '2026-07-15T06:30:00.000Z', appVersion: '1.2.3' })
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
})
