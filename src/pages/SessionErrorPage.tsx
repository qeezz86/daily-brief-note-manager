interface SessionErrorPageProps {
  message: string
}

export function SessionErrorPage({ message }: SessionErrorPageProps) {
  return (
    <main className="system-state" aria-labelledby="session-error-title">
      <p className="dashboard__eyebrow">연결 오류</p>
      <h1 id="session-error-title">인증 상태를 확인할 수 없습니다</h1>
      <p role="alert">{message}</p>
    </main>
  )
}
