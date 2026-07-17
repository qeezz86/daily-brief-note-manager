export function RouteLoadingFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <p>페이지를 불러오는 중입니다.</p>
    </div>
  )
}
