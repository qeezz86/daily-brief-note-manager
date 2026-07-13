import { useState } from 'react'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import type { ImportItemValidationResult } from './importValidation.types'

export function ImportDryRunDetail({ item }: { item: ImportItemValidationResult }) {
  const [copyState, setCopyState] = useState<string | null>(null)
  async function copy(value: string, message: string) {
    try {
      await copyTextToClipboard(value)
      setCopyState(message)
    } catch {
      setCopyState('복사하지 못했습니다.')
    }
  }
  const issueText = item.issues.map((issue) => `[${issue.severity.toUpperCase()}] ${issue.code} ${issue.path}: ${issue.message}`).join('\n')
  return (
    <div className="import-detail">
      <div className="import-detail__actions">
        <button className="secondary-button" type="button" onClick={() => void copy(JSON.stringify(item, null, 2), '항목 결과를 복사했습니다.')}>항목 JSON 복사</button>
        <button className="secondary-button" type="button" disabled={!issueText} onClick={() => void copy(issueText, '오류 목록을 복사했습니다.')}>문제 목록 복사</button>
      </div>
      {copyState ? <p className="field-help" role="status">{copyState}</p> : null}
      <section><h4>오류·경고</h4>{item.issues.length ? <ul className="import-issue-list">{item.issues.map((issue) => <li className={`import-issue import-issue--${issue.severity}`} key={`${issue.code}-${issue.path}-${issue.relatedValue ?? ''}`}><strong>{issue.severity} · {issue.code}</strong><span>{issue.message}</span><code>{issue.path}</code>{issue.existingRecordSummary ? <small>기존 콘텐츠: {issue.existingRecordSummary.title} · {issue.existingRecordSummary.categoryId} · {issue.existingRecordSummary.publishedOn ?? '발행일 없음'}</small> : null}</li>)}</ul> : <p>발견된 문제가 없습니다.</p>}</section>
      <section><h4>정규화 미리보기</h4><pre className="import-json-preview">{JSON.stringify(item.normalizedPreview, null, 2)}</pre></section>
      <p className="field-help">HTML 원문은 표시하거나 복사하지 않습니다. 존재 여부, 길이와 checksum만 포함합니다.</p>
    </div>
  )
}

