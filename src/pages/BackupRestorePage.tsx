import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { BackupCompatibilityPanel } from '../features/backups/BackupCompatibilityPanel'
import { BackupConflictList } from '../features/backups/BackupConflictList'
import { getBackupConflictReferenceData, getBackupRestoreCategories } from '../features/backups/backupConflicts.repository'
import { BackupRestoreInput } from '../features/backups/BackupRestoreInput'
import { BackupRestoreSummary } from '../features/backups/BackupRestoreSummary'
import type { BackupRestoreIssue, BackupRestoreResult } from '../features/backups/backupRestore.types'
import { parseBackupFile, parseBackupText } from '../features/backups/parseBackupFile'
import { validateBackupForRestore } from '../features/backups/validateBackupForRestore'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

function appVersion() { return import.meta.env.VITE_APP_VERSION?.trim() || null }

export function BackupRestorePageContent({ client = supabase, userId = '' }: { client?: DatabaseClient | null; userId?: string }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [result, setResult] = useState<BackupRestoreResult | null>(null)
  const [inputIssues, setInputIssues] = useState<BackupRestoreIssue[]>([])
  const [error, setError] = useState<string | null>(null)

  function invalidate() { if (result) setStale(true); setResult(null); setInputIssues([]); setError(null) }
  function changeText(value: string) { invalidate(); setText(value); if (value) setFile(null) }
  function changeFile(value: File | null) { invalidate(); setFile(value); if (value) setText('') }
  function reset() { setText(''); setFile(null); setResult(null); setInputIssues([]); setError(null); setStale(false) }

  async function run() {
    if (!client || !userId || busy) return
    setBusy(true); setResult(null); setInputIssues([]); setError(null); setStale(false)
    try {
      const parsed = file ? await parseBackupFile(file) : parseBackupText(text)
      if (parsed.issues.length || parsed.value === null) { setInputIssues(parsed.issues); return }
      const categories = await getBackupRestoreCategories(client)
      const local = await validateBackupForRestore(parsed.value, { currentCategories: categories, currentAppVersion: appVersion() })
      if (!local.bundle || !local.canQueryDatabase) { setResult(local.result); return }
      const lookup = await getBackupConflictReferenceData(client, local.bundle)
      const final = await validateBackupForRestore(parsed.value, { currentCategories: categories, lookup, currentAppVersion: appVersion() })
      setResult(final.result)
    } catch {
      setError('복원 Dry Run 검사 중 현재 설정 또는 DB 충돌 후보를 확인하지 못했습니다. 데이터는 변경되지 않았습니다.')
    } finally { setBusy(false) }
  }

  return (
    <section className="content-page backup-page" aria-labelledby="backup-restore-page-title">
      <div className="content-page__heading"><div><p className="dashboard__eyebrow">Read-only compatibility check</p><h1 id="backup-restore-page-title">백업 복원 Dry Run</h1><p>공식 backup JSON의 checksum, schema, 관계, category 호환성과 현재 계정의 충돌 후보를 분석합니다.</p></div></div>
      <div className="backup-notice"><strong>Phase 4B-2</strong><p>실제 복원, overwrite, category 생성, UUID remap과 DB 쓰기는 수행하지 않습니다.</p></div>
      {!client ? <p className="form-alert" role="status">Supabase가 설정되지 않아 현재 DB 호환성 검사를 실행할 수 없습니다.</p> : null}
      <BackupRestoreInput text={text} file={file} busy={busy} available={Boolean(client && userId)} stale={stale} onTextChange={changeText} onFileChange={changeFile} onRun={() => void run()} onReset={reset} />
      {busy ? <section className="backup-panel" aria-live="polite"><h2>검사 진행 상태</h2><p>checksum과 local schema를 확인한 뒤 현재 DB를 100개 단위로 조회하고 있습니다.</p></section> : null}
      {inputIssues.map((issue) => <p className="form-alert" role="alert" key={issue.code}><code>{issue.code}</code> {issue.message}</p>)}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      {result ? <><BackupRestoreSummary result={result} /><BackupCompatibilityPanel result={result} />{result.restoreAnalysis ? <BackupConflictList result={result} /> : null}</> : null}
    </section>
  )
}

export function BackupRestorePage() { const { user } = useAuth(); return <BackupRestorePageContent userId={user?.id ?? ''} /> }
