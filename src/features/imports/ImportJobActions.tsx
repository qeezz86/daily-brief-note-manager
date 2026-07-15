import type { ImportJobDetail, ImportJobExecutionMode } from './importJobs.types'

export function ImportJobActions({ job, busy, onExecute, onCancel, onResume }: {
  job: ImportJobDetail
  busy: boolean
  onExecute: (mode: ImportJobExecutionMode) => void
  onCancel: () => void
  onResume: () => void
}) {
  if (job.executionLocked) return <section className="import-panel import-job-actions" aria-labelledby="import-job-actions-title">
    <h2 id="import-job-actions-title">복원된 과거 이력</h2>
    <p className="form-alert">이 작업은 백업에서 복원된 과거 기록입니다. 콘텐츠와 tracking을 다시 실행할 수 없습니다.</p>
  </section>
  const cancelled = job.status === 'cancelled'
  const terminal = job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed'
  return <section className="import-panel import-job-actions" aria-labelledby="import-job-actions-title">
    <h2 id="import-job-actions-title">작업 액션</h2>
    <div className="form-actions">
      <button className="primary-button" type="button" disabled={busy || cancelled || job.pendingCount === 0} onClick={() => onExecute('pending')}>계속 실행</button>
      <button className="secondary-button" type="button" disabled={busy || cancelled || job.retryableFailureCount === 0} onClick={() => onExecute('all_failed')}>실패 항목 재시도</button>
      <button className="secondary-button" type="button" disabled={busy || cancelled || job.contentRetryableFailureCount === 0} onClick={() => onExecute('content_failed')}>콘텐츠 실패 재시도</button>
      <button className="secondary-button" type="button" disabled={busy || cancelled || job.trackingRetryableFailureCount === 0} onClick={() => onExecute('tracking_failed')}>tracking 실패 재시도</button>
      {!cancelled ? <button className="danger-button" type="button" disabled={busy || terminal} onClick={onCancel}>작업 취소</button> : null}
      {cancelled ? <button className="primary-button" type="button" disabled={busy} onClick={onResume}>취소된 작업 재개</button> : null}
    </div>
  </section>
}
