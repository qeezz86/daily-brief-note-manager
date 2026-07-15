import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { backupSnapshotFixture } from './backups.fixtures'
import { BackupRepositoryError, getBackupEstimate, getBackupSnapshot } from './backup.repository'

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) } as unknown as DatabaseClient
}

describe('backup repository', () => {
  it('estimate RPC에 profile만 전달한다', async () => {
    const db = client({ profile: 'core', sectionCounts: {}, totalRecords: 0, categoryManifestCount: 8, includesOperationalHistory: false, includesNormalizedPayload: false })
    await getBackupEstimate(db, 'core')
    expect(db.rpc).toHaveBeenCalledWith('get_user_backup_estimate', { p_profile: 'core' })
  })
  it('snapshot RPC 응답을 Zod로 검증한다', async () => {
    await expect(getBackupSnapshot(client(backupSnapshotFixture()), 'core')).resolves.toMatchObject({ profile: 'core' })
  })
  it('schema가 다른 응답을 차단한다', async () => {
    await expect(getBackupSnapshot(client({ profile: 'core' }), 'core')).rejects.toBeInstanceOf(BackupRepositoryError)
  })
  it('raw Supabase 오류를 노출하지 않는다', async () => {
    await expect(getBackupEstimate(client(null, { message: 'raw sql constraint' }), 'core')).rejects.toThrow('백업 데이터를 불러오지 못했습니다.')
  })
})
