import { Link } from 'react-router-dom'
import type { ImportJobListItem } from './importJobs.types'

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-' }

export function ImportJobList({ jobs }: { jobs: ImportJobListItem[] }) {
  if (!jobs.length) return <div className="content-state">조건에 맞는 Import 작업이 없습니다.</div>
  return <div className="import-job-list">{jobs.map((job) => <article className="import-job-card" key={job.id}>
    <div><p className="dashboard__eyebrow">{job.status}</p><h2><Link to={`/imports/history/${job.id}`}>{job.sourceName ?? '이름 없는 JSON 입력'}</Link></h2><p>{job.sourceFingerprint.slice(0, 12)}… · {job.format} v{job.schemaVersion}</p></div>
    <dl><div><dt>생성</dt><dd>{formatDate(job.createdAt)}</dd></div><div><dt>시작</dt><dd>{formatDate(job.startedAt)}</dd></div><div><dt>완료 시각</dt><dd>{formatDate(job.completedAt)}</dd></div><div><dt>진행</dt><dd>{job.completedCount}/{job.totalCount} ({job.progressPercent}%)</dd></div><div><dt>성공</dt><dd>{job.successCount}</dd></div><div><dt>실패</dt><dd>{job.failedCount}</dd></div><div><dt>pending</dt><dd>{job.pendingCount}</dd></div></dl>
  </article>)}</div>
}
