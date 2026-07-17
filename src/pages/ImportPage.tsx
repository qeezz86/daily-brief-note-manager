import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { useAuth } from '../features/auth/useAuth'
import { ImportDryRunList } from '../features/imports/ImportDryRunList'
import { ImportDryRunSummary } from '../features/imports/ImportDryRunSummary'
import { ImportInputForm, type ImportInputMetadata } from '../features/imports/ImportInputForm'
import { ImportSelectionPanel } from '../features/imports/ImportSelectionPanel'
import { databaseCheckLabel, defaultImportSelection, importItemClientKey, isImportItemAllowed } from '../features/imports/importSelection'
import { useImportCategoriesQuery } from '../features/imports/importDuplicates.queries'
import { collectImportDuplicateCandidates, getImportDuplicateReferenceData } from '../features/imports/importDuplicates.repository'
import { ImportInputError, parseImportJsonText } from '../features/imports/importSchema'
import { prepareImportJob } from '../features/imports/prepareImportJob'
import type { ImportValidationResult } from '../features/imports/importValidation.types'
import { importInputErrorResult, validateImportBundle } from '../features/imports/validateImportBundle'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const emptyDuplicateReferenceData = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }

function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function rawPosts(value: unknown): unknown[] { const root = record(value); return Array.isArray(root?.posts) ? root.posts : [] }
function categorySignature(categories: Array<{ id: string; enabled: boolean; wrapperClass: string; displayIdPattern: string | null; slugPattern: string }>) { return JSON.stringify(categories.map(({ id, enabled, wrapperClass, displayIdPattern, slugPattern }) => ({ id, enabled, wrapperClass, displayIdPattern, slugPattern }))) }

export function ImportPageContent({ client = supabase, userId = '' }: { client?: DatabaseClient | null; userId?: string }) {
  const navigate = useNavigate()
  const categoriesQuery = useImportCategoriesQuery(client)
  const [result, setResult] = useState<ImportValidationResult | null>(null)
  const [parsedInput, setParsedInput] = useState<unknown>(null)
  const [metadata, setMetadata] = useState<ImportInputMetadata | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [approvedWarnings, setApprovedWarnings] = useState<Set<string>>(new Set())
  const [validatedCategorySignature, setValidatedCategorySignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const resultText = useMemo(() => result ? JSON.stringify(result, null, 2) : '', [result])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const categoryState = categorySignature(categories)
  const categoryStale = Boolean(result && validatedCategorySignature && validatedCategorySignature !== categoryState)

  function resetResult() {
    if (busy) return
    setResult(null); setParsedInput(null); setMetadata(null); setSelected(new Set()); setApprovedWarnings(new Set()); setMessage(null); setCopyMessage(null); setValidatedCategorySignature(null)
  }

  async function validate(text: string, inputMetadata: ImportInputMetadata) {
    if (busy) return
    setBusy(true); setCopyMessage(null); setMessage(null)
    try {
      const input = parseImportJsonText(text)
      const lookup = client ? await getImportDuplicateReferenceData(client, collectImportDuplicateCandidates(input)) : { databaseCheck: 'unavailable' as const, referenceData: emptyDuplicateReferenceData }
      const nextResult = validateImportBundle(input, { categories, ...lookup.referenceData }, lookup.databaseCheck)
      setResult(nextResult); setParsedInput(input); setSelected(defaultImportSelection(nextResult.items)); setApprovedWarnings(new Set()); setValidatedCategorySignature(categoryState); setMetadata(inputMetadata)
    } catch (error) {
      const inputError = error instanceof ImportInputError ? error : new ImportInputError('BUNDLE_VALIDATION_FAILED', 'JSON을 검증하지 못했습니다.')
      setResult(importInputErrorResult(inputError)); setParsedInput(null); setSelected(new Set()); setApprovedWarnings(new Set()); setMetadata(inputMetadata)
    } finally { setBusy(false) }
  }

  function toggleSelected(key: string, checked: boolean) { setSelected((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next }) }
  function toggleWarningApproval(key: string, approved: boolean) { setApprovedWarnings((current) => { const next = new Set(current); if (approved) next.add(key); else next.delete(key); return next }); if (!approved) toggleSelected(key, false) }
  function selectAllReady(checked: boolean) { if (!result) return; setSelected((current) => { const next = new Set(current); result.items.filter((item) => item.status === 'ready').forEach((item) => { const key = importItemClientKey(item); if (checked) next.add(key); else next.delete(key) }); return next }) }

  async function createJob() {
    if (!client || !result || !parsedInput || busy || result.databaseCheck !== 'complete' || categoryStale) return
    const selectedItems = result.items.filter((item) => selected.has(importItemClientKey(item)) && isImportItemAllowed(item, approvedWarnings))
    if (!selectedItems.length) return
    setBusy(true); setMessage('Import 직전 DB 중복을 다시 확인하고 있습니다.'); setCopyMessage(null)
    try {
      const sourcePosts = rawPosts(parsedInput)
      const selectedRaw = selectedItems.map((item) => sourcePosts[item.index])
      const root = record(parsedInput) ?? {}
      const lookup = await getImportDuplicateReferenceData(client, collectImportDuplicateCandidates({ ...root, posts: selectedRaw }))
      if (lookup.databaseCheck !== 'complete') { setMessage(`Import 직전 DB 중복 검사 상태가 ${databaseCheckLabel(lookup.databaseCheck)}이므로 작업을 만들지 않았습니다.`); return }
      const fresh = validateImportBundle({ ...root, posts: selectedRaw }, { categories, ...lookup.referenceData }, 'complete')
      if (fresh.items.some((item) => item.status === 'invalid' || item.status === 'duplicate')) { setMessage('Import 직전 새 중복 또는 검증 오류가 발견되었습니다. Dry Run을 다시 실행해 주세요.'); return }
      if (fresh.items.some((item, index) => item.status === 'warning' && !approvedWarnings.has(importItemClientKey(selectedItems[index])))) { setMessage('Import 직전 새 경고가 생겼습니다. Dry Run을 다시 실행하고 경고를 승인해 주세요.'); return }
      if (!window.confirm(`${fresh.items.length}개 snapshot으로 영구 Import 작업을 만듭니다.\n작업 생성 후 상세 화면에서 실행을 시작합니다.\n콘텐츠와 tracking은 별도 transaction이며 tracking 실패 시 콘텐츠는 유지됩니다.`)) { setMessage('Import 작업 생성을 취소했습니다.'); return }
      const prepared = await prepareImportJob(client, {
        format: String(root.format ?? ''), schemaVersion: Number(root.schemaVersion),
        sourceName: metadata?.fileName ?? (typeof root.source === 'string' ? root.source : null),
        validationResult: result, items: fresh.items, rawItems: selectedRaw, categories, approvedWarnings,
        validationMode: root.validationMode === 'legacy' ? 'legacy' : 'strict',
      })
      setMessage(prepared.isExisting ? '동일한 bundle의 기존 작업을 열고 있습니다.' : '영구 Import 작업을 만들었습니다.')
      navigate(`/imports/history/${prepared.jobId}`)
    } catch { setMessage('Import 작업 준비에 실패했습니다. 같은 입력으로 다시 시도하면 등록된 chunk부터 이어집니다.') } finally { setBusy(false) }
  }

  async function copyDryRun() { try { await copyTextToClipboard(resultText); setCopyMessage('전체 Dry Run 결과를 복사했습니다.') } catch { setCopyMessage('결과를 복사하지 못했습니다.') } }

  const selectedCount = result?.items.filter((item) => selected.has(importItemClientKey(item)) && isImportItemAllowed(item, approvedWarnings)).length ?? 0
  const canCreate = Boolean(client && result && parsedInput && result.databaseCheck === 'complete' && selectedCount > 0 && !busy && !categoryStale && userId)
  return <section className="content-page import-page" aria-labelledby="import-page-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">Validated durable import</p><h1 id="import-page-title">콘텐츠 가져오기</h1><p>Dry Run을 통과한 선택 항목을 불변 snapshot으로 저장한 뒤 작업 상세에서 순차 실행합니다.</p></div><Link className="secondary-button" to="/imports/history">작업 이력</Link></div>
    <div className="import-notice"><strong>Phase 4A-4</strong><p>동일 bundle은 기존 작업으로 연결됩니다. 새로고침 후 resume, 단계별 수동 retry와 안전한 취소를 지원하며 브라우저가 닫힌 동안 자동 실행하지 않습니다.</p></div>
    {categoriesQuery.isPending ? <div className="content-state" role="status">카테고리 설정을 불러오고 있습니다.</div> : null}
    {categoriesQuery.isError ? <div className="content-state content-state--error" role="alert">카테고리 설정을 불러오지 못했습니다.</div> : null}
    {!client ? <p className="form-alert" role="status">Supabase가 설정되지 않아 Dry Run DB 조회와 작업 생성을 사용할 수 없습니다.</p> : null}
    <ImportInputForm disabled={busy || categoriesQuery.isPending} onValidate={validate} onReset={resetResult} />
    {result ? <>
      {metadata ? <p className="import-input-metadata">입력: {metadata.fileName ?? '붙여넣은 JSON'} · {(metadata.fileSize ?? 0).toLocaleString()} bytes</p> : null}
      <ImportDryRunSummary result={result} />
      {result.items.length ? <><ImportDryRunList result={result} categories={categories} /><ImportSelectionPanel result={result} categories={categories} selected={selected} approvedWarnings={approvedWarnings} disabled={busy} onToggleSelected={toggleSelected} onToggleWarningApproval={toggleWarningApproval} onSelectAllReady={selectAllReady} />
        <section className="import-panel import-execution-actions"><div><h2>영구 작업 준비</h2><p>DB 중복 검사: <strong>{databaseCheckLabel(result.databaseCheck)}</strong> · 선택 {selectedCount}개</p>{result.databaseCheck !== 'complete' ? <p className="form-alert">DB 중복 검사가 complete가 아니므로 작업을 만들 수 없습니다.</p> : null}{categoryStale ? <p className="form-alert">카테고리 설정이 변경되었습니다. Dry Run을 다시 실행해 주세요.</p> : null}{message ? <p className="field-help" role="status">{message}</p> : null}</div><button className="primary-button" type="button" disabled={!canCreate} onClick={() => void createJob()}>{busy ? '작업 준비 중' : 'Import 작업 만들기'}</button></section></> : null}
      <section className="import-panel"><div className="import-panel__heading"><div><h2>검증 결과 JSON</h2><p>원본 htmlBody와 내부 DB ID는 제외했습니다.</p></div><button className="secondary-button" type="button" onClick={() => void copyDryRun()}>전체 결과 복사</button></div>{copyMessage ? <p className="field-help" role="status">{copyMessage}</p> : null}<textarea className="import-result-json" readOnly value={resultText} aria-label="다운로드용 검증 결과 JSON text" /></section>
    </> : null}
  </section>
}

export function ImportPage() { const { user } = useAuth(); return <ImportPageContent userId={user?.id ?? ''} /> }
