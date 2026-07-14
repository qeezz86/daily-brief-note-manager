import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ImportExecutionResult } from './importExecution.types'

type ResultFilter = 'all' | 'content_imported' | 'content_failed' | 'tracking_imported' | 'tracking_failed' | 'tracking_not_present'

export function ImportExecutionResults({ result, onCopyAll, onCopyFailures, copyMessage }: {
  result: ImportExecutionResult
  onCopyAll: () => void
  onCopyFailures: () => void
  copyMessage: string | null
}) {
  const [filter, setFilter] = useState<ResultFilter>('all')
  const items = useMemo(() => result.items.filter((item) => filter === 'all'
    || (filter === 'content_imported' && item.contentStatus === 'imported')
    || (filter === 'content_failed' && item.contentStatus === 'failed')
    || (filter === 'tracking_imported' && item.trackingStatus === 'imported')
    || (filter === 'tracking_failed' && item.trackingStatus === 'failed')
    || (filter === 'tracking_not_present' && item.trackingStatus === 'not_present')), [filter, result.items])
  return <section className="import-panel" aria-labelledby="import-execution-results-title">
    <div className="import-panel__heading"><div><h2 id="import-execution-results-title">현재 세션 Import 결과</h2><p>콘텐츠 성공 {result.imported} · 콘텐츠 실패 {result.failed} · 추적 성공 {result.trackingImported} · 추적 실패 {result.trackingFailed} · 추적 없음 {result.trackingNotPresent} · 건너뜀 {result.skipped}. 새로고침하면 이 결과는 사라질 수 있습니다.</p></div><div className="detail-actions"><button className="secondary-button" type="button" onClick={onCopyAll}>결과 복사</button><button className="secondary-button" type="button" disabled={result.failed + result.trackingFailed === 0} onClick={onCopyFailures}>실패 결과 복사</button></div></div>
    <div className="segmented-control" aria-label="Import 결과 필터"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체</button><button type="button" aria-pressed={filter === 'content_imported'} onClick={() => setFilter('content_imported')}>콘텐츠 성공</button><button type="button" aria-pressed={filter === 'content_failed'} onClick={() => setFilter('content_failed')}>콘텐츠 실패</button><button type="button" aria-pressed={filter === 'tracking_imported'} onClick={() => setFilter('tracking_imported')}>tracking 성공</button><button type="button" aria-pressed={filter === 'tracking_failed'} onClick={() => setFilter('tracking_failed')}>tracking 실패</button><button type="button" aria-pressed={filter === 'tracking_not_present'} onClick={() => setFilter('tracking_not_present')}>tracking 없음</button></div>
    {copyMessage ? <p className="field-help" role="status">{copyMessage}</p> : null}
    <ol className="import-execution-list">{items.map((item) => <li key={item.externalKey}><div><strong>{item.title}</strong><small>{item.categoryId} · 콘텐츠 {item.contentStatus} · tracking {item.trackingStatus}</small>{item.message ? <p>{item.message}</p> : null}{item.trackingStatus === 'imported' ? <p>신규 주제 {item.createdTopicCount ?? 0} · 기존 주제 재사용 {item.reusedTopicCount ?? 0} · 업데이트 {item.updateCount ?? 0} · 후속 확인 {item.followupCount ?? 0}</p> : null}{item.trackingMessage ? <p>{item.trackingMessage}</p> : null}{item.trackingStatus === 'failed' ? <p>콘텐츠 게시물은 유지됐습니다. Phase 4A-4 전에는 자동 재시도가 없으므로 현재 세션 결과를 복사해 보관해 주세요.</p> : null}</div>{item.postPath ? <Link className="secondary-button" to={item.postPath}>생성된 게시물 열기</Link> : null}</li>)}</ol>
  </section>
}
