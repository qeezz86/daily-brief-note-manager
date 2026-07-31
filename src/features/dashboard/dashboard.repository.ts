import type { Database } from '../../shared/supabase/database.types'
import {
  dashboardRecentLimitSchema,
  parseDashboardOverview,
} from './dashboard.schemas'
import type { DashboardOverviewData } from './dashboard.types'

type DashboardOverviewRpc =
  Database['public']['Functions']['get_dashboard_overview']

export interface DashboardRpcClient {
  rpc(
    functionName: 'get_dashboard_overview',
    args: DashboardOverviewRpc['Args'],
  ): PromiseLike<{
    data: DashboardOverviewRpc['Returns'] | null
    error: { message: string } | null
  }>
}

export async function getDashboardOverview(
  client: DashboardRpcClient,
  recentLimit = 5,
): Promise<DashboardOverviewData> {
  const validLimit = dashboardRecentLimitSchema.parse(recentLimit)
  const { data, error } = await client.rpc('get_dashboard_overview', {
    p_recent_limit: validLimit,
  })

  if (error) {
    throw new Error('대시보드 데이터를 불러오지 못했습니다.')
  }

  try {
    return parseDashboardOverview(data)
  } catch {
    throw new Error('대시보드 데이터 형식이 올바르지 않습니다.')
  }
}
