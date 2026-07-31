import { useAuth } from '../features/auth/useAuth'
import { DashboardOverview } from '../features/dashboard/DashboardOverview'
import { useDashboardOverviewQuery } from '../features/dashboard/dashboard.queries'
import type { DashboardRpcClient } from '../features/dashboard/dashboard.repository'
import { supabase } from '../shared/supabase/client'

interface DashboardPageContentProps {
  client?: DashboardRpcClient | null
  userId: string
}

export function DashboardPageContent({
  client = supabase,
  userId,
}: DashboardPageContentProps) {
  const query = useDashboardOverviewQuery(client, userId, 5)

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__heading">
        <p className="dashboard__eyebrow">대시보드</p>
        <h1 id="dashboard-title">운영 현황</h1>
        <p>콘텐츠, 뉴스 추적, 후속 확인, 저장 프롬프트를 한눈에 확인합니다.</p>
      </div>

      <DashboardOverview
        data={query.data}
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => {
          void query.refetch()
        }}
      />
    </section>
  )
}

export function DashboardPage() {
  const { user } = useAuth()

  return <DashboardPageContent userId={user?.id ?? ''} />
}
