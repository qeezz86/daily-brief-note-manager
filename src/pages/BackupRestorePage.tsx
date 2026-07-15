import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { BackupCompatibilityPanel } from '../features/backups/BackupCompatibilityPanel'
import { BackupConflictList } from '../features/backups/BackupConflictList'
import { getBackupConflictReferenceData, getBackupRestoreCategories, getBackupRestoreTargetCollisions } from '../features/backups/backupConflicts.repository'
import { BackupRestoreInput } from '../features/backups/BackupRestoreInput'
import { BackupRestoreSummary } from '../features/backups/BackupRestoreSummary'
import type { BackupCategoryManifestEntry, BackupConflictLookupResult, BackupRestoreIssue, BackupRestoreResult, ValidatedBackupBundle } from '../features/backups/backupRestore.types'
import { buildRestorePlan } from '../features/backups/buildRestorePlan'
import { DEFAULT_RESTORE_POLICIES } from '../features/backups/restorePolicies'
import { RestorePlanSummary } from '../features/backups/RestorePlanSummary'
import { RestorePolicyForm } from '../features/backups/RestorePolicyForm'
import type { RestorePlan, RestorePolicies } from '../features/backups/restorePlan.types'
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
  const [step, setStep] = useState<'dry-run' | 'plan'>('dry-run')
  const [planContext, setPlanContext] = useState<{ bundle: ValidatedBackupBundle; categories: BackupCategoryManifestEntry[]; lookup: BackupConflictLookupResult } | null>(null)
  const [policies, setPolicies] = useState<RestorePolicies>(() => structuredClone(DEFAULT_RESTORE_POLICIES))
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [planStale, setPlanStale] = useState(false)

  function invalidate() { if (result) setStale(true); setResult(null); setInputIssues([]); setError(null); setPlanContext(null); setPlan(null); setStep('dry-run') }
  function changeText(value: string) { invalidate(); setText(value); if (value) setFile(null) }
  function changeFile(value: File | null) { invalidate(); setFile(value); if (value) setText('') }
  function reset() { setText(''); setFile(null); setResult(null); setInputIssues([]); setError(null); setStale(false); setPlanContext(null); setPlan(null); setStep('dry-run') }

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
      if (final.bundle) setPlanContext({ bundle: final.bundle, categories, lookup })
    } catch {
      setError('복원 Dry Run 검사 중 현재 설정 또는 DB 충돌 후보를 확인하지 못했습니다. 데이터는 변경되지 않았습니다.')
    } finally { setBusy(false) }
  }

  async function createPlan(nextPolicies = policies) {
    if (!planContext || !client || planBusy) return
    setPlanBusy(true); setError(null)
    try {
      const provisional = await buildRestorePlan({ ...planContext, currentCategories: planContext.categories, policies: nextPolicies })
      const remapTargets = provisional.recordActions.filter((action): action is typeof action & { targetId: string } => action.action === 'remap_id' && Boolean(action.targetId)).map((action) => ({ section: action.section, id: action.targetId }))
      const targetCheck = planContext.lookup.databaseCheck === 'complete' && remapTargets.length ? await getBackupRestoreTargetCollisions(client, remapTargets) : { databaseCheck: planContext.lookup.databaseCheck, collisions: [] }
      const finalPlan = targetCheck.collisions.length || targetCheck.databaseCheck !== planContext.lookup.databaseCheck ? await buildRestorePlan({ ...planContext, lookup: { ...planContext.lookup, databaseCheck: targetCheck.databaseCheck }, currentCategories: planContext.categories, policies: nextPolicies, targetCollisions: targetCheck.collisions }) : provisional
      setPlan(finalPlan); setPlanStale(false)
    } catch {
      setError('복원 계획을 안전하게 생성하지 못했습니다. 원본 백업과 DB 데이터는 변경되지 않았습니다.')
    } finally { setPlanBusy(false) }
  }

  function openPlan() {
    const defaults = structuredClone(DEFAULT_RESTORE_POLICIES)
    setPolicies(defaults); setStep('plan'); setPlan(null); setPlanStale(false)
    void createPlan(defaults)
  }

  function changePolicies(value: RestorePolicies) { setPolicies(value); if (plan) setPlanStale(true) }

  return (
    <section className="content-page backup-page" aria-labelledby="backup-restore-page-title">
      <div className="content-page__heading"><div><p className="dashboard__eyebrow">Read-only restore workflow</p><h1 id="backup-restore-page-title">{step === 'dry-run' ? '백업 복원 Dry Run' : '백업 복원 계획'}</h1><p>{step === 'dry-run' ? '공식 backup JSON의 checksum, schema, 관계, category 호환성과 현재 계정의 충돌 후보를 분석합니다.' : '충돌 정책, 결정적 ID remap과 실행 dependency를 확정해 Phase 4B-4용 계획을 만듭니다.'}</p></div></div>
      <div className="backup-notice"><strong>{step === 'dry-run' ? 'Phase 4B-2' : 'Phase 4B-3'}</strong><p>실제 복원, overwrite, category 생성·수정과 DB 쓰기는 수행하지 않습니다.</p></div>
      {!client ? <p className="form-alert" role="status">Supabase가 설정되지 않아 현재 DB 호환성 검사를 실행할 수 없습니다.</p> : null}
      {step === 'dry-run' ? <>
        <BackupRestoreInput text={text} file={file} busy={busy} available={Boolean(client && userId)} stale={stale} onTextChange={changeText} onFileChange={changeFile} onRun={() => void run()} onReset={reset} />
        {busy ? <section className="backup-panel" aria-live="polite"><h2>검사 진행 상태</h2><p>checksum과 local schema를 확인한 뒤 현재 DB를 100개 단위로 조회하고 있습니다.</p></section> : null}
        {inputIssues.map((issue) => <p className="form-alert" role="alert" key={issue.code}><code>{issue.code}</code> {issue.message}</p>)}
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        {result ? <><BackupRestoreSummary result={result} /><BackupCompatibilityPanel result={result} />{result.restoreAnalysis ? <BackupConflictList result={result} /> : null}{planContext ? <section className="backup-panel backup-generate"><div><h2>복원 계획 만들기</h2><p>Dry Run 결과와 현재 DB 분석을 고정 입력으로 사용합니다.</p></div><button type="button" className="primary-button" onClick={openPlan}>복원 계획 만들기</button></section> : null}</> : null}
      </> : <>
        <section className="backup-panel"><h2>Dry Run 요약</h2><p>checksum <code>{planContext?.bundle.checksum.value.slice(0, 12)}…</code> · {planContext?.bundle.profile} · DB 조회 {planContext?.lookup.databaseCheck}</p></section>
        <RestorePolicyForm policies={policies} conflicts={(plan?.recordActions ?? []).filter((action) => !['safe_new', 'policy_excluded'].includes(action.conflictType))} disabled={planBusy} onChange={changePolicies} />
        <div className="backup-actions"><button type="button" className="secondary-button" disabled={planBusy} onClick={() => setStep('dry-run')}>Dry Run으로 돌아가기</button><button type="button" className="primary-button" disabled={planBusy || !planStale} onClick={() => void createPlan()}>{planBusy ? '계획 생성 중' : '계획 다시 생성'}</button></div>
        {planBusy && !plan ? <section className="backup-panel" aria-live="polite"><h2>복원 계획 생성 중</h2><p>정책, UUID v5 remap target, 관계 graph와 fingerprint를 검증하고 있습니다.</p></section> : null}
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        {plan ? <RestorePlanSummary plan={plan} stale={planStale} /> : null}
      </>}
    </section>
  )
}

export function BackupRestorePage() { const { user } = useAuth(); return <BackupRestorePageContent userId={user?.id ?? ''} /> }
