import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { loadRestoreExecutionModule, type RestoreExecutionModule } from '../features/backups/restoreExecution.loader'
import type { RestoreExecutionValidation } from '../features/backups/validateRestoreExecution'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function BackupRestoreExecutePageContent({
  client = supabase,
  userId = '',
  loadExecutionModule = loadRestoreExecutionModule,
}: {
  client?: DatabaseClient | null
  userId?: string
  loadExecutionModule?: () => Promise<RestoreExecutionModule>
}) {
  const navigate = useNavigate()
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [planFile, setPlanFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<RestoreExecutionValidation | null>(null)
  const [recordCount, setRecordCount] = useState(0)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [moduleLoading, setModuleLoading] = useState(false)
  const [moduleLoadError, setModuleLoadError] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  function invalidate() {
    setValidation(null)
    setRecordCount(0)
    setConfirmation('')
    setMessage(null)
    setModuleLoadError(false)
  }
  async function validate() {
    if (!client || !userId || !backupFile || !planFile || busy) return
    setBusy(true); setModuleLoading(true); setModuleLoadError(false); setMessage(null)
    let executionModule: RestoreExecutionModule
    try {
      executionModule = await loadExecutionModule()
      if (!mountedRef.current) return
    } catch {
      if (mountedRef.current) {
        setModuleLoadError(true)
        setBusy(false)
      }
      return
    } finally {
      if (mountedRef.current) setModuleLoading(false)
    }
    setMessage('backup checksum과 plan fingerprint를 확인하고 현재 DB 충돌을 다시 조회하고 있습니다.')
    try {
      const backup = await executionModule.parseBackupFile(backupFile)
      if (!mountedRef.current) return
      if (backup.value === null || backup.issues.length) { setValidation({ valid: false, issues: backup.issues.map((issue) => ({ code: issue.code, message: issue.message })), bundle: null, plan: null, categories: [] }); return }
      const planValue = JSON.parse(await planFile.text()) as unknown
      if (!mountedRef.current) return
      const checked = await executionModule.validateRestoreExecution(client, backup.value, planValue)
      if (!mountedRef.current) return
      setValidation(checked)
      if (checked.valid && checked.bundle && checked.plan) {
        const records = await executionModule.buildPreparedRestoreRecords(checked.bundle, checked.plan)
        if (!mountedRef.current) return
        setRecordCount(records.length)
      }
      setMessage(checked.valid ? '실행 직전 재검증을 통과했습니다.' : '실행을 차단한 항목을 확인해 주세요.')
    } catch { if (mountedRef.current) { setValidation(null); setMessage('입력 파일을 읽거나 최신 DB 상태를 확인하지 못했습니다.') } }
    finally { if (mountedRef.current) setBusy(false) }
  }
  async function execute() {
    if (!client || !validation?.valid || !validation.bundle || !validation.plan || confirmation !== 'RESTORE' || busy) return
    setBusy(true); setModuleLoading(true); setModuleLoadError(false)
    let executionModule: RestoreExecutionModule
    try {
      executionModule = await loadExecutionModule()
      if (!mountedRef.current) return
    } catch {
      if (mountedRef.current) {
        setModuleLoadError(true)
        setBusy(false)
      }
      return
    } finally {
      if (mountedRef.current) setModuleLoading(false)
    }
    try {
      const result = await executionModule.prepareRestoreExecution(client, { bundle: validation.bundle, plan: validation.plan, categories: validation.categories, sourceName: backupFile?.name ?? null, onProgress: (value) => { if (mountedRef.current) setMessage(value) } })
      if (!mountedRef.current) return
      navigate(`/backups/restore/jobs/${result.jobId}`)
    } catch { if (mountedRef.current) setMessage('restore job 준비를 완료하지 못했습니다. 동일 파일로 다시 실행하면 준비 중인 job에 이어서 등록합니다.') }
    finally { if (mountedRef.current) setBusy(false) }
  }
  const plan = validation?.plan
  const includesOperationalHistory = plan?.policies?.operationalHistory === 'include' && plan?.backup?.profile === 'full'
  return <section className="content-page backup-page" aria-labelledby="restore-execute-title" aria-busy={moduleLoading}>
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">Phase 4B-4B · durable full restore</p><h1 id="restore-execute-title">백업 데이터 실제 복원</h1><p>원본 backup과 별도 restore plan을 다시 선택하고 실행 직전 DB 상태를 재검증합니다.</p></div><Link className="secondary-button" to="/backups/restore/jobs">복원 작업 목록</Link></div>
    <section className="backup-panel"><h2>실행 입력</h2><label className="field-label" htmlFor="restore-backup-file">원본 backup JSON</label><input id="restore-backup-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); invalidate() }} /><label className="field-label" htmlFor="restore-plan-file">restore plan JSON</label><input id="restore-plan-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setPlanFile(event.target.files?.[0] ?? null); invalidate() }} /><div className="backup-actions"><button className="primary-button" type="button" disabled={!backupFile || !planFile || busy || !client || !userId} onClick={() => void validate()}>{moduleLoading ? '복원 실행 도구 불러오는 중' : busy ? '재검증 중' : '실행 직전 재검증'}</button></div></section>
    {!client ? <p className="form-alert" role="alert">Supabase가 설정되지 않아 복원 실행을 준비할 수 없습니다.</p> : null}
    {moduleLoading ? <p role="status">복원 실행 도구를 불러오는 중입니다.</p> : null}
    {moduleLoadError ? <p className="form-alert" role="alert">RESTORE_MODULE_LOAD_FAILED 필요한 기능을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.</p> : null}
    {message ? <p className="form-alert" role="status">{message}</p> : null}
    {validation?.issues.map((issue) => <p className="form-alert" role="alert" key={issue.code}><code>{issue.code}</code> {issue.message}</p>)}
    {validation?.valid && plan ? <>
      <section className="backup-panel"><h2>최종 실행 요약</h2><dl className="backup-summary-grid"><div><dt>전체 실행 record</dt><dd>{recordCount}</dd></div><div><dt>생성 예정</dt><dd>{plan.summary.expectedCreateRows}</dd></div><div><dt>preserve ID</dt><dd>{plan.summary.actionCounts.preserve_id}</dd></div><div><dt>remap ID</dt><dd>{plan.summary.actionCounts.remap_id}</dd></div><div><dt>reuse</dt><dd>{plan.summary.expectedReuseRows}</dd></div><div><dt>skip</dt><dd>{plan.summary.expectedSkippedRows}</dd></div><div><dt>counter</dt><dd>{plan.summary.sectionCounts.seriesCounters ?? 0}</dd></div><div><dt>stage</dt><dd>{plan.executionStages.length}</dd></div></dl><p>checksum <code>{plan.backup.checksum.slice(0, 12)}…</code> · fingerprint <code>{plan.fingerprint.value.slice(0, 12)}…</code></p></section>
      {includesOperationalHistory ? <section className="backup-panel"><h2>Import 운영 이력</h2><dl className="backup-summary-grid"><div><dt>Import job</dt><dd>{plan.summary.sectionCounts.importJobs ?? 0}</dd></div><div><dt>Import item</dt><dd>{plan.summary.sectionCounts.importJobItems ?? 0}</dd></div><div><dt>Import attempt</dt><dd>{plan.summary.sectionCounts.importJobItemAttempts ?? 0}</dd></div></dl><p className="form-alert">신규 운영 이력은 실행 잠금 상태로 복원됩니다. 복원 후 과거 Import의 콘텐츠·tracking 실행, retry, 취소 또는 재개는 할 수 없습니다.</p></section> : null}
      <section className="backup-panel"><h2>되돌릴 수 없는 부분 성공 정책</h2><ul><li>기존 row를 overwrite하지 않습니다.</li><li>record별 transaction이므로 완료 stage는 자동 rollback되지 않습니다.</li><li>실패 record는 상세 화면에서 수동 retry합니다.</li><li>브라우저가 닫혀 있으면 실행되지 않습니다.</li><li>운영 stage가 실패해도 완료된 core 데이터는 유지됩니다.</li><li>{includesOperationalHistory ? 'restore undo는 지원하지 않습니다.' : '운영 Import 이력과 restore undo는 지원하지 않습니다.'}</li><li>취소는 아직 pending인 record만 멈추며 이미 생성된 row는 유지합니다.</li></ul><label className="field-label" htmlFor="restore-confirmation">계속하려면 RESTORE 입력</label><input id="restore-confirmation" value={confirmation} disabled={busy} autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} /><div className="backup-actions"><button className="primary-button" type="button" disabled={confirmation !== 'RESTORE' || busy} onClick={() => void execute()}>{busy ? 'restore job 준비 중' : '영구 restore job 생성'}</button></div></section>
    </> : null}
  </section>
}

export function BackupRestoreExecutePage() { const { user } = useAuth(); return <BackupRestoreExecutePageContent userId={user?.id ?? ''} /> }
