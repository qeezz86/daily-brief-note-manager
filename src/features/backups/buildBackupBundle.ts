import {
  BACKUP_CHECKSUM_ALGORITHM,
  BACKUP_FORMAT,
  BACKUP_HARD_LIMIT_BYTES,
  BACKUP_SCHEMA_VERSION,
  BACKUP_SECTIONS_BY_PROFILE,
  BACKUP_WARNING_BYTES,
} from './backup.constants'
import { backupBundleSchema } from './backup.schema'
import type { BackupBundle, BackupSnapshot, BuiltBackup } from './backup.types'
import { calculateBackupChecksum, verifyBackupChecksum } from './calculateBackupChecksum'
import { canonicalizeBackup } from './canonicalizeBackup'
import { createBackupFileName } from './createBackupFileName'
import { scanBackupForSecrets } from './scanBackupForSecrets'
import { validateBackupRelationships } from './validateBackupRelationships'

export class BackupBuildError extends Error {
  constructor(
    public readonly code: 'relationship' | 'secret' | 'checksum' | 'size' | 'schema',
    message: string,
  ) {
    super(message)
  }
}

export async function buildBackupBundle(
  snapshot: BackupSnapshot,
  options: {
    now?: Date
    appVersion?: string | null
    cryptoApi?: Crypto
  } = {},
): Promise<BuiltBackup> {
  const relationshipValidation = validateBackupRelationships(snapshot)
  if (!relationshipValidation.valid) {
    throw new BackupBuildError('relationship', '백업 데이터 관계 무결성 검사를 통과하지 못했습니다.')
  }
  if (scanBackupForSecrets(snapshot).length) {
    throw new BackupBuildError('secret', '백업 데이터에서 민감정보가 감지되었습니다.')
  }

  const now = options.now ?? new Date()
  const sectionNames = [...BACKUP_SECTIONS_BY_PROFILE[snapshot.profile]]
  const payload = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    profile: snapshot.profile,
    exportedAt: now.toISOString(),
    appVersion: options.appVersion?.trim() || null,
    manifest: {
      profile: snapshot.profile,
      sectionNames,
      sectionCounts: snapshot.sectionCounts,
      totalRecords: snapshot.totalRecords,
      generatedPromptCount: snapshot.sectionCounts.generatedPrompts ?? 0,
      includesOperationalHistory: snapshot.includesOperationalHistory,
      categoryManifestCount: snapshot.categoryManifest.length,
      categoryManifest: snapshot.categoryManifest,
      relationshipCheck: 'passed' as const,
      snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
    },
    data: snapshot.data,
  }
  const canonicalPayload = canonicalizeBackup(payload)
  const checksumValue = await calculateBackupChecksum(payload, options.cryptoApi)
  const candidate = {
    ...payload,
    checksum: { algorithm: BACKUP_CHECKSUM_ALGORITHM, value: checksumValue },
  }
  const parsed = backupBundleSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new BackupBuildError('schema', '생성된 백업 파일이 schema version 1 계약과 일치하지 않습니다.')
  }
  const bundle: BackupBundle = parsed.data
  if (scanBackupForSecrets(bundle).length) {
    throw new BackupBuildError('secret', '최종 백업 파일에서 민감정보가 감지되었습니다.')
  }
  if (!await verifyBackupChecksum(bundle, options.cryptoApi)) {
    throw new BackupBuildError('checksum', '생성 직후 checksum 검증에 실패했습니다.')
  }

  const json = JSON.stringify(bundle, null, 2)
  const byteSize = new TextEncoder().encode(json).byteLength
  if (byteSize > BACKUP_HARD_LIMIT_BYTES) {
    throw new BackupBuildError('size', '백업 파일이 100 MB 제한을 초과했습니다. 향후 분할 백업이 필요합니다.')
  }

  return {
    bundle,
    canonicalPayload,
    json,
    byteSize,
    fileName: createBackupFileName(snapshot.profile, now),
    sizeWarning: byteSize >= BACKUP_WARNING_BYTES,
    relationshipValidation,
  }
}
