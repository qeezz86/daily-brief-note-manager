export function DashboardPage() {
  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard__heading">
        <p className="dashboard__eyebrow">대시보드</p>
        <h1 id="dashboard-title">콘텐츠 관리</h1>
      </div>

      <div className="empty-state" role="status">
        <span className="empty-state__indicator" aria-hidden="true" />
        <div>
          <h2>인증 연결이 준비되었습니다</h2>
          <p>콘텐츠 관리 기능은 다음 단계에서 추가됩니다.</p>
        </div>
      </div>
    </section>
  )
}
