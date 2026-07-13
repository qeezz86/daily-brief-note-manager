import { useRef, useState } from 'react'
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_POSTS } from './importValidation.constants'

export interface ImportInputMetadata { fileName: string | null; fileSize: number | null }

export function ImportInputForm({ disabled, onValidate, onReset }: {
  disabled: boolean
  onValidate: (text: string, metadata: ImportInputMetadata) => Promise<void>
  onReset: () => void
}) {
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  function changeMode(next: 'file' | 'text') {
    setMode(next); setFile(null); setText(''); setError(null); onReset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  function reset() {
    setFile(null); setText(''); setError(null); onReset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  async function submit() {
    setError(null)
    if (mode === 'file') {
      if (!file) { setError('JSON 파일을 선택해 주세요.'); return }
      if (!file.name.toLocaleLowerCase('en-US').endsWith('.json')) { setError('.json 확장자 파일만 사용할 수 있습니다.'); return }
      if (file.size === 0) { setError('빈 파일은 검증할 수 없습니다.'); return }
      if (file.size > MAX_IMPORT_FILE_BYTES) { setError(`파일은 최대 ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB까지 사용할 수 있습니다.`); return }
      try {
        const value = await file.text()
        if (value.includes('\uFFFD')) { setError('UTF-8로 읽을 수 없는 문자가 포함되어 있습니다.'); return }
        await onValidate(value, { fileName: file.name, fileSize: file.size })
      } catch { setError('파일을 읽지 못했습니다.') }
      return
    }
    if (!text.trim()) { setError('검증할 JSON text를 입력해 주세요.'); return }
    await onValidate(text, { fileName: null, fileSize: new TextEncoder().encode(text).byteLength })
  }
  return (
    <section className="import-panel" aria-labelledby="import-input-title">
      <h2 id="import-input-title">Import 입력</h2>
      <p>브라우저에서만 파일을 읽으며 서버나 외부 서비스로 전송하지 않습니다. 최대 {MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB, {MAX_IMPORT_POSTS.toLocaleString()}개 게시물까지 검증합니다.</p>
      <div className="segmented-control import-mode" aria-label="입력 방식">
        <button type="button" aria-pressed={mode === 'file'} onClick={() => changeMode('file')}>JSON 파일</button>
        <button type="button" aria-pressed={mode === 'text'} onClick={() => changeMode('text')}>JSON text</button>
      </div>
      {mode === 'file' ? <label className="import-input-field">JSON 파일<input ref={fileInputRef} type="file" accept=".json,application/json" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); onReset() }} />{file ? <small>{file.name} · {file.size.toLocaleString()} bytes</small> : null}</label> : <label className="import-input-field">JSON text<textarea rows={14} value={text} placeholder={'{\n  "format": "daily-brief-note-content-import",\n  "schemaVersion": 1,\n  "posts": []\n}'} onChange={(event) => { setText(event.target.value); setError(null); onReset() }} /></label>}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      <div className="detail-actions"><button className="primary-button" type="button" disabled={disabled} onClick={() => void submit()}>{disabled ? '검증 중' : 'Dry Run 검증'}</button><button className="secondary-button" type="button" disabled={disabled || (!file && !text)} onClick={reset}>입력 초기화</button></div>
    </section>
  )
}
