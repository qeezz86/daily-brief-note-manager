import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../features/auth/useAuth'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { executeImportJob, type ImportJobExecutionProgress } from '../features/imports/executeImportJob'
import { ImportJobActions } from '../features/imports/ImportJobActions'
import { ImportJobItemList } from '../features/imports/ImportJobItemList'
import { ImportJobProgress } from '../features/imports/ImportJobProgress'
import { importJobQueryKeys, useCancelImportJobMutation, useImportJobItemsQuery, useImportJobQuery, useResumeImportJobMutation } from '../features/imports/importJobs.queries'
import type { ImportJobExecutionMode } from '../features/imports/importJobs.types'
import { newsFollowupQueryKeys } from '../features/newsFollowups/newsFollowups.queries'
import { newsTopicQueryKeys } from '../features/newsTopics/newsTopics.queries'
import { newsUpdateQueryKeys } from '../features/newsUpdates/newsUpdates.queries'
import { postQueryKeys } from '../features/posts/posts.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function ImportJobDetailPageContent({ client = supabase, userId = '', jobId }: { client?: DatabaseClient | null; userId?: string; jobId: string }) {
  const queryClient = useQueryClient()
  const jobQuery = useImportJobQuery(client, userId, jobId)
  const itemsQuery = useImportJobItemsQuery(client, userId, jobId)
  const cancelMutation = useCancelImportJobMutation(client, userId, jobId)
  const resumeMutation = useResumeImportJobMutation(client, userId, jobId)
  const stopRef = useRef(false)
  const [progress, setProgress] = useState<ImportJobExecutionProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh() {
    await Promise.all([jobQuery.refetch(), itemsQuery.refetch()])
    void queryClient.invalidateQueries({ queryKey: importJobQueryKeys.all })
  }

  async function run(mode: ImportJobExecutionMode) {
    if (!client || !itemsQuery.data || busy) return
    stopRef.current = false; setBusy(true); setMessage(null)
    try {
      const result = await executeImportJob(client, itemsQuery.data, mode, { onProgress: setProgress, shouldStop: () => stopRef.current })
      setMessage(`${result.processed}개 대상 처리를 마쳤습니다. DB 상태를 새로 조회했습니다.`)
    } catch {
      setMessage('응답을 확정할 수 없어 실행을 멈췄습니다. DB 상태를 다시 조회했습니다.')
    } finally {
      await refresh(); setBusy(false); setProgress(null)
      void queryClient.invalidateQueries({ queryKey: postQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: newsTopicQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: newsUpdateQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: newsFollowupQueryKeys.all })
    }
  }

  async function cancel() {
    if (!window.confirm('아직 시작하지 않은 단계만 취소합니다. 이미 성공한 콘텐츠와 tracking은 유지됩니다.')) return
    stopRef.current = true; setBusy(true)
    try { await cancelMutation.mutateAsync(); setMessage('작업을 안전하게 취소했습니다.') } finally { await refresh(); setBusy(false) }
  }

  async function resume() { setBusy(true); try { await resumeMutation.mutateAsync(); setMessage('취소된 pending 단계를 복구했습니다.') } finally { await refresh(); setBusy(false) } }

  async function copyResult(failuresOnly: boolean) {
    const items = itemsQuery.data ?? []
    const selected = failuresOnly ? items.filter((item) => item.overallStatus === 'failed') : items
    const value = failuresOnly
      ? selected.map((item) => `${item.itemIndex + 1}. ${item.title}: ${item.trackingErrorCode ?? item.contentErrorCode ?? ''} ${item.trackingErrorMessage ?? item.contentErrorMessage ?? ''}`.trim()).join('\n')
      : JSON.stringify({ job: jobQuery.data, items: selected.map(({ attempts, ...item }) => ({ ...item, attempts })) }, null, 2)
    try { await copyTextToClipboard(value); setMessage(failuresOnly ? '실패 목록을 복사했습니다.' : '작업 결과 JSON을 복사했습니다.') } catch { setMessage('결과를 복사하지 못했습니다.') }
  }

  if (jobQuery.isPending || itemsQuery.isPending) return <div className="content-state" role="status">Import 작업을 불러오고 있습니다.</div>
  if (jobQuery.isError || itemsQuery.isError) return <div className="content-state content-state--error" role="alert">Import 작업을 불러오지 못했습니다.</div>
  if (!jobQuery.data) return <div className="content-state"><h1>Import 작업을 찾을 수 없습니다</h1><Link to="/imports/history">작업 이력으로</Link></div>
  const job = jobQuery.data
  return <section className="content-page" aria-labelledby="import-job-detail-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">{job.status}{job.restoredFromBackup ? ' · 복원된 과거 이력' : ''}</p><h1 id="import-job-detail-title">{job.sourceName ?? '이름 없는 Import 작업'}</h1><p>{job.sourceFingerprint} · schema v{job.schemaVersion}</p>{job.executionLocked ? <p>실행 잠금 · restore origin {job.restoreOriginChecksum?.slice(0, 12) ?? '-'}…</p> : null}</div><Link className="secondary-button" to="/imports/history">작업 이력</Link></div>
    {message ? <p className="form-alert" role="status">{message}</p> : null}
    {progress ? <p role="status">{progress.currentTitle ?? '상태 갱신 중'} · {progress.completed}/{progress.total}</p> : null}
    <ImportJobProgress job={job} />
    <ImportJobActions job={job} busy={busy} onExecute={(mode) => void run(mode)} onCancel={() => void cancel()} onResume={() => void resume()} />
    <section className="import-panel"><h2>결과 복사</h2><div className="form-actions"><button className="secondary-button" type="button" onClick={() => void copyResult(false)}>결과 JSON 복사</button><button className="secondary-button" type="button" onClick={() => void copyResult(true)}>실패 목록 plain text 복사</button></div></section>
    <ImportJobItemList items={itemsQuery.data ?? []} />
  </section>
}

export function ImportJobDetailPage() { const { user } = useAuth(); const { jobId = '' } = useParams(); return <ImportJobDetailPageContent userId={user?.id ?? ''} jobId={jobId} /> }
