import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../features/auth/useAuth'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { executeRestoreRecords } from '../features/backups/executeRestoreJob'
import { getRestoreJobRecords } from '../features/backups/restoreExecution.repository'
import { restoreJobQueryKeys, useCancelRestoreJobMutation, useRestoreJobQuery, useRestoreJobRecordsQuery, useResumeRestoreJobMutation } from '../features/backups/restoreExecution.queries'
import type { RestoreRecordFilters } from '../features/backups/restoreExecution.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function BackupRestoreJobDetailPageContent({ client = supabase, userId = '', jobId }: { client?: DatabaseClient | null; userId?: string; jobId: string }) {
  const queryClient = useQueryClient(); const stop = useRef(false)
  const [filters, setFilters] = useState<RestoreRecordFilters>({})
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ completed: number; total: number; current: string | null } | null>(null)
  const job = useRestoreJobQuery(client, userId, jobId); const records = useRestoreJobRecordsQuery(client, userId, jobId, filters)
  const cancelMutation = useCancelRestoreJobMutation(client, userId, jobId); const resumeMutation = useResumeRestoreJobMutation(client, userId, jobId)
  async function refresh() { await Promise.all([job.refetch(), records.refetch()]); void queryClient.invalidateQueries({ queryKey: restoreJobQueryKeys.all }) }
  async function run(mode: 'pending' | 'failed') {
    if (!client || busy) return
    stop.current = false; setBusy(true); setMessage(null)
    try {
      let processed = 0
      while (!stop.current) {
        const current = await getRestoreJobRecords(client, jobId)
        const result = await executeRestoreRecords(client, current, mode, { shouldStop: () => stop.current, onProgress: setProgress })
        processed += result.processed
        if (result.processed === 0 || mode === 'failed') break
        const latest = await getRestoreJobRecords(client, jobId)
        if (latest.some((record) => record.status === 'failed')) break
      }
      setMessage(`${processed}개 record 처리를 마치고 DB 상태를 다시 조회했습니다.`)
    } catch { setMessage('네트워크 응답을 확정할 수 없어 실행을 멈췄습니다. 성공 record는 재실행하지 않고 DB 상태를 다시 조회합니다.') }
    finally { setProgress(null); await refresh(); setBusy(false) }
  }
  async function cancel() { if (!window.confirm('취소는 rollback이 아닙니다. pending record만 취소하고 이미 복원된 row는 유지합니다.')) return; stop.current = true; setBusy(true); try { await cancelMutation.mutateAsync(); setMessage('남은 pending record를 취소했습니다.') } finally { await refresh(); setBusy(false) } }
  async function resume() { setBusy(true); try { await resumeMutation.mutateAsync(); setMessage('DB stale 검사를 통과해 cancelled record를 pending으로 복원했습니다.') } catch { setMessage('DB 상태가 변경되어 재개하지 못했습니다. 새 계획이 필요할 수 있습니다.') } finally { await refresh(); setBusy(false) } }
  async function copy(failedOnly: boolean) { const all = client ? await getRestoreJobRecords(client, jobId) : []; const selected = failedOnly ? all.filter((item) => item.status === 'failed') : all; const text = failedOnly ? selected.map((item) => `${item.stageKey}/${item.section} ${item.safeDisplay}: ${item.errorCode ?? ''} ${item.errorMessage ?? ''}`.trim()).join('\n') : JSON.stringify({ job: job.data, records: selected }, null, 2); try { await copyTextToClipboard(text); setMessage(failedOnly ? '실패 목록을 복사했습니다.' : '결과 JSON을 복사했습니다.') } catch { setMessage('결과를 복사하지 못했습니다.') } }
  if (job.isPending) return <div className="content-state" role="status">복원 작업을 불러오고 있습니다.</div>
  if (job.isError || records.isError) return <div className="content-state content-state--error" role="alert">복원 작업을 불러오지 못했습니다.</div>
  if (!job.data) return <div className="content-state"><h1>복원 작업을 찾을 수 없습니다</h1><Link to="/backups/restore/jobs">작업 목록</Link></div>
  const value = job.data
  const operationalIncluded = value.backupProfile === 'full' && typeof value.policies === 'object' && value.policies !== null && !Array.isArray(value.policies)
    && (value.policies as { operationalHistory?: unknown }).operationalHistory === 'include'
  const operationalRecords = (records.data ?? []).filter((record) => ['importJobs', 'importJobItems', 'importJobItemAttempts'].includes(record.section))
  return <section className="content-page" aria-labelledby="restore-job-title"><div className="content-page__heading"><div><p className="dashboard__eyebrow">{value.status}</p><h1 id="restore-job-title">{value.sourceName ?? '이름 없는 backup'}</h1><p>checksum {value.backupChecksum.slice(0, 12)}… · plan {value.planFingerprint.slice(0, 12)}…</p></div><Link className="secondary-button" to="/backups/restore/jobs">작업 목록</Link></div>
    {message ? <p className="form-alert" role="status">{message}</p> : null}{progress ? <p role="status">{progress.current ?? '상태 갱신 중'} · {progress.completed}/{progress.total}</p> : null}
    <section className="backup-panel"><h2>진행률</h2><dl className="backup-summary-grid"><div><dt>전체</dt><dd>{value.totalCount}</dd></div><div><dt>진행률</dt><dd>{value.progressPercent}%</dd></div><div><dt>현재 stage</dt><dd>{value.currentStageKey ?? '-'}</dd></div><div><dt>stage 진행률</dt><dd>{value.stageProgressPercent}%</dd></div><div><dt>applied</dt><dd>{value.appliedCount}</dd></div><div><dt>reused</dt><dd>{value.reusedCount}</dd></div><div><dt>skipped</dt><dd>{value.skippedCount}</dd></div><div><dt>failed</dt><dd>{value.failedCount}</dd></div></dl><div className="backup-actions"><button className="primary-button" type="button" disabled={busy || !['ready','running'].includes(value.status)} onClick={() => void run('pending')}>{value.startedAt ? '계속 실행' : '실행 시작'}</button><button className="secondary-button" type="button" disabled={busy || !value.retryableFailureCount} onClick={() => void run('failed')}>현재 stage 실패 재시도</button><button className="secondary-button" type="button" disabled={busy || ['completed','cancelled','failed'].includes(value.status)} onClick={() => void cancel()}>작업 취소</button><button className="secondary-button" type="button" disabled={busy || value.status !== 'cancelled'} onClick={() => void resume()}>취소 작업 재개</button></div><p className="field-help">브라우저가 닫혀 있는 동안 진행하지 않습니다. 취소와 실패는 이미 적용한 row를 rollback하지 않습니다.</p></section>
    {operationalIncluded ? <section className="backup-panel"><h2>Import 운영 이력 stage</h2><dl className="backup-summary-grid"><div><dt>전체</dt><dd>{operationalRecords.length}</dd></div><div><dt>applied</dt><dd>{operationalRecords.filter((record) => record.status === 'applied').length}</dd></div><div><dt>reused</dt><dd>{operationalRecords.filter((record) => record.status === 'reused').length}</dd></div><div><dt>skipped</dt><dd>{operationalRecords.filter((record) => record.status === 'skipped').length}</dd></div><div><dt>failed</dt><dd>{operationalRecords.filter((record) => record.status === 'failed').length}</dd></div></dl><p className="field-help">신규 Import job은 백업 provenance와 실행 잠금을 가진 조회 전용 과거 이력입니다. 운영 stage 실패 시에도 core 복원 결과는 유지됩니다.</p></section> : null}
    <section className="backup-panel"><h2>Metadata와 정책</h2><p>backup {value.backupFormat} v{value.backupSchemaVersion} ({value.backupProfile}) · plan v{value.planVersion}</p><details><summary>정책</summary><pre>{JSON.stringify(value.policies, null, 2)}</pre></details><details><summary>Category mapping</summary><pre>{JSON.stringify(value.categoryMappings, null, 2)}</pre></details><div className="backup-actions"><button className="secondary-button" type="button" onClick={() => void copy(false)}>결과 JSON 복사</button><button className="secondary-button" type="button" onClick={() => void copy(true)}>실패 목록 복사</button></div></section>
    <section className="backup-panel"><h2>Record</h2><div className="content-toolbar"><label>stage<input value={filters.stage ?? ''} onChange={(event) => setFilters({ ...filters, stage: event.target.value })} /></label><label>section<input value={filters.section ?? ''} onChange={(event) => setFilters({ ...filters, section: event.target.value })} /></label><label>action<select value={filters.action ?? ''} onChange={(event) => setFilters({ ...filters, action: event.target.value })}><option value="">전체</option>{['create','preserve_id','remap_id','reuse_existing','skip'].map((item) => <option key={item}>{item}</option>)}</select></label><label>status<select value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">전체</option>{['pending','running','applied','reused','skipped','failed','cancelled'].map((item) => <option key={item}>{item}</option>)}</select></label><label>retryable<select value={filters.retryable === undefined ? '' : String(filters.retryable)} onChange={(event) => setFilters({ ...filters, retryable: event.target.value === '' ? undefined : event.target.value === 'true' })}><option value="">전체</option><option value="true">재시도 가능</option><option value="false">재시도 불가</option></select></label><label>검색<input value={filters.search ?? ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label></div>
      {records.isPending ? <p role="status">record를 불러오고 있습니다.</p> : null}<ul className="backup-result-list">{records.data?.map((record) => <li key={record.id}><strong>{record.status}</strong><span>{record.stageOrder}.{record.sequenceNo} {record.stageKey} / {record.section} / {record.action}<br />{record.safeDisplay} · {record.sourceId.slice(0, 12)} → {record.targetId?.slice(0, 12) ?? '-'}</span><small>attempt {record.attemptCount}{record.errorCode ? ` · ${record.errorCode} ${record.errorMessage ?? ''}` : ''}{record.section === 'posts' && record.targetId && ['applied','reused'].includes(record.status) ? <> · <Link to={`/content/${record.targetId}`}>게시물 열기</Link></> : null}</small></li>)}</ul></section>
  </section>
}
export function BackupRestoreJobDetailPage() { const { user } = useAuth(); const { jobId = '' } = useParams(); return <BackupRestoreJobDetailPageContent userId={user?.id ?? ''} jobId={jobId} /> }
