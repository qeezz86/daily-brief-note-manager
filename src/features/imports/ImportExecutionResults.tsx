import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ImportExecutionItemStatus, ImportExecutionResult } from './importExecution.types'

export function ImportExecutionResults({ result, onCopyAll, onCopyFailures, copyMessage }: {
  result: ImportExecutionResult
  onCopyAll: () => void
  onCopyFailures: () => void
  copyMessage: string | null
}) {
  const [filter, setFilter] = useState<ImportExecutionItemStatus | 'all'>('all')
  const items = useMemo(() => filter === 'all' ? result.items : result.items.filter((item) => item.status === filter), [filter, result.items])
  return <section className="import-panel" aria-labelledby="import-execution-results-title">
    <div className="import-panel__heading"><div><h2 id="import-execution-results-title">현재 세션 Import 결과</h2><p>성공 {result.imported} · 실패 {result.failed} · 건너뜀 {result.skipped}. 새로고침하면 이 결과는 사라질 수 있습니다.</p></div><div className="detail-actions"><button className="secondary-button" type="button" onClick={onCopyAll}>결과 복사</button><button className="secondary-button" type="button" disabled={result.failed === 0} onClick={onCopyFailures}>실패 결과 복사</button></div></div>
    <div className="segmented-control" aria-label="Import 결과 필터"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체</button><button type="button" aria-pressed={filter === 'imported'} onClick={() => setFilter('imported')}>성공 항목만 보기</button><button type="button" aria-pressed={filter === 'failed'} onClick={() => setFilter('failed')}>실패 항목만 보기</button></div>
    {copyMessage ? <p className="field-help" role="status">{copyMessage}</p> : null}
    <ol className="import-execution-list">{items.map((item) => <li key={item.externalKey}><div><strong>{item.title}</strong><small>{item.categoryId} · {item.status}</small>{item.message ? <p>{item.message}</p> : null}</div>{item.postPath ? <Link className="secondary-button" to={item.postPath}>생성된 게시물 열기</Link> : null}</li>)}</ol>
  </section>
}
