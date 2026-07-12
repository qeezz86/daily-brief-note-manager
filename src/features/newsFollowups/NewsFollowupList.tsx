import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isNewsFollowupOverdue } from './newsFollowupDates'
import { newsFollowupPriorityLabels, newsFollowupStatusLabels, type NewsFollowup, type NewsFollowupPriority, type NewsFollowupStatus, type ResolveNewsFollowupInput } from './newsFollowups.types'

function formatDateTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value)) }

function ResolvePanel({ item, pending, onResolve }: { item: NewsFollowup; pending: boolean; onResolve: (item: NewsFollowup, input: ResolveNewsFollowupInput) => Promise<void> }) {
  const [target, setTarget] = useState<'done' | 'cancelled' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (!target) return
    if (!note.trim()) { setError('완료 또는 취소 사유를 입력해 주세요.'); return }
    try {
      await onResolve(item, { targetStatus: target, resolutionNote: note.trim() })
      setTarget(null); setNote(''); setError(null)
    } catch {
      // The parent renders the sanitized repository error; keep this panel open.
    }
  }
  if (!target) return <div className="followup-actions"><button type="button" className="secondary-button" disabled={pending} onClick={() => setTarget('done')}>완료 처리</button><button type="button" className="secondary-button" disabled={pending} onClick={() => setTarget('cancelled')}>취소 처리</button></div>
  return <div className="followup-resolution" aria-label={`${target === 'done' ? '완료' : '취소'} 확인`}><p><strong>처리 대상:</strong> {item.check_text}</p><label htmlFor={`resolution-${item.id}`}>{target === 'done' ? '해결 메모' : '취소 사유'}</label><textarea id={`resolution-${item.id}`} rows={3} value={note} onChange={(event) => { setNote(event.target.value); setError(null) }} />{error ? <p className="field-error" role="alert">{error}</p> : null}<div className="followup-actions"><button type="button" className="primary-button" disabled={pending} onClick={() => void submit()}>{target === 'done' ? '완료 처리' : '취소 처리'}</button><button type="button" className="secondary-button" disabled={pending} onClick={() => { setTarget(null); setError(null) }}>돌아가기</button></div></div>
}

export function NewsFollowupList({ items, pending = false, onResolve }: { items: NewsFollowup[]; pending?: boolean; onResolve: (item: NewsFollowup, input: ResolveNewsFollowupInput) => Promise<void> }) {
  if (!items.length) return <p className="field-help">등록된 후속 확인 항목이 없습니다.</p>
  return <ol className="followup-list">{items.map((item) => { const overdue = isNewsFollowupOverdue(item); return <li key={item.id} className={overdue ? 'followup-list__item followup-list__item--overdue' : 'followup-list__item'}>
    <div className="followup-list__heading"><h3>{item.check_text}</h3><span className={`status-badge status-badge--${item.status}`}>{newsFollowupStatusLabels[item.status as NewsFollowupStatus] ?? item.status}</span>{overdue ? <strong className="overdue-label">마감 초과</strong> : null}</div>
    <dl className="followup-metadata"><div><dt>뉴스 주제</dt><dd><Link to={`/news-topics/${item.topic.id}`}>{item.topic.canonical_title}</Link></dd></div><div><dt>카테고리</dt><dd>{item.topic.category.name}</dd></div><div><dt>주제 상태</dt><dd>{item.topic.status}</dd></div><div><dt>우선순위</dt><dd>{newsFollowupPriorityLabels[item.priority as NewsFollowupPriority] ?? item.priority}</dd></div><div><dt>마감일</dt><dd>{item.due_date ?? '없음'}</dd></div><div><dt>수정일</dt><dd>{formatDateTime(item.updated_at)}</dd></div>{item.resolution_note ? <div><dt>해결 메모</dt><dd>{item.resolution_note}</dd></div> : null}{item.resolved_at ? <div><dt>해결 시각</dt><dd>{formatDateTime(item.resolved_at)}</dd></div> : null}</dl>
    {item.status === 'pending' ? <><div className="followup-actions"><Link className="secondary-link" to={`/news-followups/${item.id}/edit`}>수정</Link></div><ResolvePanel item={item} pending={pending} onResolve={onResolve} /></> : null}
  </li> })}</ol>
}
