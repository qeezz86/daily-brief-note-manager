import { useQuery } from '@tanstack/react-query'

import { getDashboardOverview } from './dashboard.repository'
import type { DashboardRpcClient } from './dashboard.repository'

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  overview: (userId: string, recentLimit = 5) => [
    ...dashboardQueryKeys.all,
    'overview',
    userId,
    recentLimit,
  ] as const,
}

export function useDashboardOverviewQuery(
  client: DashboardRpcClient | null,
  userId: string,
  recentLimit = 5,
) {
  return useQuery({
    queryKey: dashboardQueryKeys.overview(userId, recentLimit),
    queryFn: () => {
      if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.')
      return getDashboardOverview(client, recentLimit)
    },
    enabled: Boolean(client && userId),
    retry: false,
  })
}
