import { WordPressDiagnosticsPanel } from '../features/wordpress/WordPressDiagnosticsPanel'
import { useWordPressDiagnosticsMutation } from '../features/wordpress/wordpressDiagnostics.query'
import { supabase } from '../shared/supabase/client'

export function WordPressSettingsPage() {
  const diagnostics = useWordPressDiagnosticsMutation(supabase)

  return (
    <section className="wordpress-page" aria-labelledby="wordpress-page-title" aria-busy={diagnostics.isPending}>
      <div className="page-heading-with-actions">
        <div>
          <p className="dashboard__eyebrow">설정 · Read-only 진단</p>
          <h1 id="wordpress-page-title">WordPress 연결</h1>
          <p className="wordpress-page__description">사용자명과 Application Password는 브라우저가 아닌 Supabase Edge Function secret에서만 관리됩니다.</p>
        </div>
        <button className="primary-button wordpress-page__action" type="button" disabled={diagnostics.isPending} onClick={() => diagnostics.mutate()}>
          {diagnostics.isPending ? '진단 중' : diagnostics.data ? '다시 진단' : '연결 진단'}
        </button>
      </div>

      <div className="wordpress-live-region" role="status" aria-live="polite">
        {diagnostics.isIdle ? '아직 연결 진단을 실행하지 않았습니다.' : null}
        {diagnostics.isPending ? 'WordPress REST API 연결을 안전하게 확인하고 있습니다.' : null}
      </div>

      {diagnostics.isError ? (
        <div className="content-state content-state--error" role="alert">
          <h2>연결 진단 실패</h2>
          <p>{diagnostics.error.message}</p>
          <button className="secondary-button" type="button" onClick={() => diagnostics.mutate()} disabled={diagnostics.isPending}>재시도</button>
        </div>
      ) : null}
      {diagnostics.data ? <WordPressDiagnosticsPanel result={diagnostics.data} /> : null}
    </section>
  )
}
