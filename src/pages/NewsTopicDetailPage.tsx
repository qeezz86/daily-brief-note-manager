import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { NewsFollowupList } from '../features/newsFollowups/NewsFollowupList'
import { isNewsFollowupOverdue } from '../features/newsFollowups/newsFollowupDates'
import { sortNewsFollowups } from '../features/newsFollowups/filterNewsFollowups'
import { useResolveNewsFollowupMutation, useTopicNewsFollowupsQuery } from '../features/newsFollowups/newsFollowups.queries'
import type { NewsFollowup, ResolveNewsFollowupInput } from '../features/newsFollowups/newsFollowups.types'
import { useNewsTopicHistoryQuery, useNewsTopicQuery, useTransitionNewsTopicMutation } from '../features/newsTopics/newsTopics.queries'
import { allowedNewsTopicTransitions, newsTopicStatusLabels, type NewsTopicStatus } from '../features/newsTopics/newsTopics.types'
import { useTopicNewsUpdatesQuery } from '../features/newsUpdates/newsUpdates.queries'
import { newsUpdateTypeLabels, type NewsUpdateType } from '../features/newsUpdates/newsUpdates.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

function formatDateTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) }
function label(value: string | null) { return value ? newsTopicStatusLabels[value as NewsTopicStatus] ?? value : '없음' }

export function NewsTopicDetailPageContent({ client = supabase, userId, topicId }: { client?: DatabaseClient | null; userId: string; topicId: string }) {
  const topicQuery = useNewsTopicQuery(client, userId, topicId)
  const historyQuery = useNewsTopicHistoryQuery(client, userId, topicId)
  const updatesQuery = useTopicNewsUpdatesQuery(client, userId, topicId)
  const followupsQuery = useTopicNewsFollowupsQuery(client, userId, topicId)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const transitionMutation = useTransitionNewsTopicMutation(client, userId, topicId)
  const resolveMutation = useResolveNewsFollowupMutation(client, userId)
  const topic = topicQuery.data
  const [target, setTarget] = useState<NewsTopicStatus | ''>('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const transitions = useMemo(() => topic ? allowedNewsTopicTransitions[topic.status as NewsTopicStatus] ?? [] : [], [topic])

  if (topicQuery.isPending || historyQuery.isPending || updatesQuery.isPending || followupsQuery.isPending || categoriesQuery.isPending) return <div className="content-state" role="status">뉴스 주제를 불러오고 있습니다.</div>
  if (topicQuery.isError || historyQuery.isError || updatesQuery.isError || followupsQuery.isError || categoriesQuery.isError) return <div className="content-state content-state--error" role="alert"><h1>뉴스 주제를 불러오지 못했습니다</h1><p>잠시 후 다시 시도해 주세요.</p></div>
  if (!topic) return <section className="not-found"><p className="dashboard__eyebrow">Not found</p><h1>뉴스 주제를 찾을 수 없습니다</h1><p>주소가 올바르지 않거나 접근할 수 없는 주제입니다.</p><Link to="/news-topics">뉴스 주제 목록으로</Link></section>

  const category = categoriesQuery.data?.find((item) => item.id === topic.category_id)
  const followups = sortNewsFollowups(followupsQuery.data ?? [])
  const pendingCount = followups.filter((item) => item.status === 'pending').length
  const overdueCount = followups.filter((item) => isNewsFollowupOverdue(item)).length
  const doneCount = followups.filter((item) => item.status === 'done').length
  const cancelledCount = followups.filter((item) => item.status === 'cancelled').length

  async function transition() {
    if (!target) { setError('변경할 상태를 선택해 주세요.'); return }
    if ((target === 'closed' || target === 'reopened') && !reason.trim()) { setError(target === 'closed' ? '종료 사유를 입력해 주세요.' : '재개 사유를 입력해 주세요.'); return }
    const warning = target === 'closed' && pendingCount ? ` 미완료 후속 항목 ${pendingCount}개는 자동 취소되지 않습니다.` : ''
    if (!window.confirm(`${label(topic!.status)} 상태를 ${label(target)} 상태로 변경하시겠습니까?${warning}`)) return
    setError(null); setMessage(null)
    try { await transitionMutation.mutateAsync({ targetStatus: target, reason: reason.trim() || null }); setMessage('뉴스 주제 상태를 변경했습니다.'); setTarget(''); setReason('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '상태를 변경하지 못했습니다.') }
  }
  async function resolveFollowup(item: NewsFollowup, input: ResolveNewsFollowupInput) {
    setError(null)
    try { await resolveMutation.mutateAsync({ id: item.id, topicId, input }); setMessage(input.targetStatus === 'done' ? '후속 확인을 완료 처리했습니다.' : '후속 확인을 취소 처리했습니다.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : '후속 확인 상태를 변경할 수 없습니다.'); throw cause }
  }

  return <article className="content-detail">
    <div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">{category?.name ?? '뉴스 주제'}</p><h1>{topic.canonical_title}</h1></div><span className={`status-badge status-badge--${topic.status}`}>{label(topic.status)}</span></div>
    <dl className="content-detail__metadata"><div><dt>카테고리</dt><dd>{category?.name ?? '알 수 없음'}</dd></div><div><dt>주제 키</dt><dd>{topic.topic_key}</dd></div><div><dt>현재 상태</dt><dd>{label(topic.status)}</dd></div><div><dt>최초 확인일</dt><dd>{topic.first_seen_at}</dd></div><div><dt>최근 확인일</dt><dd>{topic.last_seen_at}</dd></div><div><dt>생성일</dt><dd>{formatDateTime(topic.created_at)}</dd></div><div><dt>수정일</dt><dd>{formatDateTime(topic.updated_at)}</dd></div><div className="content-detail__wide"><dt>종료 사유</dt><dd>{topic.closed_reason ?? '없음'}</dd></div></dl>
    <section className="content-detail__summary"><h2>주제 요약</h2><p>{topic.topic_summary ?? '등록된 요약이 없습니다.'}</p></section>
    <section className="content-detail__section" aria-labelledby="topic-transition-title"><h2 id="topic-transition-title">상태 변경</h2><p className="field-help">현재 상태: {label(topic.status)}</p>{target === 'closed' && pendingCount > 0 ? <p className="form-alert" role="status">미완료 후속 항목 {pendingCount}개는 주제를 종료해도 자동 완료·취소되지 않습니다.</p> : null}<div className="topic-transition-form"><div className="post-form__field"><label htmlFor="topic-target-status">변경할 상태</label><select id="topic-target-status" value={target} onChange={(event) => { setTarget(event.target.value as NewsTopicStatus | ''); setError(null) }}><option value="">선택</option>{transitions.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div><div className="post-form__field"><label htmlFor="topic-status-reason">{target === 'closed' ? '종료 사유' : target === 'reopened' ? '재개 사유' : '변경 사유 (선택)'}</label><textarea id="topic-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><button className="primary-button" type="button" disabled={transitionMutation.isPending || !target} onClick={() => void transition()}>{transitionMutation.isPending ? '변경 중' : '상태 변경'}</button></div>{error ? <p className="form-alert" role="alert">{error}</p> : null}{message ? <p className="form-success" role="status">{message}</p> : null}</section>
    <section className="content-detail__section" aria-labelledby="topic-followups-title"><div className="page-heading-with-actions"><h2 id="topic-followups-title">후속 확인</h2><div className="detail-actions">{topic.status !== 'closed' ? <Link className="primary-link primary-link--inline" to={`/news-topics/${topic.id}/followups/new`}>후속 확인 추가</Link> : <span className="field-help">종료된 주제에는 추가할 수 없습니다.</span>}<Link className="secondary-link" to="/news-followups">전체 후속 확인</Link></div></div><dl className="followup-counts"><div><dt>확인 필요</dt><dd>{pendingCount}</dd></div><div><dt>마감 초과</dt><dd>{overdueCount}</dd></div><div><dt>완료</dt><dd>{doneCount}</dd></div><div><dt>취소</dt><dd>{cancelledCount}</dd></div></dl><NewsFollowupList items={followups} pending={resolveMutation.isPending} onResolve={resolveFollowup} /></section>
    <section className="content-detail__section" aria-labelledby="topic-history-title"><h2 id="topic-history-title">상태 이력</h2>{historyQuery.data?.length ? <ol className="status-history-list">{historyQuery.data.map((item) => <li key={item.id}><strong>{label(item.from_status)} → {label(item.to_status)}</strong><span>{formatDateTime(item.changed_at)}</span>{item.reason ? <p>{item.reason}</p> : null}</li>)}</ol> : <p className="field-help">기록된 상태 변경 이력이 없습니다.</p>}</section>
    <section className="content-detail__section" aria-labelledby="topic-updates-title"><h2 id="topic-updates-title">업데이트 이력</h2>{updatesQuery.data?.length ? <ol className="news-update-list">{updatesQuery.data.map((item) => <li key={item.id}><strong>{item.post.briefing_date ?? '날짜 없음'} · {item.post.display_id ?? item.post.title}</strong><span className="status-badge">{newsUpdateTypeLabels[item.update_type as NewsUpdateType] ?? item.update_type}</span><h3><Link to={`/news-updates/${item.id}`}>{item.headline}</Link></h3><p>{item.fact_summary}</p>{item.change_summary ? <p><strong>변화:</strong> {item.change_summary}</p> : null}{item.previous_update_id ? <Link to={`/news-updates/${item.previous_update_id}`}>이전 업데이트</Link> : null}<p className="field-help">{formatDateTime(item.created_at)} · <Link to={`/content/${item.post.id}`}>게시물 보기</Link></p></li>)}</ol> : <p className="field-help">기록된 뉴스 업데이트가 없습니다.</p>}</section>
    <div className="detail-actions"><Link className="secondary-link" to="/news-topics">목록으로</Link><Link className="primary-link primary-link--inline" to={`/news-topics/${topic.id}/edit`}>기본 정보 수정</Link></div>
  </article>
}
export function NewsTopicDetailPage() { const { user } = useAuth(); const { topicId = '' } = useParams(); return <NewsTopicDetailPageContent userId={user?.id ?? ''} topicId={topicId} /> }
