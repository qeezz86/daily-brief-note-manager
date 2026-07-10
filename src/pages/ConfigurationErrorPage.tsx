export function ConfigurationErrorPage() {
  return (
    <main className="system-state" aria-labelledby="configuration-error-title">
      <p className="dashboard__eyebrow">설정 필요</p>
      <h1 id="configuration-error-title">Supabase 연결을 설정해 주세요</h1>
      <p>
        <code>VITE_SUPABASE_URL</code>과{' '}
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>가 필요합니다.
      </p>
    </main>
  )
}
