import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseClient } from '../../shared/supabase/client'
import { normalizeSourceUrl } from '../posts/publicationFields'
import { saveChatGptPastePost } from './chatGptPaste.repository'
import { ChatGptPasteRepositoryError, type ChatGptPastePersistencePayload, type SaveChatGptPastePostResult } from './chatGptPaste.types'
import { getImportDuplicateReferenceData } from './importDuplicates.repository'
import type { ImportDuplicateCandidates, ImportDuplicateLookupResult } from './importValidation.types'
import { NonNewsResponseImportReview } from './NonNewsResponseImportReview'
import type {
  NonNewsResponseCandidate,
  NonNewsResponseCategorySetting,
  NonNewsResponseDuplicateState,
  NonNewsResponseParseResult,
  NonNewsResponseValidationResult,
  NonNewsResponseWorkflowStatus,
  SupportedNonNewsResponseCategoryId,
} from './nonNewsResponseImport.types'
import { parseNonNewsResponse } from './parseNonNewsResponse'
import { extractNonNewsResponseSources, validateNonNewsResponse } from './validateNonNewsResponse'

type DuplicateLookup = (client: DatabaseClient, candidates: ImportDuplicateCandidates) => Promise<ImportDuplicateLookupResult>
type SaveFunction = (client: DatabaseClient, payload: ChatGptPastePersistencePayload) => Promise<SaveChatGptPastePostResult>

const supportedIds: SupportedNonNewsResponseCategoryId[] = ['ai-column', 'info-db', 'chinese-study']
const idleDuplicateState: NonNewsResponseDuplicateState = { status: 'idle', databaseCheck: null, duplicateFound: false, message: '아직 중복 검사를 실행하지 않았습니다.' }

function categorySignature(categories: NonNewsResponseCategorySetting[]) {
  return JSON.stringify(categories.map(({ id, enabled, contentGroup, name, code, wrapperClass, displayIdPattern, slugPattern }) =>
    ({ id, enabled, contentGroup, name, code, wrapperClass, displayIdPattern, slugPattern })))
}

function duplicateCandidates(validation: NonNewsResponseValidationResult): ImportDuplicateCandidates {
  const payload = validation.persistencePayload
  return {
    slugs: payload ? [payload.content.slug] : [],
    wordpressUrls: [],
    briefingDates: [],
    seriesNumbers: payload?.content.series_no ? [payload.content.series_no] : [],
    chineseOriginalUrls: payload?.content.content_group === 'chinese'
      ? payload.sources.slice(0, 1).map((source) => normalizeSourceUrl(source.source_url).toLocaleLowerCase('en-US'))
      : [],
    newsTopicKeys: [],
  }
}

function interpretDuplicateLookup(validation: NonNewsResponseValidationResult, lookup: ImportDuplicateLookupResult): NonNewsResponseDuplicateState {
  if (lookup.databaseCheck !== 'complete') {
    return { status: 'incomplete', databaseCheck: lookup.databaseCheck, duplicateFound: false, message: `DB 중복 검사가 ${lookup.databaseCheck} 상태이므로 저장할 수 없습니다.` }
  }
  const payload = validation.persistencePayload
  if (!payload) return { status: 'incomplete', databaseCheck: 'unavailable', duplicateFound: false, message: '현재 검증 결과로 중복 키를 만들 수 없습니다.' }
  const duplicatePost = lookup.referenceData.posts.some((post) =>
    post.slug === payload.content.slug || post.categoryId === payload.content.category_id && post.seriesNo === payload.content.series_no)
  const sourceKeys = new Set(payload.sources.slice(0, 1).map((source) => normalizeSourceUrl(source.source_url).toLocaleLowerCase('en-US')))
  const duplicateChineseUrl = payload.content.content_group === 'chinese' && lookup.referenceData.chineseUrls.some((row) =>
    sourceKeys.has(normalizeSourceUrl(row.originalUrl).toLocaleLowerCase('en-US')))
  return duplicatePost || duplicateChineseUrl
    ? { status: 'duplicate', databaseCheck: 'complete', duplicateFound: true, message: 'slug, 카테고리+시리즈 번호 또는 중국어 원문 URL의 정확한 중복이 발견되었습니다.' }
    : { status: 'clear', databaseCheck: 'complete', duplicateFound: false, message: '현재 값의 정확한 DB 중복 검사가 complete이며 중복이 없습니다.' }
}

export function NonNewsResponseImportWorkflow({
  client,
  categories,
  parse = parseNonNewsResponse,
  validate = validateNonNewsResponse,
  duplicateLookup = getImportDuplicateReferenceData,
  save = saveChatGptPastePost,
  onSaved,
}: {
  client: DatabaseClient | null
  categories: NonNewsResponseCategorySetting[]
  parse?: (input: string) => NonNewsResponseParseResult
  validate?: typeof validateNonNewsResponse
  duplicateLookup?: DuplicateLookup
  save?: SaveFunction
  onSaved?: (result: SaveChatGptPastePostResult) => void
}) {
  const navigate = useNavigate()
  const supportedCategories = useMemo(() => categories.filter((category) => category.enabled && supportedIds.includes(category.id as SupportedNonNewsResponseCategoryId)), [categories])
  const settingsSignature = categorySignature(supportedCategories)
  const [rawText, setRawText] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [seriesText, setSeriesText] = useState('')
  const [candidate, setCandidate] = useState<NonNewsResponseCandidate | null>(null)
  const [parseIssues, setParseIssues] = useState<NonNewsResponseParseResult['issues']>([])
  const [validation, setValidation] = useState<NonNewsResponseValidationResult | null>(null)
  const [validatedSettingsSignature, setValidatedSettingsSignature] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [duplicateState, setDuplicateState] = useState<NonNewsResponseDuplicateState>(idleDuplicateState)
  const [status, setStatus] = useState<NonNewsResponseWorkflowStatus>('idle')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeSaveRef = useRef(false)
  const parseAlertRef = useRef<HTMLDivElement>(null)
  const actionAlertRef = useRef<HTMLDivElement>(null)
  const saveAlertRef = useRef<HTMLDivElement>(null)
  const confirmationRef = useRef<HTMLElement>(null)
  const mountedRef = useRef(true)
  const settingsStale = Boolean(validation && validatedSettingsSignature && validatedSettingsSignature !== settingsSignature)
  const authoritativeStale = stale || settingsStale
  const authoritativeDuplicateState = authoritativeStale ? idleDuplicateState : duplicateState
  const authoritativeWarningsAcknowledged = !authoritativeStale && warningsAcknowledged
  const authoritativeConfirmationOpen = !authoritativeStale && confirmationOpen

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  useEffect(() => {
    if (parseIssues.length) parseAlertRef.current?.focus()
    if (saveError) saveAlertRef.current?.focus()
    else if (authoritativeDuplicateState.status === 'duplicate' || authoritativeDuplicateState.status === 'incomplete') actionAlertRef.current?.focus()
  }, [authoritativeDuplicateState.status, parseIssues.length, saveError])
  useEffect(() => {
    if (authoritativeConfirmationOpen) confirmationRef.current?.focus()
  }, [authoritativeConfirmationOpen])

  function invalidate(nextCandidate: NonNewsResponseCandidate | null = candidate) {
    setCandidate(nextCandidate)
    if (validation) setStale(true)
    setWarningsAcknowledged(false)
    setDuplicateState(idleDuplicateState)
    setConfirmationOpen(false)
    setSaveError(null)
    if (nextCandidate) setStatus('parsed')
  }

  function updateRawText(value: string) {
    setRawText(value)
    setParseIssues([])
    invalidate(candidate)
  }

  function createReview() {
    if (activeSaveRef.current || status === 'saved') return
    const result = parse(rawText)
    setParseIssues(result.issues)
    setValidation(null)
    setValidatedSettingsSignature(null)
    setStale(false)
    setWarningsAcknowledged(false)
    setDuplicateState(idleDuplicateState)
    setConfirmationOpen(false)
    setSaveError(null)
    const reviewCandidate = result.candidate
      ? { ...result.candidate, sources: extractNonNewsResponseSources(new DOMParser().parseFromString(result.candidate.wordpressHtml, 'text/html')) }
      : null
    setCandidate(reviewCandidate)
    setStatus(reviewCandidate ? 'parsed' : 'idle')
  }

  async function checkDuplicates(nextValidation: NonNewsResponseValidationResult) {
    if (!client || !nextValidation.persistencePayload) {
      return { status: 'incomplete', databaseCheck: 'unavailable', duplicateFound: false, message: 'Supabase 연결 또는 현재 검증 payload가 없어 중복 검사를 완료할 수 없습니다.' } as NonNewsResponseDuplicateState
    }
    try {
      const lookup = await duplicateLookup(client, duplicateCandidates(nextValidation))
      return interpretDuplicateLookup(nextValidation, lookup)
    } catch {
      return { status: 'incomplete', databaseCheck: 'unavailable', duplicateFound: false, message: 'DB 중복 검사를 완료하지 못했습니다. 저장하지 않았습니다.' } as NonNewsResponseDuplicateState
    }
  }

  async function revalidate() {
    if (!candidate || activeSaveRef.current || status === 'saved') return
    setStatus('validating')
    setSaveError(null)
    setConfirmationOpen(false)
    setWarningsAcknowledged(false)
    setDuplicateState(idleDuplicateState)
    const category = supportedCategories.find((item) => item.id === selectedCategoryId) ?? null
    const seriesNo = /^[1-9]\d*$/u.test(seriesText.trim()) ? Number(seriesText) : null
    const next = validate(candidate, category, seriesNo)
    setValidation(next)
    setValidatedSettingsSignature(settingsSignature)
    setStale(false)
    if (next.status === 'invalid') {
      setDuplicateState(idleDuplicateState)
      setStatus('review-invalid')
      return
    }
    const duplicates = await checkDuplicates(next)
    if (!mountedRef.current) return
    setDuplicateState(duplicates)
    if (duplicates.status !== 'clear') setStatus('review-invalid')
    else setStatus(next.status === 'warning' ? 'review-warning' : 'ready')
  }

  const hasWarnings = validation?.issues.some((item) => item.status === 'warning') ?? false
  const warningReady = !hasWarnings || authoritativeWarningsAcknowledged
  const saveEligible = Boolean(
    validation?.persistencePayload && validation.status !== 'invalid' && !authoritativeStale && authoritativeDuplicateState.status === 'clear'
    && warningReady && status !== 'saving' && status !== 'saved',
  )

  async function confirmSave() {
    if (!saveEligible || !validation?.persistencePayload || activeSaveRef.current) return
    activeSaveRef.current = true
    setStatus('saving')
    setSaveError(null)
    try {
      const freshDuplicateState = await checkDuplicates(validation)
      if (!mountedRef.current) return
      setDuplicateState(freshDuplicateState)
      if (freshDuplicateState.status !== 'clear') {
        setConfirmationOpen(false)
        setStatus('review-invalid')
        return
      }
      if (!client) throw new Error('PERSISTENCE_UNAVAILABLE')
      const saved = await save(client, validation.persistencePayload)
      if (!mountedRef.current) return
      setStatus('saved')
      setConfirmationOpen(false)
      onSaved?.(saved)
      navigate(`/content/${saved.postId}`)
    } catch (error) {
      if (!mountedRef.current) return
      setSaveError(error instanceof ChatGptPasteRepositoryError
        ? '초안 저장 결과를 확인하지 못했습니다. 자동 재시도하지 않았습니다. 미리보기와 후보는 유지됩니다. 결과를 확인한 뒤 수동으로 다시 시도하세요.'
        : '초안 저장 결과를 확인하지 못했습니다. 자동 재시도하지 않았습니다. 후보를 유지한 채 연결과 로그인 상태를 확인하세요.')
      setConfirmationOpen(false)
      setStatus('save-failed')
    } finally {
      activeSaveRef.current = false
    }
  }

  const selectedCategory = supportedCategories.find((item) => item.id === selectedCategoryId) ?? null
  const busy = status === 'validating' || status === 'saving'
  const disabledReason = !candidate ? '먼저 canonical 응답을 분석하세요.'
    : authoritativeStale ? '후보 또는 카테고리 설정이 변경되어 명시적 재검증이 필요합니다.'
      : validation?.status === 'invalid' ? '저장 차단 검증 항목을 수정하세요.'
        : authoritativeDuplicateState.status !== 'clear' ? 'complete이며 clear인 정확한 중복 검사 결과가 필요합니다.'
          : !warningReady ? '경고를 확인하고 체크박스로 승인하세요.'
            : status === 'saved' ? '현재 workflow 상태는 이미 저장되었습니다.'
              : null

  return <section className="non-news-response-workflow" aria-labelledby="non-news-response-workflow-title" aria-busy={status === 'validating' || status === 'saving'}>
    <section className="import-panel non-news-response-input">
      <div className="import-panel__heading"><div>
        <h2 id="non-news-response-workflow-title">비뉴스 일반 응답 붙여넣기</h2>
        <p>정확한 10개 section을 브라우저에서 결정적으로 분석합니다. 원문은 저장 요청·로그에 포함되지 않습니다.</p>
      </div></div>
      <div className="non-news-response-grid">
        <label>카테고리<select value={selectedCategoryId} disabled={busy || status === 'saved'} onChange={(event) => { setSelectedCategoryId(event.target.value); invalidate() }}>
          <option value="">카테고리 선택</option>
          {supportedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select></label>
        <label>시리즈 번호<input type="number" min="1" step="1" inputMode="numeric" value={seriesText} disabled={busy || status === 'saved'} onChange={(event) => { setSeriesText(event.target.value); invalidate() }} /></label>
      </div>
      <label htmlFor="non-news-response-text">비뉴스 canonical 10-section 응답 plain text</label>
      <textarea id="non-news-response-text" className="non-news-response-raw" value={rawText} disabled={busy || status === 'saved'} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(event) => updateRawText(event.target.value)} />
      <div className="non-news-response-actions">
        <button className="primary-button" type="button" disabled={busy || status === 'saved' || !rawText.trim()} onClick={createReview}>10-section 분석</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => {
          setRawText(''); setSelectedCategoryId(''); setSeriesText(''); setCandidate(null); setParseIssues([]); setValidation(null); setValidatedSettingsSignature(null); setStale(false); setWarningsAcknowledged(false); setDuplicateState(idleDuplicateState); setConfirmationOpen(false); setSaveError(null); setStatus('idle')
        }}>workflow 초기화</button>
      </div>
    </section>

    {parseIssues.length ? <div ref={parseAlertRef} tabIndex={-1} className="paste-issues" role="alert"><h3>응답을 분석하지 못했습니다</h3><ul>{parseIssues.map((item, index) => <li key={`${item.code}-${index}`}><code>{item.code}</code> — {item.message}</li>)}</ul></div> : null}
    {candidate ? <>
      <NonNewsResponseImportReview candidate={candidate} validation={validation} stale={authoritativeStale} disabled={busy || status === 'saved'} onChange={invalidate} />
      <section className="import-panel non-news-response-validation-actions">
        <div><h2>검증 및 정확한 중복 검사</h2><p>검증은 활성 카테고리 설정과 직접 입력한 시리즈 번호만 사용합니다.</p></div>
        <button className="primary-button" type="button" disabled={status === 'validating' || status === 'saving' || status === 'saved'} onClick={() => void revalidate()}>{status === 'validating' ? '검증 중' : 'Canonical 재검증 및 DB 중복 검사'}</button>
      </section>
      <div ref={actionAlertRef} tabIndex={-1} className={authoritativeDuplicateState.status === 'clear' ? 'form-success' : 'form-alert'} role={authoritativeDuplicateState.status === 'duplicate' || authoritativeDuplicateState.status === 'incomplete' ? 'alert' : 'status'}>
        DB 중복 검사: {authoritativeDuplicateState.message}
      </div>
      {hasWarnings ? <label className="paste-warning-acknowledgement">
        <input type="checkbox" checked={authoritativeWarningsAcknowledged} disabled={authoritativeStale || status === 'saving' || status === 'saved'} onChange={(event) => setWarningsAcknowledged(event.target.checked)} />
        현재 검증 경고를 확인했으며 초안 저장을 계속합니다.
      </label> : null}
      {saveError ? <div ref={saveAlertRef} tabIndex={-1} className="form-alert" role="alert">{saveError}</div> : null}
      {status === 'saved' ? <div className="form-success" role="status">애플리케이션 초안 한 건을 저장했습니다. 같은 workflow 상태의 반복 저장은 차단됩니다.</div> : null}
      <section className="import-panel non-news-response-save">
        <div><h2>애플리케이션 초안 저장</h2><p>{disabledReason ?? '현재 검증과 정확한 중복 검사가 유효합니다. 저장 전 최종 확인을 여세요.'}</p></div>
        <button className="primary-button" type="button" disabled={!saveEligible} onClick={() => setConfirmationOpen(true)}>최종 저장 확인 열기</button>
      </section>
      {authoritativeConfirmationOpen && validation?.derived ? <section ref={confirmationRef} tabIndex={-1} className="import-panel non-news-response-confirmation" role="dialog" aria-modal="true" aria-labelledby="non-news-response-confirmation-title">
        <h2 id="non-news-response-confirmation-title">초안 한 건 저장 최종 확인</h2>
        <dl><div><dt>카테고리</dt><dd>{selectedCategory?.name ?? validation.derived.categoryId}</dd></div><div><dt>저장 제목</dt><dd>{validation.derived.title}</dd></div><div><dt>slug</dt><dd>{validation.candidate.slug}</dd></div><div><dt>목적지/상태</dt><dd>Daily Brief Note 애플리케이션 / draft</dd></div></dl>
        <p>이 동작은 기존 ChatGPT paste 저장 경계를 통해 정확히 한 번의 초안 write를 시도합니다. WordPress에는 쓰지 않습니다.</p>
        <div className="non-news-response-actions"><button className="primary-button" type="button" disabled={status === 'saving'} onClick={() => void confirmSave()}>{status === 'saving' ? '저장 중' : '초안 한 건 저장 확인'}</button><button className="secondary-button" type="button" disabled={status === 'saving'} onClick={() => setConfirmationOpen(false)}>취소</button></div>
      </section> : null}
    </> : null}
  </section>
}
