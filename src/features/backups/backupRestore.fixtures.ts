import { buildBackupBundle } from './buildBackupBundle'
import { calculateBackupChecksum } from './calculateBackupChecksum'
import { backupSnapshotFixture, backupSnapshotWithMappingFixture } from './backups.fixtures'
import type { BackupProfile } from './backup.types'
import type { BackupCategoryManifestEntry, ValidatedBackupBundle } from './backupRestore.types'

export async function backupRestoreBundleFixture(profile: BackupProfile = 'core') {
  const built = await buildBackupBundle(backupSnapshotFixture(profile), { now: new Date('2026-07-15T03:04:05Z'), appVersion: '4B-2-test' })
  return built.bundle as ValidatedBackupBundle
}

export async function backupRestoreBundleWithMappingFixture(profile: BackupProfile = 'core') {
  const built = await buildBackupBundle(backupSnapshotWithMappingFixture(profile), { now: new Date('2026-07-15T03:04:05Z'), appVersion: '5B-test' })
  return built.bundle as ValidatedBackupBundle
}

export function currentCategoriesFromBundle(bundle: ValidatedBackupBundle): BackupCategoryManifestEntry[] {
  return bundle.manifest.categoryManifest.map((category) => ({
    id: category.id, contentGroup: category.contentGroup, name: category.name, code: category.code,
    wrapperClass: category.wrapperClass, displayIdPattern: category.displayIdPattern,
    slugPattern: category.slugPattern, sortOrder: category.sortOrder, enabled: category.enabled,
  }))
}

export async function resignBackup<T extends ValidatedBackupBundle>(bundle: T): Promise<T> {
  const payload = structuredClone(bundle) as Record<string, unknown>
  delete payload.checksum
  return { ...bundle, checksum: { algorithm: 'SHA-256', value: await calculateBackupChecksum(payload) } }
}
