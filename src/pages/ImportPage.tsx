import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { useAuth } from '../features/auth/useAuth'
import { ImportDryRunList } from '../features/imports/ImportDryRunList'
import { ImportDryRunSummary } from '../features/imports/ImportDryRunSummary'
import { ImportExecutionProgress } from '../features/imports/ImportExecutionProgress'
import { ImportExecutionResults } from '../features/imports/ImportExecutionResults'
import { importContentPost, executeSelectedImports } from '../features/imports/importExecution.repository'
import { importNewsTrackingForPost } from '../features/imports/importTracking.repository'
import type { ImportExecutionItemResult, ImportExecutionResult, ImportProgressState } from '../features/imports/importExecution.types'
import { ImportInputForm, type ImportInputMetadata } from '../features/imports/ImportInputForm'
import { ImportSelectionPanel } from '../features/imports/ImportSelectionPanel'
import { databaseCheckLabel, defaultImportSelection, importItemClientKey, isImportItemAllowed } from '../features/imports/importSelection'
import { useImportCategoriesQuery } from '../features/imports/importDuplicates.queries'
import { collectImportDuplicateCandidates, getImportDuplicateReferenceData } from '../features/imports/importDuplicates.repository'
import { ImportInputError, parseImportJsonText } from '../features/imports/importSchema'
import type { ImportValidationResult } from '../features/imports/importValidation.types'
import { importInputErrorResult, validateImportBundle } from '../features/imports/validateImportBundle'
import { postQueryKeys } from '../features/posts/posts.queries'
import { newsTopicQueryKeys } from '../features/newsTopics/newsTopics.queries'
import { newsUpdateQueryKeys } from '../features/newsUpdates/newsUpdates.queries'
import { newsFollowupQueryKeys } from '../features/newsFollowups/newsFollowups.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const emptyDuplicateReferenceData = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }
const emptyProgress: ImportProgressState = { completed: 0, total: 0, currentTitle: null, imported: 0, failed: 0, skipped: 0, trackingImported: 0, trackingFailed: 0 }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function rawPosts(value: unknown): unknown[] {
  const root = record(value)
  return Array.isArray(root?.posts) ? root.posts : []
}

function categorySignature(categories: Array<{ id: string; enabled: boolean; wrapperClass: string; displayIdPattern: string | null; slugPattern: string }>) {
  return JSON.stringify(categories.map(({ id, enabled, wrapperClass, displayIdPattern, slugPattern }) => ({ id, enabled, wrapperClass, displayIdPattern, slugPattern })))
}

export function ImportPageContent({ client = supabase, userId = '' }: { client?: DatabaseClient | null; userId?: string }) {
  const queryClient = useQueryClient()
  const categoriesQuery = useImportCategoriesQuery(client)
  const [result, setResult] = useState<ImportValidationResult | null>(null)
  const [parsedInput, setParsedInput] = useState<unknown>(null)
  const [metadata, setMetadata] = useState<ImportInputMetadata | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [approvedWarnings, setApprovedWarnings] = useState<Set<string>>(new Set())
  const [validatedCategorySignature, setValidatedCategorySignature] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState<ImportProgressState>(emptyProgress)
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const resultText = useMemo(() => result ? JSON.stringify(result, null, 2) : '', [result])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const categoryState = categorySignature(categories)
  const categoryStale = Boolean(result && validatedCategorySignature && validatedCategorySignature !== categoryState)
  const busy = isValidating || isPreparing || isExecuting

  function resetResult() {
    if (busy) return
    setResult(null); setParsedInput(null); setMetadata(null); setSelected(new Set()); setApprovedWarnings(new Set())
    setExecutionResult(null); setProgress(emptyProgress); setMessage(null); setCopyMessage(null); setValidatedCategorySignature(null)
  }

  async function validate(text: string, inputMetadata: ImportInputMetadata) {
    if (busy) return
    setIsValidating(true); setCopyMessage(null); setMessage(null); setExecutionResult(null)
    try {
      const input = parseImportJsonText(text)
      const lookup = client
        ? await getImportDuplicateReferenceData(client, collectImportDuplicateCandidates(input))
        : { databaseCheck: 'unavailable' as const, referenceData: emptyDuplicateReferenceData }
      const nextResult = validateImportBundle(input, { categories, ...lookup.referenceData }, lookup.databaseCheck)
      setResult(nextResult); setParsedInput(input); setSelected(defaultImportSelection(nextResult.items)); setApprovedWarnings(new Set())
      setValidatedCategorySignature(categoryState); setMetadata(inputMetadata)
    } catch (error) {
      const inputError = error instanceof ImportInputError ? error : new ImportInputError('BUNDLE_VALIDATION_FAILED', 'JSON을 검증하지 못했습니다.')
      setResult(importInputErrorResult(inputError)); setParsedInput(null); setSelected(new Set()); setApprovedWarnings(new Set()); setMetadata(inputMetadata)
    } finally { setIsValidating(false) }
  }

  function toggleSelected(key: string, checked: boolean) {
    setSelected((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next })
  }
  function toggleWarningApproval(key: string, approved: boolean) {
    setApprovedWarnings((current) => { const next = new Set(current); if (approved) next.add(key); else next.delete(key); return next })
    if (!approved) toggleSelected(key, false)
  }
  function selectAllReady(checked: boolean) {
    if (!result) return
    setSelected((current) => { const next = new Set(current); result.items.filter((item) => item.status === 'ready').forEach((item) => { const key = importItemClientKey(item); if (checked) next.add(key); else next.delete(key) }); return next })
  }

  async function prepareAndImport() {
    if (!client || !result || !parsedInput || busy || result.databaseCheck !== 'complete') return
    const selectedItems = result.items.filter((item) => selected.has(importItemClientKey(item)) && isImportItemAllowed(item, approvedWarnings))
    if (!selectedItems.length) return
    setIsPreparing(true); setMessage('Import 직전 DB 중복을 다시 확인하고 있습니다.'); setExecutionResult(null); setCopyMessage(null)
    try {
      const sourcePosts = rawPosts(parsedInput)
      const selectedRaw = selectedItems.map((item) => sourcePosts[item.index])
      const root = record(parsedInput) ?? {}
      const selectedBundle = { ...root, posts: selectedRaw }
      const lookup = await getImportDuplicateReferenceData(client, collectImportDuplicateCandidates(selectedBundle))
      if (lookup.databaseCheck !== 'complete') {
        setMessage(`Import 직전 DB 중복 검사 상태가 ${databaseCheckLabel(lookup.databaseCheck)}이므로 저장을 중단했습니다.`)
        return
      }
      const fresh = validateImportBundle(selectedBundle, { categories, ...lookup.referenceData }, 'complete')
      const skipped: ImportExecutionItemResult[] = []
      const candidates: Array<{ clientKey: string; title: string; categoryId: string; rawItem: unknown; isNews: boolean }> = []
      let newlyUnapprovedWarning = false
      fresh.items.forEach((freshItem, position) => {
        const original = selectedItems[position]
        const clientKey = importItemClientKey(original)
        if (freshItem.status === 'duplicate' || freshItem.status === 'invalid') {
          skipped.push({ externalKey: clientKey, title: original.title, categoryId: original.categoryId, status: 'skipped', contentStatus: 'skipped', trackingStatus: 'not_applicable', errorCode: freshItem.status === 'duplicate' ? 'IMPORT_DUPLICATE_PREFLIGHT' : 'IMPORT_VALIDATION_CHANGED', message: freshItem.status === 'duplicate' ? 'Import 직전 새 중복이 발견되어 제외했습니다.' : 'Import 직전 검증 결과가 변경되어 제외했습니다.' })
        } else if (freshItem.status === 'warning' && !approvedWarnings.has(clientKey) && original.status !== 'warning') {
          newlyUnapprovedWarning = true
        } else candidates.push({ clientKey, title: original.title, categoryId: original.categoryId, rawItem: selectedRaw[position], isNews: categories.find((category) => category.id === original.categoryId)?.contentGroup === 'news' })
      })
      if (newlyUnapprovedWarning) {
        setApprovedWarnings(new Set()); setSelected(defaultImportSelection(result.items))
        setMessage('DB 재검사 결과 새 경고가 생겼습니다. Dry Run을 다시 실행하고 경고를 승인해 주세요.')
        return
      }
      const orderedKeys = selectedItems.map(importItemClientKey)
      if (!candidates.length) {
        const now = new Date().toISOString()
        setExecutionResult({ startedAt: now, completedAt: now, total: skipped.length, imported: 0, failed: 0, skipped: skipped.length, trackingImported: 0, trackingFailed: 0, trackingNotPresent: 0, items: skipped })
        setMessage('모든 선택 항목이 Import 직전 중복 또는 검증 변경으로 제외되었습니다.')
        return
      }
      const readyCount = selectedItems.filter((item) => item.status === 'ready').length
      const warningCount = selectedItems.filter((item) => item.status === 'warning').length
      const trackingRows = candidates.map((candidate) => record(candidate.rawItem)).filter((item): item is Record<string, unknown> => Boolean(item))
      const newsRows = candidates.filter((candidate) => candidate.isNews)
      const trackingIncluded = trackingRows.filter((item) => item.newsTracking != null)
      const trackingArrays = trackingIncluded.map((item) => record(item.newsTracking) ?? {})
      const topicCount = trackingArrays.reduce((count, tracking) => count + (Array.isArray(tracking.topics) ? tracking.topics.length : 0), 0)
      const updateCount = trackingArrays.reduce((count, tracking) => count + (Array.isArray(tracking.updates) ? tracking.updates.length : 0), 0)
      const followupCount = trackingArrays.reduce((count, tracking) => count + (Array.isArray(tracking.followups) ? tracking.followups.length : 0), 0)
      const reuseCount = fresh.items.reduce((count, item) => count + item.issues.filter((issue) => issue.code === 'DB_NEWS_TOPIC_REUSE_CANDIDATE').length, 0)
      const confirmed = window.confirm([
        `${candidates.length}개 게시물을 Import합니다. (ready ${readyCount}, 승인 warning ${warningCount})`,
        `뉴스 ${newsRows.length}개 · tracking 포함 ${trackingIncluded.length}개 · tracking 없음 ${newsRows.length - trackingIncluded.length}개`,
        `주제 생성 예정 ${Math.max(0, topicCount - reuseCount)}개 · 기존 주제 재사용 후보 ${reuseCount}개 · 업데이트 ${updateCount}개 · 후속 확인 ${followupCount}개`,
        '콘텐츠와 tracking은 별도 transaction입니다. tracking 실패 시 생성된 콘텐츠는 유지됩니다.',
        '기존 주제는 수정하지 않고 안전한 경우에만 재사용하며 기존 update·followup을 덮어쓰지 않습니다.',
        'tracking resume·retry·완전한 재실행 idempotency는 Phase 4A-4에서 지원합니다.',
      ].join('\n'))
      if (!confirmed) { setMessage('Import 실행을 취소했습니다. 저장된 항목은 없습니다.'); return }
      setIsPreparing(false); setIsExecuting(true); setProgress({ ...emptyProgress, total: candidates.length, skipped: skipped.length }); setMessage(skipped.length ? `${skipped.length}개 새 중복을 제외하고 Import를 시작합니다.` : 'Import를 시작합니다.')
      const completed = await executeSelectedImports(candidates, (item) => importContentPost(client, item), setProgress, skipped, orderedKeys, (postId, tracking) => importNewsTrackingForPost(client, postId, tracking))
      setExecutionResult(completed); setMessage(`Import 완료: 콘텐츠 성공 ${completed.imported}, 콘텐츠 실패 ${completed.failed}, tracking 성공 ${completed.trackingImported}, tracking 실패 ${completed.trackingFailed}, 건너뜀 ${completed.skipped}`)
      if (completed.imported > 0) {
        void queryClient.invalidateQueries({ queryKey: postQueryKeys.all })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['tags'] })
        void queryClient.invalidateQueries({ queryKey: ['sources'] })
        if (userId) void queryClient.invalidateQueries({ queryKey: postQueryKeys.list(userId) })
        if (completed.trackingImported > 0) {
          void queryClient.invalidateQueries({ queryKey: newsTopicQueryKeys.all })
          void queryClient.invalidateQueries({ queryKey: newsUpdateQueryKeys.all })
          void queryClient.invalidateQueries({ queryKey: newsFollowupQueryKeys.all })
        }
      }
    } catch {
      setMessage('Import 직전 DB 중복 재검사에 실패했습니다. 게시물을 저장하지 않았습니다.')
    } finally { setIsPreparing(false); setIsExecuting(false) }
  }

  async function copyDryRun() {
    try { await copyTextToClipboard(resultText); setCopyMessage('전체 Dry Run 결과를 복사했습니다.') } catch { setCopyMessage('결과를 복사하지 못했습니다.') }
  }
  async function copyExecution(failuresOnly: boolean) {
    if (!executionResult) return
    const items = (failuresOnly ? executionResult.items.filter((item) => item.contentStatus === 'failed' || item.trackingStatus === 'failed') : executionResult.items).map((item) => ({ externalKey: item.externalKey, title: item.title, categoryId: item.categoryId, contentStatus: item.contentStatus, trackingStatus: item.trackingStatus, errorCode: item.errorCode, message: item.message, trackingErrorCode: item.trackingErrorCode, trackingMessage: item.trackingMessage, createdTopicCount: item.createdTopicCount, reusedTopicCount: item.reusedTopicCount, updateCount: item.updateCount, followupCount: item.followupCount }))
    const value = failuresOnly ? items.map((item) => `${item.title}: ${item.trackingErrorCode ?? item.errorCode ?? ''} ${item.trackingMessage ?? item.message ?? ''}`.trim()).join('\n') : JSON.stringify({ ...executionResult, items }, null, 2)
    try { await copyTextToClipboard(value); setCopyMessage(failuresOnly ? '실패 결과를 복사했습니다.' : '현재 세션 결과를 복사했습니다.') } catch { setCopyMessage('결과를 복사하지 못했습니다.') }
  }

  const selectedCount = result?.items.filter((item) => selected.has(importItemClientKey(item)) && isImportItemAllowed(item, approvedWarnings)).length ?? 0
  const canImport = Boolean(client && result && parsedInput && result.databaseCheck === 'complete' && selectedCount > 0 && !busy && !categoryStale)
  return <section className="content-page import-page" aria-labelledby="import-page-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">Validated content import</p><h1 id="import-page-title">콘텐츠 가져오기</h1><p>Dry Run을 통과한 콘텐츠·SEO·태그·출처·카테고리 metadata를 게시물 단위 transaction으로 저장합니다.</p></div></div>
    <div className="import-notice"><strong>Phase 4A-3</strong><p>뉴스 tracking은 콘텐츠 저장 후 별도 transaction으로 저장합니다. tracking 실패 시 콘텐츠는 유지되며 영구 Import 이력·resume·retry는 아직 지원하지 않습니다.</p></div>
    {categoriesQuery.isPending ? <div className="content-state" role="status">카테고리 설정을 불러오고 있습니다.</div> : null}
    {categoriesQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>카테고리 설정을 불러오지 못했습니다</h2><p>실제 Import를 실행할 수 없습니다.</p></div> : null}
    {!client ? <p className="form-alert" role="status">현재 DB 중복 조회와 실제 Import를 사용할 수 없습니다.</p> : null}
    <ImportInputForm disabled={busy || categoriesQuery.isPending} onValidate={validate} onReset={resetResult} />
    {result ? <>
      {metadata ? <p className="import-input-metadata">입력: {metadata.fileName ?? '붙여넣은 JSON'} · {(metadata.fileSize ?? 0).toLocaleString()} bytes</p> : null}
      <ImportDryRunSummary result={result} />
      {result.items.length ? <><ImportDryRunList result={result} categories={categories} /><ImportSelectionPanel result={result} categories={categories} selected={selected} approvedWarnings={approvedWarnings} disabled={busy} onToggleSelected={toggleSelected} onToggleWarningApproval={toggleWarningApproval} onSelectAllReady={selectAllReady} />
        <section className="import-panel import-execution-actions" aria-labelledby="import-execution-title"><div><h2 id="import-execution-title">실제 Import</h2><p>DB 중복 검사: <strong>{databaseCheckLabel(result.databaseCheck)}</strong> · 선택 {selectedCount}개</p>{result.databaseCheck !== 'complete' ? <p className="form-alert">DB 중복 검사가 complete가 아니므로 실제 Import를 실행할 수 없습니다.</p> : null}{categoryStale ? <p className="form-alert">카테고리 설정이 변경되어 결과가 stale입니다. Dry Run을 다시 실행해 주세요.</p> : null}{message ? <p className="field-help" role="status">{message}</p> : null}</div><button className="primary-button" type="button" disabled={!canImport} onClick={() => void prepareAndImport()}>{isPreparing ? '중복 재검사 중' : isExecuting ? 'Import 실행 중' : '선택 항목 Import'}</button></section></> : null}
      <section className="import-panel" aria-labelledby="import-result-json-title"><div className="import-panel__heading"><div><h2 id="import-result-json-title">검증 결과 JSON</h2><p>원본 htmlBody와 내부 DB ID는 제외했습니다.</p></div><button className="secondary-button" type="button" onClick={() => void copyDryRun()}>전체 결과 복사</button></div>{copyMessage && !executionResult ? <p className="field-help" role="status">{copyMessage}</p> : null}<textarea className="import-result-json" readOnly value={resultText} aria-label="다운로드용 검증 결과 JSON text" /></section>
    </> : null}
    {(isExecuting || progress.total > 0) ? <ImportExecutionProgress progress={progress} /> : null}
    {executionResult ? <ImportExecutionResults result={executionResult} onCopyAll={() => void copyExecution(false)} onCopyFailures={() => void copyExecution(true)} copyMessage={copyMessage} /> : null}
  </section>
}

export function ImportPage() { const { user } = useAuth(); return <ImportPageContent userId={user?.id ?? ''} /> }
