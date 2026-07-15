import type { ChangeEvent } from 'react'
import { formatBackupBytes } from './formatBackupBytes'

export function BackupRestoreInput({ text, file, busy, available = true, stale, onTextChange, onFileChange, onRun, onReset }: {
  text: string
  file: File | null
  busy: boolean
  available?: boolean
  stale: boolean
  onTextChange: (value: string) => void
  onFileChange: (file: File | null) => void
  onRun: () => void
  onReset: () => void
}) {
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.target.files?.[0] ?? null)
  }
  return (
    <section className="backup-panel" aria-labelledby="restore-input-title">
      <h2 id="restore-input-title">백업 입력</h2>
      <p className="field-help">파일은 브라우저에서만 읽으며 외부 서버로 전송하지 않습니다. 파일과 text 중 마지막으로 선택한 입력만 사용합니다.</p>
      <label className="field-label" htmlFor="backup-restore-file">JSON 파일</label>
      <input id="backup-restore-file" type="file" accept="application/json,.json" disabled={busy} onChange={selectFile} />
      {file ? <p className="backup-file-info"><strong>{file.name}</strong> · {formatBackupBytes(file.size)}</p> : null}
      <div className="backup-input-divider" aria-hidden="true">또는</div>
      <label className="field-label" htmlFor="backup-restore-text">백업 JSON text</label>
      <textarea id="backup-restore-text" rows={12} value={text} disabled={busy} placeholder="{ &quot;format&quot;: &quot;daily-brief-note-backup&quot;, ... }" onChange={(event) => onTextChange(event.target.value)} />
      {stale ? <p className="field-warning" role="status">입력이 변경되어 이전 검사 결과를 초기화했습니다.</p> : null}
      <div className="backup-actions">
        <button className="primary-button" type="button" disabled={!available || busy || (!file && !text.trim())} onClick={onRun}>{busy ? '복원 Dry Run 검사 중' : '복원 Dry Run 검사'}</button>
        <button className="secondary-button" type="button" disabled={busy || (!file && !text)} onClick={onReset}>입력 초기화</button>
      </div>
    </section>
  )
}
