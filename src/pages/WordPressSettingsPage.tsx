import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { WordPressDiagnosticsPanel } from '../features/wordpress/WordPressDiagnosticsPanel'
import { useWordPressDiagnosticsMutation } from '../features/wordpress/wordpressDiagnostics.query'
import { WordPressTaxonomyMappingPanel } from '../features/wordpress/WordPressTaxonomyMappingPanel'
import { useTaxonomyCatalogMutation } from '../features/wordpress/wordpressPublicationPreview.queries'
import { supabase } from '../shared/supabase/client'

export function WordPressSettingsPage() {
  const { user } = useAuth()
  const diagnostics = useWordPressDiagnosticsMutation(supabase)
  const catalog = useTaxonomyCatalogMutation(supabase)
  const categories = useActiveCategoriesQuery(supabase)

  return (
    <section className="wordpress-page" aria-labelledby="wordpress-page-title" aria-busy={diagnostics.isPending || catalog.isPending}>
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

      <section className="wordpress-panel" aria-labelledby="wordpress-catalog-title">
        <div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">Taxonomy · GET-only</p><h2 id="wordpress-catalog-title">WordPress taxonomy catalog</h2><p>최대 taxonomy별 20 pages, 2,000 terms까지 읽고 전체성·중복·pagination을 검증합니다.</p></div><button className="secondary-button" type="button" disabled={catalog.isPending} onClick={() => catalog.mutate()}>{catalog.isPending ? '새로고침 중' : 'WordPress taxonomy 새로고침'}</button></div>
        <div className="wordpress-live-region" role="status" aria-live="polite">{catalog.isIdle ? 'Catalog을 아직 읽지 않았습니다.' : catalog.isPending ? 'WordPress category와 tag를 GET으로 읽는 중입니다.' : null}</div>
        {catalog.isError ? <p className="form-alert" role="alert">{catalog.error.message}</p> : null}
        {catalog.data ? <p className="form-success">{catalog.data.site.origin} · category {catalog.data.catalog.categories.length}개 · tag {catalog.data.catalog.tags.length}개 · write performed: 아니요</p> : null}
      </section>
      {catalog.data && categories.data ? <WordPressTaxonomyMappingPanel client={supabase} userId={user?.id ?? ''} catalog={catalog.data} categories={categories.data} /> : null}

      <section className="wordpress-panel"><p className="dashboard__eyebrow">Publication Dry Run</p><h2>콘텐츠 payload 검토</h2><p>각 콘텐츠 상세 화면의 <strong>WordPress Dry Run</strong>에서 source content, taxonomy 해석, duplicate slug, blockers, payload와 fingerprint를 확인할 수 있습니다. 게시·초안 생성·전송 버튼은 제공하지 않습니다.</p></section>
    </section>
  )
}
