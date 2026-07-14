import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ImportJobItem, ImportJobOverallStatus } from './importJobs.types'

type ItemFilter = 'all' | ImportJobOverallStatus | 'content_failed' | 'tracking_failed'

export function ImportJobItemList({ items }: { items: ImportJobItem[] }) {
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [search, setSearch] = useState('')
  const visible = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === 'all' || (filter === 'content_failed' ? item.contentStatus === 'failed' : filter === 'tracking_failed' ? item.trackingStatus === 'failed' : item.overallStatus === filter)
    const term = search.trim().toLocaleLowerCase('ko-KR')
    return matchesFilter && (!term || `${item.title} ${item.externalKey}`.toLocaleLowerCase('ko-KR').includes(term))
  }), [filter, items, search])

  return <section className="import-panel" aria-labelledby="import-job-items-title">
    <div className="import-panel__heading"><div><h2 id="import-job-items-title">항목</h2><p>snapshot 원문과 HTML은 이 화면에 표시하지 않습니다.</p></div><strong>{visible.length}개</strong></div>
    <div className="content-toolbar">
      <label>상태<select value={filter} onChange={(event) => setFilter(event.target.value as ItemFilter)}><option value="all">전체</option><option value="pending">pending</option><option value="completed">완료</option><option value="content_failed">콘텐츠 실패</option><option value="tracking_failed">tracking 실패</option><option value="cancelled">취소</option></select></label>
      <label>검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목 또는 external key" /></label>
    </div>
    <div className="import-job-item-list">
      {visible.map((item) => <article className="import-job-item" key={item.id}>
        <div><strong>{item.itemIndex + 1}. {item.title}</strong><p>{item.externalKey} · {item.categoryId}</p></div>
        <dl><div><dt>콘텐츠</dt><dd>{item.contentStatus} ({item.contentAttemptCount}회)</dd></div><div><dt>tracking</dt><dd>{item.trackingStatus} ({item.trackingAttemptCount}회)</dd></div></dl>
        {item.contentErrorMessage ? <p className="form-alert">{item.contentErrorCode}: {item.contentErrorMessage}{item.contentRetryable ? ' · 재시도 가능' : ' · 재시도 불가'}</p> : null}
        {item.trackingErrorMessage ? <p className="form-alert">{item.trackingErrorCode}: {item.trackingErrorMessage}{item.trackingRetryable ? ' · 재시도 가능' : ' · 재시도 불가'}</p> : null}
        {item.topicCount !== null ? <p>tracking 집계 · topic {item.topicCount} · 재사용 {item.reusedTopicCount ?? 0} · 생성 {item.createdTopicCount ?? 0} · update {item.updateCount ?? 0} · followup {item.followupCount ?? 0} · source {item.sourceLinkCount ?? 0}</p> : null}
        {item.postId ? <Link to={`/content/${item.postId}`}>생성된 게시물 열기</Link> : null}
        {item.attempts.length ? <details><summary>시도 기록 {item.attempts.length}개</summary><ol>{item.attempts.map((attempt) => <li key={attempt.id}>{attempt.stage} #{attempt.attemptNo} · {attempt.status}{attempt.safeErrorMessage ? ` · ${attempt.safeErrorMessage}` : ''}</li>)}</ol></details> : null}
      </article>)}
      {!visible.length ? <p className="content-state">조건에 맞는 항목이 없습니다.</p> : null}
    </div>
  </section>
}
