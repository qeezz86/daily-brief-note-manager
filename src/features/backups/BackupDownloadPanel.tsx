import { useState } from 'react'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import {
  BACKUP_CSV_DATASETS,
  createBackupCsvFileName,
  serializeBackupCsv,
  type BackupCsvDatasetId,
} from './backupCsv'
import { downloadBackupCsvFile, downloadBackupFile } from './downloadBackupFile'
import type { BuiltBackup } from './backup.types'

export function BackupDownloadPanel({ backup }: { backup: BuiltBackup }) {
  const [message, setMessage] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const checksum = backup.bundle.checksum.value
  const manifestJson = JSON.stringify(backup.bundle.manifest, null, 2)

  async function copy(value: string, success: string) {
    try {
      await copyTextToClipboard(value)
      setMessage(success)
    } catch {
      setMessage('클립보드에 복사하지 못했습니다.')
    }
  }

  function downloadCsv(datasetId: BackupCsvDatasetId) {
    setCsvError(null)
    try {
      downloadBackupCsvFile(
        serializeBackupCsv(backup, datasetId),
        createBackupCsvFileName(backup, datasetId),
      )
    } catch {
      const dataset = BACKUP_CSV_DATASETS.find((item) => item.id === datasetId)
      setCsvError(`${dataset?.fileNameId ?? '선택한'} CSV 다운로드를 준비하지 못했습니다. 다시 시도해 주세요.`)
    }
  }

  return (
    <section className="backup-panel" aria-labelledby="backup-download-title">
      <h2 id="backup-download-title">다운로드</h2>
      <p className="backup-checksum"><strong>SHA-256</strong><code>{checksum}</code></p>
      <p className="field-help">같은 생성 결과는 여러 번 다운로드해도 파일 내용과 checksum이 바뀌지 않습니다.</p>
      <div className="backup-actions">
        <button className="primary-button" type="button" onClick={() => downloadBackupFile(backup.json, backup.fileName)}>JSON 다운로드</button>
        <button className="secondary-button" type="button" onClick={() => downloadCsv('posts')}>posts CSV 다운로드</button>
        <button className="secondary-button" type="button" onClick={() => downloadCsv('news_topics')}>news topics CSV 다운로드</button>
        <button className="secondary-button" type="button" onClick={() => downloadCsv('follow_ups')}>follow-ups CSV 다운로드</button>
        <button className="secondary-button" type="button" onClick={() => downloadCsv('sources')}>sources CSV 다운로드</button>
        <button className="secondary-button" type="button" onClick={() => void copy(checksum, 'checksum을 복사했습니다.')}>checksum 복사</button>
        <button className="secondary-button" type="button" onClick={() => void copy(manifestJson, 'manifest JSON을 복사했습니다.')}>manifest JSON 복사</button>
      </div>
      {csvError ? <p className="form-alert" role="alert">{csvError}</p> : null}
      {message ? <p className="field-help" role="status">{message}</p> : null}
    </section>
  )
}
