import type { DatabaseClient } from '../../shared/supabase/client'
import { backupEstimateSchema, backupSnapshotSchema } from './backup.schema'
import type { BackupEstimate, BackupProfile, BackupSnapshot } from './backup.types'

export class BackupRepositoryError extends Error {
  constructor(message = '백업 데이터를 불러오지 못했습니다.') {
    super(message)
  }
}

export async function getBackupEstimate(
  client: DatabaseClient,
  profile: BackupProfile,
): Promise<BackupEstimate> {
  const { data, error } = await client.rpc('get_user_backup_estimate', { p_profile: profile })
  if (error) throw new BackupRepositoryError()
  const parsed = backupEstimateSchema.safeParse(data)
  if (!parsed.success) throw new BackupRepositoryError('백업 예상 개수 응답을 확인할 수 없습니다.')
  return parsed.data
}

export async function getBackupSnapshot(
  client: DatabaseClient,
  profile: BackupProfile,
): Promise<BackupSnapshot> {
  const { data, error } = await client.rpc('get_user_backup_snapshot', { p_profile: profile })
  if (error) throw new BackupRepositoryError()
  const parsed = backupSnapshotSchema.safeParse(data)
  if (!parsed.success) throw new BackupRepositoryError('백업 snapshot 응답을 확인할 수 없습니다.')
  return parsed.data
}
