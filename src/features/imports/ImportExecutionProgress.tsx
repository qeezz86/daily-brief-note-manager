import type { ImportProgressState } from './importExecution.types'

export function ImportExecutionProgress({ progress }: { progress: ImportProgressState }) {
  const remaining = Math.max(0, progress.total - progress.completed)
  return <section className="import-panel" aria-labelledby="import-progress-title">
    <h2 id="import-progress-title">Import 진행 상황</h2>
    <progress max={Math.max(1, progress.total)} value={progress.completed}>{progress.completed}/{progress.total}</progress>
    <p aria-live="polite">{progress.currentTitle ? `현재 항목: ${progress.currentTitle}` : '실행을 마쳤습니다.'}</p>
    <div className="import-progress-counts"><span>콘텐츠 성공 {progress.imported}</span><span>콘텐츠 실패 {progress.failed}</span><span>추적 성공 {progress.trackingImported}</span><span>추적 실패 {progress.trackingFailed}</span><span>건너뜀 {progress.skipped}</span><span>남음 {remaining}</span></div>
  </section>
}
