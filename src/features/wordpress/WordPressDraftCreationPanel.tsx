import { useState } from 'react'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { PublicationPlan } from './wordpressPublicationPreview.schema'
import { useWordPressDraftCreateMutation, useWordPressPublicationAttemptsQuery } from './wordpressDraftCreate.queries'
import { WordPressDraftServiceError } from './wordpressDraftCreate.service'

function safeHttpsLink(value: string | null): string | null {
  if (!value) return null
  try { return new URL(value).protocol === 'https:' ? value : null } catch { return null }
}

export function WordPressDraftCreationPanel({
  client, userId, plan, sourceTitle, stale,
}: { client: DatabaseClient | null; userId: string; plan: PublicationPlan; sourceTitle: string; stale: boolean }) {
  const attempts = useWordPressPublicationAttemptsQuery(client, userId, plan.source.contentId)
  const createDraft = useWordPressDraftCreateMutation(client, userId, plan.source.contentId)
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  const guardedAttempt = attempts.data?.find((attempt) => ['succeeded', 'uncertain', 'executing'].includes(attempt.status))
  const ready = plan.readyForDraftCreation && !stale && !guardedAttempt && !createDraft.isPending
  const error = createDraft.error instanceof WordPressDraftServiceError ? createDraft.error : null
  const uncertain = error?.code === 'WORDPRESS_DRAFT_TIMEOUT_UNCERTAIN'
    || error?.code === 'WORDPRESS_DRAFT_RESULT_UNCERTAIN'
    || error?.code === 'WORDPRESS_DRAFT_RESPONSE_INVALID'
    || error?.code === 'MANUAL_RECONCILIATION_REQUIRED'

  function prepare() {
    if (!idempotencyKey) setIdempotencyKey(crypto.randomUUID())
    setOpen(true)
  }

  function submit() {
    if (!confirmed || !idempotencyKey || !ready) return
    createDraft.mutate({
      contentId: plan.source.contentId, expectedSourceUpdatedAt: plan.source.updatedAt,
      expectedPayloadFingerprint: plan.payloadFingerprint, idempotencyKey,
    }, { onSuccess: () => setOpen(false) })
  }

  return <>
    <section className="wordpress-panel wordpress-draft-create" aria-labelledby="wordpress-draft-create-title">
      <p className="dashboard__eyebrow">Phase 5C · 단일 write</p>
      <h2 id="wordpress-draft-create-title">WordPress 초안 생성</h2>
      <p>실제 발행이 아니라 <strong>draft 상태의 신규 글 1건</strong>을 WordPress에 만듭니다. 서버가 DB 원본과 taxonomy를 다시 읽고 검증합니다.</p>
      <dl>
        <div><dt>대상</dt><dd>{sourceTitle}</dd></div>
        <div><dt>Site</dt><dd>{plan.site.origin}</dd></div>
        <div><dt>Slug</dt><dd><code>{plan.payload.slug}</code></dd></div>
        <div><dt>Taxonomy</dt><dd>category {plan.payload.categories.length} · tag {plan.payload.tags.length}</dd></div>
        <div><dt>Source updated_at</dt><dd>{plan.source.updatedAt}</dd></div>
        <div><dt>Fingerprint</dt><dd><code>{plan.payloadFingerprint}</code></dd></div>
      </dl>
      {guardedAttempt ? <p className="form-alert" role="alert">{guardedAttempt.status === 'uncertain' ? '결과가 불명확한 기록이 있습니다. 다시 생성하지 말고 WordPress 관리자에서 slug를 확인하세요.' : '이미 생성되었거나 실행 중인 초안 기록이 있어 새 생성을 차단했습니다.'}</p> : null}
      <button className="primary-button" type="button" disabled={!ready} onClick={prepare}>WordPress 초안 생성 준비</button>
    </section>

    {open ? <div className="wordpress-confirmation" role="dialog" aria-modal="true" aria-labelledby="wordpress-confirmation-title">
      <div className="wordpress-confirmation__card">
        <h2 id="wordpress-confirmation-title">WordPress 외부 변경 확인</h2>
        <p><strong>{sourceTitle}</strong>을(를) draft 상태로 1건 생성합니다. 자동 재시도, publish, update, media 또는 taxonomy write는 수행하지 않습니다.</p>
        <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />초안 1건 생성과 외부 변경을 확인했습니다.</label>
        <div className="detail-actions">
          <button className="primary-button" type="button" disabled={!confirmed || createDraft.isPending} onClick={submit}>{createDraft.isPending ? '초안 생성 요청 중' : '초안 1건 생성'}</button>
          <button type="button" disabled={createDraft.isPending} onClick={() => setOpen(false)}>취소</button>
        </div>
      </div>
    </div> : null}

    {createDraft.data ? <section className="wordpress-panel wordpress-status--ready" aria-labelledby="wordpress-draft-result-title">
      <h2 id="wordpress-draft-result-title">WordPress 초안 생성 완료</h2>
      <dl>
        <div><dt>Post ID</dt><dd>{createDraft.data.wordpress.postId}</dd></div>
        <div><dt>Status</dt><dd>{createDraft.data.wordpress.status}</dd></div>
        <div><dt>Slug</dt><dd><code>{createDraft.data.wordpress.slug}</code></dd></div>
        <div><dt>Attempt ID</dt><dd><code>{createDraft.data.attemptId}</code></dd></div>
        <div><dt>Fingerprint</dt><dd><code>{createDraft.data.source.payloadFingerprint}</code></dd></div>
        <div><dt>Replay</dt><dd>{createDraft.data.idempotentReplay ? '예' : '아니요'}</dd></div>
      </dl>
      <a className="secondary-link" href={createDraft.data.wordpress.link} target="_blank" rel="noopener noreferrer">WordPress에서 초안 확인</a>
    </section> : null}

    {error ? <section className="wordpress-panel wordpress-panel--warning" role="alert">
      <h2>초안 생성 실패</h2><p><code>{error.code}</code> {error.message}</p>
      {uncertain ? <><p><strong>다시 생성하지 마세요.</strong></p><p>WordPress 관리자에서 <code>{plan.payload.slug}</code>를 확인한 뒤 수동으로 조정해야 합니다.</p></> : <p>자동 재시도하지 않았습니다. 원인을 수정한 뒤 새 Dry Run을 실행하세요.</p>}
    </section> : null}

    <section className="wordpress-panel" aria-labelledby="wordpress-attempt-history-title">
      <h2 id="wordpress-attempt-history-title">Draft history</h2>
      {attempts.isLoading ? <p role="status">초안 이력을 불러오는 중입니다.</p> : null}
      {attempts.isError ? <p role="alert">초안 이력을 불러오지 못했습니다.</p> : null}
      {attempts.data?.length === 0 ? <p>현재 콘텐츠의 초안 생성 이력이 없습니다.</p> : null}
      {attempts.data?.length ? <ul className="wordpress-attempt-list">{attempts.data.map((attempt) => {
        const link = safeHttpsLink(attempt.wordpress_post_link)
        return <li key={attempt.id}><strong>{attempt.status}</strong> · create_draft · {attempt.completed_at ?? attempt.started_at ?? attempt.created_at}
          {attempt.wordpress_post_id ? <> · #{attempt.wordpress_post_id}</> : null}
          {attempt.wordpress_post_slug ? <> · <code>{attempt.wordpress_post_slug}</code></> : null}
          {attempt.error_code ? <> · <code>{attempt.error_code}</code></> : null}
          {link ? <> · <a href={link} target="_blank" rel="noopener noreferrer">WordPress에서 확인</a></> : null}
        </li>
      })}</ul> : null}
    </section>
  </>
}
