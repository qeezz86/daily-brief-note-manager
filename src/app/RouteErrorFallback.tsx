import { Link, useRouteError } from 'react-router-dom'

import { isChunkLoadError } from './routeErrors'

export function RouteErrorFallback() {
  const error = useRouteError()
  const isChunkError = isChunkLoadError(error)

  return (
    <section className="route-error" aria-labelledby="route-error-title">
      <p className="dashboard__eyebrow">페이지 오류</p>
      <h1 id="route-error-title">
        {isChunkError
          ? '페이지 파일을 불러오지 못했습니다'
          : '페이지를 표시할 수 없습니다'}
      </h1>
      <p>
        현재 페이지를 새로고침해 주세요. 문제가 계속되면 대시보드로
        이동해 다시 시도할 수 있습니다.
      </p>
      <Link className="primary-link primary-link--inline" to="/dashboard">
        대시보드로 이동
      </Link>
    </section>
  )
}
