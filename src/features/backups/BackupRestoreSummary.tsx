import { useMemo, useState } from 'react'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import { BACKUP_RESTORE_LIST_LIMIT } from './backupRestore.constants'
import type { BackupRestoreResult, RestoreIssueSeverity } from './backupRestore.types'

const statusLabels = { restorable: '복원 가능', warning: '경고 있음', not_restorable: '복원 불가' } as const

export function BackupRestoreSummary({ result }: { result: BackupRestoreResult }) {
  const [severity, setSeverity] = useState<RestoreIssueSeverity | ''>('')
  const [section, setSection] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const sections = [...new Set(result.issues.map((item) => item.section))].sort()
  const issues = useMemo(() => result.issues.filter((item) => (!severity || item.severity === severity) && (!section || item.section === section)).slice(0, BACKUP_RESTORE_LIST_LIMIT), [result.issues, section, severity])
  async function copy(value: string, success: string) {
    try { await copyTextToClipboard(value); setMessage(success) } catch { setMessage('클립보드에 복사하지 못했습니다.') }
  }
  return (
    <>
      <section className={`backup-panel backup-final-status is-${result.status}`} aria-labelledby="backup-restore-status-title">
        <p className="dashboard__eyebrow">Restore dry run result</p>
        <h2 id="backup-restore-status-title">{statusLabels[result.status]}</h2>
        <dl className="backup-summary-grid">
          <div><dt>오류</dt><dd>{result.summary.errorCount}</dd></div><div><dt>경고</dt><dd>{result.summary.warningCount}</dd></div>
          <div><dt>동일 데이터 후보</dt><dd>{result.summary.exactConflicts}</dd></div><div><dt>ID remap 후보</dt><dd>{result.summary.idRemapCandidates}</dd></div>
        </dl>
        <p className="field-help">이 검사는 DB에 INSERT·UPDATE·DELETE를 수행하지 않습니다. 실제 복원은 Phase 4B-3 이후 단계입니다.</p>
        <div className="backup-actions">
          <button className="secondary-button" type="button" disabled={!result.restoreAnalysis} onClick={() => void copy(JSON.stringify(result.restoreAnalysis, null, 2), 'restore analysis JSON을 복사했습니다.')}>restore analysis JSON 복사</button>
          <button className="secondary-button" type="button" onClick={() => void copy(JSON.stringify(result.issues, null, 2), '문제 목록을 복사했습니다.')}>문제 목록 복사</button>
        </div>
        {message ? <p role="status" className="field-help">{message}</p> : null}
      </section>
      <section className="backup-panel" aria-labelledby="backup-issues-title">
        <h2 id="backup-issues-title">문제 목록</h2>
        <div className="backup-filter-row">
          <label>심각도<select value={severity} onChange={(event) => setSeverity(event.target.value as RestoreIssueSeverity | '')}><option value="">전체</option><option value="error">error</option><option value="warning">warning</option><option value="info">info</option></select></label>
          <label>Section<select value={section} onChange={(event) => setSection(event.target.value)}><option value="">전체</option>{sections.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <ul className="backup-result-list">{issues.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}><strong>{item.severity}</strong><span><code>{item.code}</code> {item.message}</span><small>{item.section} · {item.path}{item.recordId ? ` · ID ${item.recordId}` : ''}</small></li>)}</ul>
        {!issues.length ? <p className="empty-state">표시할 문제가 없습니다.</p> : null}
      </section>
    </>
  )
}
