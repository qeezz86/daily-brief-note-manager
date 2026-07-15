import { useQuery } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { getBackupEstimate } from './backup.repository'
import type { BackupProfile } from './backup.types'

export const backupQueryKeys = {
  estimate: (userId: string, profile: BackupProfile) => ['backups', 'estimate', userId, profile] as const,
}

export function useBackupEstimateQuery(
  client: DatabaseClient | null,
  userId: string,
  profile: BackupProfile,
) {
  return useQuery({
    queryKey: backupQueryKeys.estimate(userId, profile),
    queryFn: () => {
      if (!client) throw new Error('Supabase client is not configured.')
      return getBackupEstimate(client, profile)
    },
    enabled: Boolean(client && userId),
    retry: false,
    staleTime: 0,
  })
}
