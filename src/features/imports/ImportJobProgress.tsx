import type { ImportJobDetail } from './importJobs.types'

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-'
}

export function ImportJobProgress({ job }: { job: ImportJobDetail }) {
  return <section className="import-panel" aria-labelledby="import-job-progress-title">
    <div className="import-panel__heading"><div><h2 id="import-job-progress-title">영구 진행률</h2><p>{job.completedCount} / {job.totalCount} 완료 · {job.progressPercent}%</p></div><strong>{job.status}</strong></div>
    <progress max={Math.max(job.totalCount, 1)} value={job.completedCount}>{job.progressPercent}%</progress>
    <div className="import-summary-grid">
      <span>pending <strong>{job.pendingCount}</strong></span><span>실행 중 <strong>{job.runningCount}</strong></span>
      <span>콘텐츠 성공 <strong>{job.contentImportedCount}</strong></span><span>콘텐츠 실패 <strong>{job.contentFailedCount}</strong></span>
      <span>tracking 성공 <strong>{job.trackingImportedCount}</strong></span><span>tracking 실패 <strong>{job.trackingFailedCount}</strong></span>
      <span>tracking 없음 <strong>{job.trackingNotPresentCount}</strong></span><span>비적용 <strong>{job.trackingNotApplicableCount}</strong></span>
      <span>취소 <strong>{job.cancelledCount}</strong></span><span>재시도 가능 <strong>{job.retryableFailureCount}</strong></span><span>재시도 불가 <strong>{job.nonRetryableFailureCount}</strong></span>
    </div>
    <dl className="import-job-metadata"><div><dt>생성</dt><dd>{formatDate(job.createdAt)}</dd></div><div><dt>시작</dt><dd>{formatDate(job.startedAt)}</dd></div><div><dt>완료</dt><dd>{formatDate(job.completedAt)}</dd></div><div><dt>취소</dt><dd>{formatDate(job.cancelledAt)}</dd></div></dl>
    <details><summary>Dry Run 요약</summary><pre>{JSON.stringify(job.dryRunSummary, null, 2)}</pre></details>
  </section>
}
