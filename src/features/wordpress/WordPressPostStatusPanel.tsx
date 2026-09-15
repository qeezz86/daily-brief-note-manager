import { useEffect, useRef } from 'react'

import type { DatabaseClient } from '../../shared/supabase/client'
import { useWordPressPostStatusMutation } from './wordpressPostStatus.queries'

export interface WordPressPostStatusAttempt {
  id: string
  operation: string
  status: string
  wordpress_post_id: number | null
  wordpress_post_status: string | null
  wordpress_post_slug: string | null
  wordpress_post_link: string | null
}

interface Props { client: DatabaseClient | null; contentId: string; attempts: WordPressPostStatusAttempt[]; autoStart?: boolean }
const labels: Record<string, string> = { IN_SYNC: '현재 원격 상태를 확인했습니다.', REMOTE_NOT_FOUND: 'WordPress에서 게시물을 찾지 못했습니다. 수동 확인이 필요합니다.', REMOTE_ACCESS_DENIED: 'WordPress 접근 권한을 확인해 주세요.', REMOTE_IDENTITY_MISMATCH: '저장된 발행 기록과 원격 게시물 ID가 다릅니다. 수동 확인이 필요합니다.', REMOTE_RESPONSE_UNCERTAIN: '원격 응답을 안전하게 확인하지 못했습니다. 수동 확인이 필요합니다.', MANUAL_RECONCILIATION_REQUIRED: '수동 확인이 필요합니다.' }
export function WordPressPostStatusPanel({ client, contentId, attempts, autoStart = false }: Props) {
  const attempt = attempts.find((item) => item.operation === 'create_draft' && item.status === 'succeeded' && typeof item.wordpress_post_id === 'number' && item.wordpress_post_id > 0)
  const mutation = useWordPressPostStatusMutation(client, contentId)
  const { mutate } = mutation
  const attemptId = attempt?.id
  const autoStartedAttemptId = useRef<string | null>(null)
  useEffect(() => {
    if (!autoStart || !attemptId || autoStartedAttemptId.current === attemptId) return
    let active = true
    // Start after StrictMode's subscription cleanup/replay; discard the cleaned-up effect.
    queueMicrotask(() => {
      if (!active) return
      autoStartedAttemptId.current = attemptId
      mutate({ contentId, attemptId })
    })
    return () => { active = false }
  }, [attemptId, autoStart, contentId, mutate])
  if (!attempt) return null
  const result = mutation.data
  return <section className="content-detail__section" aria-labelledby="wordpress-post-status-title">
    <h2 id="wordpress-post-status-title">WordPress 게시물 상태</h2>
    <p>저장된 초안 정보: Post ID {attempt.wordpress_post_id}, 상태 {attempt.wordpress_post_status ?? '미확인'}</p>
    <button className="primary-button" type="button" onClick={() => mutation.mutate({ contentId, attemptId: attempt.id })} disabled={mutation.isPending}>
      {mutation.isPending ? 'WordPress 상태 확인 중' : 'WordPress 상태 확인'}
    </button>
    {mutation.isPending ? <p role="status">WordPress 상태를 확인하고 있습니다.</p> : null}
    {mutation.isError ? <p className="form-alert" role="alert">{mutation.error instanceof Error ? mutation.error.message : 'WordPress 상태를 확인하지 못했습니다.'}</p> : null}
    {result ? <div className="content-detail__metadata content-detail__metadata--nested">
      <p><strong>확인 결과:</strong> {labels[result.reconciliation.primary]}</p>
      <p>확인 시각: {result.checkedAt}</p>
      <p>저장된 상태: {result.stored.status}</p>
      <p>현재 WordPress 상태: {result.wordpress?.status ?? '확인 불가'}</p>
      <p>저장된 Slug: {result.stored.slug}</p>
      <p>원격 Slug: {result.wordpress?.slug ?? '확인 불가'}</p>
      <p>저장된 링크: <a href={result.stored.link} target="_blank" rel="noopener noreferrer">{result.stored.link}</a></p>
      {result.wordpress ? <><p>원격 링크: <a href={result.wordpress.link} target="_blank" rel="noopener noreferrer">{result.wordpress.link}</a></p><p>원격 수정 시각: {result.wordpress.modifiedGmt}</p></> : null}
      {result.reconciliation.deltas.length ? <p>확인된 변경: {result.reconciliation.deltas.join(', ')}</p> : null}
      {result.stored.status === 'draft' && result.wordpress?.status === 'publish' ? <p>WordPress에서 외부적으로 상태가 변경되었으며, 이 앱은 그 상태만 관찰했습니다.</p> : null}
    </div> : null}
  </section>
}
