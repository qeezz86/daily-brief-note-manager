import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { BackupDownloadPanel } from '../features/backups/BackupDownloadPanel'
import { BackupGenerationProgress } from '../features/backups/BackupGenerationProgress'
import { BackupManifestSummary } from '../features/backups/BackupManifestSummary'
import { BackupProfileSelector } from '../features/backups/BackupProfileSelector'
import { buildBackupBundle } from '../features/backups/buildBackupBundle'
import { useBackupEstimateQuery } from '../features/backups/backup.queries'
import { getBackupSnapshot } from '../features/backups/backup.repository'
import type { BackupProfile, BuiltBackup } from '../features/backups/backup.types'
import { scanBackupForSecrets } from '../features/backups/scanBackupForSecrets'
import { validateBackupRelationships } from '../features/backups/validateBackupRelationships'
import { formatBackupBytes } from '../features/backups/formatBackupBytes'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

function appVersion() {
  return import.meta.env.VITE_APP_VERSION?.trim() || null
}

export function BackupPageContent({
  client = supabase,
  userId = '',
}: {
  client?: DatabaseClient | null
  userId?: string
}) {
  const [profile, setProfile] = useState<BackupProfile>('core')
  const [backup, setBackup] = useState<BuiltBackup | null>(null)
  const [busy, setBusy] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const estimate = useBackupEstimateQuery(client, userId, profile)

  function changeProfile(next: BackupProfile) {
    setProfile(next)
    setBackup(null)
    setCurrentStep(-1)
    setError(null)
  }

  async function generate() {
    if (!client || busy || !userId) return
    setBusy(true)
    setBackup(null)
    setError(null)
    setCurrentStep(0)
    try {
      const snapshot = await getBackupSnapshot(client, profile)
      setCurrentStep(1)
      if (!validateBackupRelationships(snapshot).valid) throw new Error('relationship')
      setCurrentStep(2)
      if (scanBackupForSecrets(snapshot).length) throw new Error('secret')
      setCurrentStep(3)
      await Promise.resolve()
      setCurrentStep(4)
      const built = await buildBackupBundle(snapshot, { appVersion: appVersion() })
      setBackup(built)
      setCurrentStep(5)
    } catch {
      setCurrentStep(-1)
      setError('백업 생성 또는 무결성 검증에 실패했습니다. 데이터는 다운로드되지 않았습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-page backup-page" aria-labelledby="backup-page-title">
      <div className="content-page__heading">
        <div>
          <p className="dashboard__eyebrow">Verified JSON export</p>
          <h1 id="backup-page-title">백업</h1>
          <p>현재 계정의 애플리케이션 데이터를 일관된 snapshot으로 생성하고 SHA-256 무결성을 검증합니다.</p>
        </div>
      </div>
      <div className="backup-notice"><strong>Phase 4B-1</strong><p>복원·덮어쓰기·클라우드 업로드는 포함하지 않습니다. WordPress DB·파일·이미지 백업과도 별개입니다.</p></div>
      <div className="backup-actions"><a className="secondary-button" href="/backups/restore">백업 파일 검사</a><a className="secondary-button" href="/backups/restore/new">복원 Dry Run</a></div>
      {!client ? <p className="form-alert" role="status">Supabase가 설정되지 않아 백업을 생성할 수 없습니다.</p> : null}
      <BackupProfileSelector value={profile} disabled={busy} onChange={changeProfile} />
      <section className="backup-panel" aria-labelledby="backup-estimate-title">
        <h2 id="backup-estimate-title">예상 데이터 개수</h2>
        <p className="field-help">생성 전 예상치이며 실제 snapshot 시점의 최종 manifest와 다를 수 있습니다.</p>
        {estimate.isPending ? <p role="status">예상 개수를 조회하고 있습니다.</p> : null}
        {estimate.isError ? <p className="form-alert" role="alert">예상 개수를 불러오지 못했습니다.</p> : null}
        {estimate.data ? <><div className="backup-section-counts">{Object.entries(estimate.data.sectionCounts).map(([section, count]) => <span key={section}><code>{section}</code> {count.toLocaleString()}</span>)}</div><p><strong>예상 전체:</strong> {estimate.data.totalRecords.toLocaleString()} records</p></> : null}
      </section>
      <section className="backup-panel backup-generate">
        <div><h2>백업 생성</h2><p>최종 파일은 20 MB부터 경고하며 100 MB를 초과하면 생성하지 않습니다 ({formatBackupBytes(100 * 1024 * 1024)}).</p></div>
        <button className="primary-button" type="button" disabled={!client || !userId || busy} onClick={() => void generate()}>{busy ? '백업 생성 중' : backup ? '백업 다시 생성' : '백업 생성'}</button>
      </section>
      {currentStep >= 0 ? <BackupGenerationProgress currentStep={currentStep} /> : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      {backup ? <><BackupManifestSummary backup={backup} /><BackupDownloadPanel backup={backup} /></> : null}
    </section>
  )
}

export function BackupPage() {
  const { user } = useAuth()
  return <BackupPageContent userId={user?.id ?? ''} />
}
