import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { usePostQuery } from '../features/posts/posts.queries'
import { WordPressPublicationPlanPanel } from '../features/wordpress/WordPressPublicationPlanPanel'
import { usePublicationPlanMutation } from '../features/wordpress/wordpressPublicationPreview.queries'
import { supabase } from '../shared/supabase/client'

export function WordPressPublicationPreviewPage() {
  const { postId = '' } = useParams()
  const { user } = useAuth()
  const post = usePostQuery(supabase, user?.id ?? '', postId)
  const preview = usePublicationPlanMutation(supabase, postId)
  const stale = Boolean(preview.data && post.data && preview.data.source.updatedAt !== post.data.updated_at)
  if (post.isLoading) return <div className="content-state"><h1>콘텐츠를 불러오는 중입니다</h1></div>
  if (post.isError || !post.data) return <div className="content-state content-state--error" role="alert"><h1>콘텐츠를 불러오지 못했습니다</h1><Link to="/content">콘텐츠 목록으로</Link></div>
  return <section className="wordpress-page" aria-labelledby="wordpress-preview-title" aria-busy={preview.isPending}>
    <div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">WordPress · GET-only</p><h1 id="wordpress-preview-title">Publication Dry Run</h1><p className="wordpress-page__description">DB source of truth에서 payload를 다시 만들고 taxonomy와 duplicate slug를 읽기 전용으로 확인합니다.</p></div><button className="primary-button wordpress-page__action" type="button" disabled={preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? 'Dry Run 실행 중' : 'Dry Run 실행'}</button></div>
    <p><Link to={`/content/${postId}`}>콘텐츠 상세로 돌아가기</Link></p>
    <div className="wordpress-live-region" role="status" aria-live="polite">{preview.isIdle ? '아직 Dry Run을 실행하지 않았습니다.' : preview.isPending ? 'WordPress GET-only 검사를 실행하고 있습니다.' : null}</div>
    {preview.isError ? <div className="content-state content-state--error" role="alert"><h2>Dry Run 실패</h2><p>{preview.error.message}</p><button type="button" onClick={() => preview.mutate()}>재시도</button></div> : null}
    {preview.data ? <WordPressPublicationPlanPanel plan={preview.data} sourceTitle={post.data.title} stale={stale} /> : null}
  </section>
}
