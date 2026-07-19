import { useState } from 'react'
import { Link } from 'react-router-dom'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import type { PublicationPlan } from './wordpressPublicationPreview.schema'
import type { DatabaseClient } from '../../shared/supabase/client'
import { WordPressDraftCreationPanel } from './WordPressDraftCreationPanel'

function Resolution({ title, value }: { title: string; value: PublicationPlan['taxonomy']['categories'] }) {
  return <section className="wordpress-plan__resolution"><h3>{title}</h3><dl><div><dt>resolved</dt><dd>{value.resolved.length}</dd></div><div><dt>missing</dt><dd>{value.missing.length}</dd></div><div><dt>ambiguous</dt><dd>{value.ambiguous.length}</dd></div><div><dt>stale</dt><dd>{value.stale.length}</dd></div></dl>{[...value.missing, ...value.ambiguous, ...value.stale].length ? <ul>{[...value.missing, ...value.ambiguous, ...value.stale].map((item) => <li key={`${item.localKey}-${item.termId ?? 'none'}`}>{item.localName} <code>{item.localKey}</code></li>)}</ul> : null}</section>
}

export function WordPressPublicationPlanPanel({ plan, sourceTitle, stale, client, userId }: { plan: PublicationPlan; sourceTitle: string; stale: boolean; client?: DatabaseClient | null; userId?: string }) {
  const [copyStatus, setCopyStatus] = useState('')
  const payloadText = JSON.stringify(plan.payload, null, 2)
  async function copy() { try { await copyTextToClipboard(payloadText); setCopyStatus('Payload를 복사했습니다.') } catch { setCopyStatus('Payload를 복사하지 못했습니다.') } }
  const ready = plan.readyForDraftCreation && !stale
  const hasSeoTagIssue = [...plan.blockers, ...plan.warnings].some((issue) => issue.code === 'SEO_TAG_DUPLICATE_NORMALIZED' || issue.code === 'SEO_TAG_POSSIBLE_NEAR_DUPLICATE')
  return <div className="wordpress-plan">
    <section className={`wordpress-status wordpress-status--${ready ? 'ready' : 'partial'}`}><p className="dashboard__eyebrow">Publication Dry Run</p><h2>{ready ? 'Draft 생성 준비 완료' : '차단 사유 확인 필요'}</h2><dl><div><dt>Source</dt><dd>{sourceTitle}</dd></div><div><dt>Content type</dt><dd>{plan.source.contentType}</dd></div><div><dt>Source ID</dt><dd><code>{plan.source.contentId}</code></dd></div><div><dt>Site</dt><dd>{plan.site.origin}</dd></div><div><dt>Mode</dt><dd>dry-run</dd></div><div><dt>Write performed</dt><dd>아니요</dd></div><div><dt>기준 updated_at</dt><dd>{plan.source.updatedAt}</dd></div><div><dt>Fingerprint</dt><dd><code>{plan.payloadFingerprint}</code></dd></div></dl>{stale ? <p className="form-alert" role="alert">콘텐츠가 Dry Run 이후 변경되었습니다. 다시 실행해 주세요.</p> : null}</section>
    <div className="wordpress-plan__grid"><Resolution title="Category mapping" value={plan.taxonomy.categories} /><Resolution title="Tag mapping" value={plan.taxonomy.tags} /></div>
    <section className="wordpress-panel"><h2>Duplicate slug</h2><p>{plan.duplicate.conflict ? `${plan.duplicate.matches.length}건의 충돌이 있습니다.` : '동일 slug 글이 없습니다.'}</p>{plan.duplicate.matches.length ? <ul>{plan.duplicate.matches.map((match) => <li key={match.id}>#{match.id} · {match.status} · {match.slug}</li>)}</ul> : null}</section>
    {plan.blockers.length ? <section className="wordpress-panel wordpress-panel--warning" role="alert"><h2>Blockers</h2><ul>{plan.blockers.map((issue) => <li key={`${issue.code}-${issue.message}-${issue.detail ?? ''}`}><code>{issue.code}</code> {issue.message}{issue.detail ? <span className="wordpress-plan__issue-detail">{issue.detail}</span> : null}</li>)}</ul></section> : null}
    {plan.warnings.length ? <section className="wordpress-panel wordpress-panel--warning"><h2>Warnings</h2><ul>{plan.warnings.map((issue) => <li key={`${issue.code}-${issue.message}-${issue.detail ?? ''}`}><code>{issue.code}</code> {issue.message}{issue.detail ? <span className="wordpress-plan__issue-detail">{issue.detail}</span> : null}</li>)}</ul></section> : null}
    {hasSeoTagIssue ? <section className="wordpress-panel"><h2>SEO 태그 수정 안내</h2><p>태그 원문은 자동 삭제·병합하지 않습니다. <Link to={`/content/${plan.source.contentId}/edit`}>콘텐츠 편집 화면에서 표시된 태그 쌍을 직접 수정해 주세요.</Link></p></section> : null}
    <section className="wordpress-panel"><h2>Final payload JSON</h2><dl><div><dt>HTML bytes</dt><dd>{plan.payloadSize.contentBytes.toLocaleString()}</dd></div><div><dt>Canonical JSON bytes</dt><dd>{plan.payloadSize.canonicalPayloadBytes.toLocaleString()}</dd></div></dl><pre className="wordpress-payload"><code>{payloadText}</code></pre><div className="detail-actions"><button className="primary-button" type="button" onClick={() => void copy()}>Payload 복사</button><Link className="secondary-link" to="/settings/wordpress">Taxonomy 매핑 수정</Link></div><p role="status" aria-live="polite">{copyStatus}</p></section>
    {client && userId ? <WordPressDraftCreationPanel key={plan.checkedAt} client={client} userId={userId} plan={plan} sourceTitle={sourceTitle} stale={stale} /> : null}
  </div>
}
