import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useRestoreJobsQuery } from '../features/backups/restoreExecution.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function BackupRestoreJobsPageContent({ client = supabase, userId = '' }: { client?: DatabaseClient | null; userId?: string }) {
  const query = useRestoreJobsQuery(client, userId)
  return <section className="content-page" aria-labelledby="restore-jobs-title"><div className="content-page__heading"><div><p className="dashboard__eyebrow">Durable restore history</p><h1 id="restore-jobs-title">복원 작업 목록</h1><p>최근 100개 restore job의 실제 DB 집계입니다.</p></div><Link className="primary-button" to="/backups/restore/execute">Core 복원 실행</Link></div>
    {query.isPending ? <div className="content-state" role="status">복원 작업을 불러오고 있습니다.</div> : null}{query.isError ? <div className="content-state content-state--error" role="alert">복원 작업을 불러오지 못했습니다.</div> : null}
    {query.data?.length === 0 ? <div className="content-state">아직 복원 작업이 없습니다.</div> : null}
    {query.data?.length ? <div className="content-list">{query.data.map((job) => <article className="content-card" key={job.id}><div><span className="status-badge">{job.status}</span><h2><Link to={`/backups/restore/jobs/${job.id}`}>{job.sourceName ?? '이름 없는 backup'}</Link></h2><p>{job.backupProfile} · checksum {job.backupChecksum.slice(0, 12)}… · plan {job.planFingerprint.slice(0, 12)}…</p></div><dl className="backup-summary-grid"><div><dt>진행률</dt><dd>{job.progressPercent}%</dd></div><div><dt>현재 stage</dt><dd>{job.currentStageKey ?? '-'}</dd></div><div><dt>성공</dt><dd>{job.appliedCount + job.reusedCount + job.skippedCount}</dd></div><div><dt>실패</dt><dd>{job.failedCount}</dd></div></dl></article>)}</div> : null}
  </section>
}
export function BackupRestoreJobsPage() { const { user } = useAuth(); return <BackupRestoreJobsPageContent userId={user?.id ?? ''} /> }
