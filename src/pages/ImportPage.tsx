import { useMemo, useState } from 'react'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { ImportDryRunList } from '../features/imports/ImportDryRunList'
import { ImportDryRunSummary } from '../features/imports/ImportDryRunSummary'
import { ImportInputForm, type ImportInputMetadata } from '../features/imports/ImportInputForm'
import { useImportCategoriesQuery } from '../features/imports/importDuplicates.queries'
import {
  collectImportDuplicateCandidates,
  getImportDuplicateReferenceData,
} from '../features/imports/importDuplicates.repository'
import { ImportInputError, parseImportJsonText } from '../features/imports/importSchema'
import type { ImportValidationResult } from '../features/imports/importValidation.types'
import {
  importInputErrorResult,
  validateImportBundle,
} from '../features/imports/validateImportBundle'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const emptyDuplicateReferenceData = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }

export function ImportPageContent({ client = supabase }: { client?: DatabaseClient | null }) {
  const categoriesQuery = useImportCategoriesQuery(client)
  const [result, setResult] = useState<ImportValidationResult | null>(null)
  const [metadata, setMetadata] = useState<ImportInputMetadata | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const resultText = useMemo(() => result ? JSON.stringify(result, null, 2) : '', [result])

  function resetResult() {
    setResult(null); setMetadata(null); setCopyMessage(null)
  }
  async function validate(text: string, inputMetadata: ImportInputMetadata) {
    if (isValidating) return
    setIsValidating(true); setCopyMessage(null)
    try {
      const input = parseImportJsonText(text)
      const lookup = client
        ? await getImportDuplicateReferenceData(client, collectImportDuplicateCandidates(input))
        : { databaseCheck: 'unavailable' as const, referenceData: emptyDuplicateReferenceData }
      setResult(validateImportBundle(input, { categories: categoriesQuery.data ?? [], ...lookup.referenceData }, lookup.databaseCheck))
      setMetadata(inputMetadata)
    } catch (error) {
      const inputError = error instanceof ImportInputError ? error : new ImportInputError('BUNDLE_VALIDATION_FAILED', 'JSON을 검증하지 못했습니다.')
      setResult(importInputErrorResult(inputError)); setMetadata(inputMetadata)
    } finally {
      setIsValidating(false)
    }
  }
  async function copyResult() {
    try { await copyTextToClipboard(resultText); setCopyMessage('전체 Dry Run 결과를 복사했습니다.') }
    catch { setCopyMessage('결과를 복사하지 못했습니다.') }
  }
  return (
    <section className="content-page import-page" aria-labelledby="import-page-title">
      <div className="content-page__heading"><div><p className="dashboard__eyebrow">Read-only import</p><h1 id="import-page-title">콘텐츠 가져오기</h1><p>공식 schema version 1 JSON을 실제 저장 전에 검증합니다. 이번 단계에서는 DB를 변경하지 않습니다.</p></div></div>
      <div className="import-notice"><strong>Dry Run 전용</strong><p>자동 수정, 실제 Import, 덮어쓰기, 외부 URL 조회와 AI 의미 중복 판정은 수행하지 않습니다.</p></div>
      {categoriesQuery.isPending ? <div className="content-state" role="status">카테고리 설정을 불러오고 있습니다.</div> : null}
      {categoriesQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>카테고리 설정을 불러오지 못했습니다</h2><p>형식 검증은 가능하지만 카테고리 판정이 제한됩니다.</p></div> : null}
      {!client ? <p className="form-alert" role="status">현재 DB 중복 조회를 사용할 수 없습니다. 구조 검증은 계속할 수 있으며 결과에 경고로 표시됩니다.</p> : null}
      <ImportInputForm disabled={isValidating || categoriesQuery.isPending} onValidate={validate} onReset={resetResult} />
      {result ? <>
        {metadata ? <p className="import-input-metadata">입력: {metadata.fileName ?? '붙여넣은 JSON'} · {(metadata.fileSize ?? 0).toLocaleString()} bytes</p> : null}
        <ImportDryRunSummary result={result} />
        {result.items.length > 0 ? <ImportDryRunList result={result} categories={categoriesQuery.data ?? []} /> : null}
        <section className="import-panel" aria-labelledby="import-result-json-title"><div className="import-panel__heading"><div><h2 id="import-result-json-title">검증 결과 JSON</h2><p>원본 htmlBody와 내부 DB ID는 제외했습니다.</p></div><button className="secondary-button" type="button" onClick={() => void copyResult()}>전체 결과 복사</button></div>{copyMessage ? <p className="field-help" role="status">{copyMessage}</p> : null}<textarea className="import-result-json" readOnly value={resultText} aria-label="다운로드용 검증 결과 JSON text" /></section>
      </> : null}
    </section>
  )
}

export function ImportPage() {
  return <ImportPageContent />
}
