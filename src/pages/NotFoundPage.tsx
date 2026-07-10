import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <p className="dashboard__eyebrow">404</p>
      <h1 id="not-found-title">페이지를 찾을 수 없습니다</h1>
      <Link to="/">대시보드로 이동</Link>
    </section>
  )
}
