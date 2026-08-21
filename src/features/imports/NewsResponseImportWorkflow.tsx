import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseClient } from '../../shared/supabase/client'
import { saveChatGptPastePost } from './chatGptPaste.repository'
import type { ChatGptPastePersistencePayload, SaveChatGptPastePostResult } from './chatGptPaste.types'
import { getImportDuplicateReferenceData, normalizeExactImportTitle } from './importDuplicates.repository'
import type { ImportDuplicateCandidates, ImportDuplicateLookupResult } from './importValidation.types'
import { NewsResponseImportReview } from './NewsResponseImportReview'
import type {
  NewsResponseCandidate, NewsResponseCategorySetting, NewsResponseDuplicateState, NewsResponseParseResult,
  NewsResponseSaveState, NewsResponseValidationAuthority, NewsResponseValidationResult,
} from './newsResponseImport.types'
import { parseNewsResponse } from './parseNewsResponse'
import { extractNewsResponseSources, validateNewsResponse } from './validateNewsResponse'

type DuplicateLookup = (client: DatabaseClient, candidates: ImportDuplicateCandidates) => Promise<ImportDuplicateLookupResult>
type SaveFunction = (client: DatabaseClient, payload: ChatGptPastePersistencePayload) => Promise<SaveChatGptPastePostResult>
const AMBIGUOUS_SAVE_MESSAGE = '초안 저장 결과를 확인하지 못했습니다. 자동 재시도하지 않았습니다. 미리보기와 후보는 유지됩니다. 결과를 확인한 뒤 수동으로 다시 시도하세요.'

function idleDuplicateState(): NewsResponseDuplicateState { return { status: 'idle', candidateRevision: null, databaseCheck: null, duplicateFound: false, message: '아직 중복 검사를 실행하지 않았습니다.' } }
function categorySignature(categories: NewsResponseCategorySetting[]) {
  return JSON.stringify(categories.map(({ id, enabled, contentGroup, name, code, wrapperClass, displayIdPattern, slugPattern }) => ({ id, enabled, contentGroup, name, code, wrapperClass, displayIdPattern, slugPattern })))
}
function duplicateCandidates(validation: NewsResponseValidationResult): ImportDuplicateCandidates {
  const payload = validation.persistencePayload
  return {
    slugs: payload ? [payload.content.slug] : [], displayIds: payload?.content.display_id ? [payload.content.display_id] : [],
    normalizedTitles: payload ? [normalizeExactImportTitle(payload.content.title)] : [], wordpressUrls: [],
    briefingDates: payload ? [payload.content.published_on] : [], seriesNumbers: [], chineseOriginalUrls: [], newsTopicKeys: [],
  }
}
function interpretDuplicateLookup(validation: NewsResponseValidationResult, lookup: ImportDuplicateLookupResult, candidateRevision: number): NewsResponseDuplicateState {
  if (lookup.databaseCheck !== 'complete') return { status: 'incomplete', candidateRevision, databaseCheck: lookup.databaseCheck, duplicateFound: false, message: `DB 중복 검사가 ${lookup.databaseCheck} 상태이므로 저장할 수 없습니다.` }
  const payload = validation.persistencePayload
  if (!payload) return { status: 'incomplete', candidateRevision, databaseCheck: 'unavailable', duplicateFound: false, message: '현재 검증 결과로 중복 authority를 만들 수 없습니다.' }
  const normalizedTitle = normalizeExactImportTitle(payload.content.title)
  const duplicate = lookup.referenceData.posts.some((post) => post.slug === payload.content.slug
    || post.displayId === payload.content.display_id
    || post.categoryId === payload.content.category_id && (post.briefingDate ?? post.publishedOn) === payload.content.published_on
    || normalizeExactImportTitle(post.title) === normalizedTitle)
  return duplicate
    ? { status: 'duplicate', candidateRevision, databaseCheck: 'complete', duplicateFound: true, message: 'slug, 카테고리+날짜, display ID 또는 정규화 exact title 중복이 발견되었습니다.' }
    : { status: 'clear', candidateRevision, databaseCheck: 'complete', duplicateFound: false, message: '현재 revision의 complete 정확 중복 검사에 충돌이 없습니다.' }
}

export function NewsResponseImportWorkflow({ client, categories, parse = parseNewsResponse, validate = validateNewsResponse, duplicateLookup = getImportDuplicateReferenceData, save = saveChatGptPastePost, onSaved }: {
  client: DatabaseClient | null
  categories: NewsResponseCategorySetting[]
  parse?: (input: string) => NewsResponseParseResult
  validate?: typeof validateNewsResponse
  duplicateLookup?: DuplicateLookup
  save?: SaveFunction
  onSaved?: (result: SaveChatGptPastePostResult) => void
}) {
  const navigate = useNavigate()
  const supportedCategories = useMemo(() => categories.filter((category) => category.enabled && category.contentGroup === 'news'), [categories])
  const settingsSignature = categorySignature(supportedCategories)
  const settingsAuthorityRef = useRef({ signature: settingsSignature, generation: 0 })
  const [rawText, setRawText] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [briefingDate, setBriefingDate] = useState('')
  const [candidate, setCandidate] = useState<NewsResponseCandidate | null>(null)
  const [candidateRevision, setCandidateRevision] = useState(0)
  const revisionRef = useRef(0)
  const [parseIssues, setParseIssues] = useState<NewsResponseParseResult['issues']>([])
  const [validationAuthority, setValidationAuthority] = useState<NewsResponseValidationAuthority | null>(null)
  const [duplicateState, setDuplicateState] = useState<NewsResponseDuplicateState>(idleDuplicateState)
  const [warningAcknowledgementRevision, setWarningAcknowledgementRevision] = useState<number | null>(null)
  const [confirmationRevision, setConfirmationRevision] = useState<number | null>(null)
  const [validating, setValidating] = useState(false)
  const [saveState, setSaveState] = useState<NewsResponseSaveState>({ status: 'idle' })
  const activeSaveRef = useRef(false)

  function synchronizeSettingsAuthority(node: HTMLElement | null) {
    if (!node || settingsAuthorityRef.current.signature === settingsSignature) return
    settingsAuthorityRef.current = { signature: settingsSignature, generation: settingsAuthorityRef.current.generation + 1 }
  }

  function advanceRevision() { revisionRef.current += 1; setCandidateRevision(revisionRef.current) }
  function invalidate(nextCandidate: NewsResponseCandidate | null = candidate) {
    setCandidate(nextCandidate); advanceRevision(); setWarningAcknowledgementRevision(null); setConfirmationRevision(null); setDuplicateState(idleDuplicateState());
    if (saveState.status !== 'saved') setSaveState({ status: 'idle' })
  }
  function updateRawText(value: string) { setRawText(value); setParseIssues([]); invalidate(candidate) }
  function reset() {
    if (activeSaveRef.current) return
    setRawText(''); setSelectedCategoryId(''); setBriefingDate(''); setCandidate(null); setParseIssues([]); setValidationAuthority(null); setDuplicateState(idleDuplicateState()); setWarningAcknowledgementRevision(null); setConfirmationRevision(null); setValidating(false); setSaveState({ status: 'idle' }); advanceRevision()
  }
  function createReview() {
    if (activeSaveRef.current || saveState.status === 'saved') return
    const result = parse(rawText)
    setParseIssues(result.issues); setValidationAuthority(null); setDuplicateState(idleDuplicateState()); setWarningAcknowledgementRevision(null); setConfirmationRevision(null); setSaveState({ status: 'idle' })
    const next = result.candidate ? { ...result.candidate, sources: extractNewsResponseSources(new DOMParser().parseFromString(result.candidate.wordpressHtml, 'text/html')) } : null
    setCandidate(next); advanceRevision()
  }
  async function checkDuplicates(nextValidation: NewsResponseValidationResult, revision: number) {
    if (!client || !nextValidation.persistencePayload) return { status: 'incomplete', candidateRevision: revision, databaseCheck: 'unavailable', duplicateFound: false, message: 'Supabase 연결 또는 현재 검증 payload가 없어 중복 검사를 완료할 수 없습니다.' } as NewsResponseDuplicateState
    try { return interpretDuplicateLookup(nextValidation, await duplicateLookup(client, duplicateCandidates(nextValidation)), revision) }
    catch { return { status: 'incomplete', candidateRevision: revision, databaseCheck: 'unavailable', duplicateFound: false, message: 'DB 중복 검사를 완료하지 못했습니다. 저장하지 않았습니다.' } as NewsResponseDuplicateState }
  }
  async function revalidate() {
    if (!candidate || validating || activeSaveRef.current || saveState.status === 'saved') return
    const revision = revisionRef.current
    setValidating(true); setDuplicateState({ status: 'checking', candidateRevision: revision, databaseCheck: null, duplicateFound: false, message: '현재 revision의 중복을 확인하고 있습니다.' }); setWarningAcknowledgementRevision(null); setConfirmationRevision(null); setSaveState({ status: 'idle' })
    const category = supportedCategories.find((item) => item.id === selectedCategoryId) ?? null
    const result = validate(candidate, category, briefingDate)
    setValidationAuthority({ candidateRevision: revision, categorySettingsSignature: settingsSignature, result })
    if (result.status === 'invalid') { setDuplicateState(idleDuplicateState()); setValidating(false); return }
    const duplicates = await checkDuplicates(result, revision)
    setDuplicateState(duplicates); setValidating(false)
  }

  const stale = Boolean(validationAuthority && (validationAuthority.candidateRevision !== candidateRevision || validationAuthority.categorySettingsSignature !== settingsSignature))
  const validation = validationAuthority?.result ?? null
  const currentValidation = !stale && validationAuthority?.candidateRevision === candidateRevision ? validationAuthority.result : null
  const currentDuplicate = !stale && duplicateState.candidateRevision === candidateRevision ? duplicateState : idleDuplicateState()
  const hasWarnings = currentValidation?.issues.some((item) => item.status === 'warning') ?? false
  const warningsAcknowledged = !hasWarnings || warningAcknowledgementRevision === candidateRevision
  const confirmationOpen = confirmationRevision === candidateRevision && !stale
  const saveEligible = Boolean(currentValidation?.persistencePayload && currentValidation.status !== 'invalid' && currentDuplicate.status === 'clear' && warningsAcknowledged && !validating && saveState.status !== 'saving' && saveState.status !== 'saved')
  const selectedCategory = supportedCategories.find((item) => item.id === selectedCategoryId) ?? null
  const busy = validating || saveState.status === 'saving'

  async function confirmSave() {
    if (!saveEligible || !currentValidation?.persistencePayload || confirmationRevision !== candidateRevision || activeSaveRef.current || !validationAuthority) return
    const settingsAuthority = settingsAuthorityRef.current
    if (validationAuthority.candidateRevision !== candidateRevision || validationAuthority.categorySettingsSignature !== settingsAuthority.signature) return
    const confirmedAuthority = {
      candidateRevision: validationAuthority.candidateRevision,
      categorySettingsSignature: validationAuthority.categorySettingsSignature,
      categorySettingsGeneration: settingsAuthority.generation,
    }
    activeSaveRef.current = true; setSaveState({ status: 'saving' })
    try {
      const fresh = await checkDuplicates(currentValidation, confirmedAuthority.candidateRevision)
      setDuplicateState(fresh)
      const latestSettingsAuthority = settingsAuthorityRef.current
      if (fresh.status !== 'clear'
        || revisionRef.current !== confirmedAuthority.candidateRevision
        || latestSettingsAuthority.signature !== confirmedAuthority.categorySettingsSignature
        || latestSettingsAuthority.generation !== confirmedAuthority.categorySettingsGeneration) {
        setConfirmationRevision(null); setSaveState({ status: 'idle' }); return
      }
      if (!client) throw new Error('PERSISTENCE_UNAVAILABLE')
      const result = await save(client, currentValidation.persistencePayload)
      setSaveState({ status: 'saved' }); setConfirmationRevision(null); onSaved?.(result); navigate(`/content/${result.postId}`)
    } catch {
      setSaveState({ status: 'failed', message: AMBIGUOUS_SAVE_MESSAGE }); setConfirmationRevision(null)
    } finally { activeSaveRef.current = false }
  }

  const disabledReason = !candidate ? '먼저 canonical 뉴스 응답을 분석하세요.' : stale ? '후보·카테고리·날짜 또는 설정이 변경되어 명시적 재검증이 필요합니다.' : currentValidation?.status === 'invalid' ? '저장 차단 검증 항목을 수정하세요.' : currentDuplicate.status !== 'clear' ? 'complete이며 clear인 네 가지 정확 중복 authority가 필요합니다.' : !warningsAcknowledged ? '현재 revision의 경고를 확인하고 승인하세요.' : saveState.status === 'saved' ? '현재 workflow revision은 이미 저장되었습니다.' : null

  return <section ref={synchronizeSettingsAuthority} className="non-news-response-workflow" aria-labelledby="news-response-workflow-title" aria-busy={busy}>
    <section className="import-panel non-news-response-input"><div className="import-panel__heading"><div><h2 id="news-response-workflow-title">뉴스 일반 응답 붙여넣기</h2><p>정확한 10개 section과 명시적 카테고리·브리핑 날짜만 사용합니다. 원문과 checklist는 저장하지 않습니다.</p></div></div>
      <div className="non-news-response-grid"><label>뉴스 카테고리<select value={selectedCategoryId} disabled={busy || saveState.status === 'saved'} onChange={(event) => { setSelectedCategoryId(event.target.value); invalidate() }}><option value="">카테고리 선택</option>{supportedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>브리핑 날짜<input type="date" value={briefingDate} disabled={busy || saveState.status === 'saved'} onChange={(event) => { setBriefingDate(event.target.value); invalidate() }} /></label></div>
      <label htmlFor="news-response-text">뉴스 canonical 10-section 응답 plain text</label><textarea id="news-response-text" className="non-news-response-raw" value={rawText} disabled={busy || saveState.status === 'saved'} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(event) => updateRawText(event.target.value)} />
      <div className="non-news-response-actions"><button className="primary-button" type="button" disabled={busy || saveState.status === 'saved' || !rawText.trim()} onClick={createReview}>뉴스 10-section 분석</button><button className="secondary-button" type="button" disabled={busy} onClick={reset}>workflow 초기화</button></div>
    </section>
    {parseIssues.length ? <div tabIndex={-1} className="paste-issues" role="alert"><h3>뉴스 응답을 분석하지 못했습니다</h3><ul>{parseIssues.map((item, index) => <li key={`${item.code}-${index}`}><code>{item.code}</code> — {item.message}</li>)}</ul></div> : null}
    {candidate ? <><NewsResponseImportReview candidate={candidate} categoryName={selectedCategory?.name ?? ''} briefingDate={briefingDate} derived={validation?.derived ?? null} validation={validation} stale={stale} duplicateMessage={currentDuplicate.message} saveState={saveState.status} disabled={busy || saveState.status === 'saved'} onChange={invalidate} />
      <section className="import-panel non-news-response-validation-actions"><div><h2>검증 및 complete 정확 중복 검사</h2><p>slug·카테고리+날짜·display ID·정규화 exact title을 독립적으로 확인합니다.</p></div><button className="primary-button" type="button" disabled={busy || saveState.status === 'saved'} onClick={() => void revalidate()}>{validating ? '검증 중' : '뉴스 재검증 및 DB 중복 검사'}</button></section>
      <div className={currentDuplicate.status === 'clear' ? 'form-success' : 'form-alert'} role={currentDuplicate.status === 'duplicate' || currentDuplicate.status === 'incomplete' ? 'alert' : 'status'}>DB 중복 검사: {currentDuplicate.message}</div>
      {hasWarnings ? <label className="paste-warning-acknowledgement"><input type="checkbox" checked={warningAcknowledgementRevision === candidateRevision} disabled={stale || busy || saveState.status === 'saved'} onChange={(event) => setWarningAcknowledgementRevision(event.target.checked ? candidateRevision : null)} />현재 revision의 검증 경고를 확인했으며 초안 저장을 계속합니다.</label> : null}
      {saveState.status === 'failed' ? <div className="form-alert" role="alert">{saveState.message}</div> : null}{saveState.status === 'saved' ? <div className="form-success" role="status">뉴스 애플리케이션 초안 한 건을 저장했습니다. 같은 revision의 반복 저장은 차단됩니다.</div> : null}
      <section className="import-panel non-news-response-save"><div><h2>뉴스 애플리케이션 초안 저장</h2><p>{disabledReason ?? '현재 revision의 검증·중복·경고 authority가 유효합니다.'}</p></div><button className="primary-button" type="button" disabled={!saveEligible} onClick={() => setConfirmationRevision(candidateRevision)}>최종 저장 확인 열기</button></section>
      {confirmationOpen && currentValidation?.derived ? <section tabIndex={-1} className="import-panel non-news-response-confirmation" role="dialog" aria-modal="true" aria-labelledby="news-response-confirmation-title"><h2 id="news-response-confirmation-title">뉴스 초안 한 건 저장 최종 확인</h2>
        <dl><div><dt>카테고리</dt><dd>{selectedCategory?.name ?? currentValidation.derived.categoryId}</dd></div><div><dt>브리핑 날짜</dt><dd>{currentValidation.derived.briefingDate}</dd></div><div><dt>최종 제목</dt><dd>{currentValidation.derived.title}</dd></div><div><dt>display ID</dt><dd>{currentValidation.derived.displayId}</dd></div><div><dt>slug</dt><dd>{currentValidation.candidate.slug}</dd></div><div><dt>상태</dt><dd>draft</dd></div></dl>
        <p>기존 ChatGPT paste 저장 경계로 정확히 한 번의 draft write를 시도합니다. 뉴스 tracking과 WordPress에는 쓰지 않습니다.</p><div className="non-news-response-actions"><button className="primary-button" type="button" disabled={saveState.status === 'saving'} onClick={() => void confirmSave()}>{saveState.status === 'saving' ? '저장 중' : '뉴스 초안 한 건 저장 확인'}</button><button className="secondary-button" type="button" disabled={saveState.status === 'saving'} onClick={() => setConfirmationRevision(null)}>취소</button></div>
      </section> : null}
    </> : null}
  </section>
}
