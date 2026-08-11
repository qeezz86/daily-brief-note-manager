import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseClient } from '../../shared/supabase/client'
import { canonicalizeImportPayload } from './canonicalizeImportPayload'
import { CONTENT_IMPORT_FORMAT, CONTENT_IMPORT_SCHEMA_VERSION } from './importValidation.constants'
import { collectImportDuplicateCandidates, getImportDuplicateReferenceData } from './importDuplicates.repository'
import type { ImportCategory, ImportReferenceData, ImportValidationResult } from './importValidation.types'
import { mapNormalizedImportItemToPayload } from './mapNormalizedImportItemToPayload'
import { parseWordPressHtml } from './parseWordPressHtml'
import { validateImportBundle } from './validateImportBundle'
import { WordPressHtmlImportPreview } from './WordPressHtmlImportPreview'
import type { WordPressHtmlDraft, WordPressHtmlParserResult } from './wordPressHtmlImport.types'
import { saveWordPressManualPost, WordPressManualRepositoryError, type SaveWordPressManualPostResult } from './wordPressManual.repository'

const emptyReference = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }

function initialDraft(rawHtml: string, result: WordPressHtmlParserResult): WordPressHtmlDraft {
  const category = result.categoryMatches.length === 1 ? result.categoryMatches[0] : null
  const publishedOn = result.publishedOn.value
  return {
    categoryId: category?.id ?? '',
    title: result.title.value ?? '',
    summary: result.summary.value ?? '',
    slug: result.slug.value ?? '',
    status: 'draft',
    briefingDate: category?.contentGroup === 'news' ? publishedOn : null,
    publishedOn,
    publishedAt: null,
    displayId: category?.contentGroup === 'chinese' ? null : result.displayId.value,
    seriesNo: category?.contentGroup === 'news' ? null : result.seriesNo.value,
    wordpressUrl: result.wordpressUrl.value,
    htmlBody: rawHtml,
    seo: { representativeTitle: '', alternativeTitles: ['', '', '', ''], metaDescription: '', focusKeyword: '' },
    image: { prompt: '', alt: '' },
    tags: [],
    sources: result.sources,
    metadata: category?.contentGroup === 'chinese' ? { ...result.chinese } : {},
    newsTracking: null,
  }
}

function bundle(post: WordPressHtmlDraft) {
  return { format: CONTENT_IMPORT_FORMAT, schemaVersion: CONTENT_IMPORT_SCHEMA_VERSION, source: 'wordpress-manual-html-paste', validationMode: 'legacy' as const, posts: [post] }
}

function sourceAmbiguityResolved(draft: WordPressHtmlDraft) {
  const urls = draft.sources.map((source) => source.sourceUrl.trim()).filter(Boolean)
  return urls.length === new Set(urls).size
}

function hasBlockingParserIssue(result: WordPressHtmlParserResult, draft: WordPressHtmlDraft, categories: ImportCategory[]) {
  const contentGroup = categories.find((category) => category.id === draft.categoryId)?.contentGroup
  const resolved = (issue: WordPressHtmlParserResult['issues'][number]) => {
    const code = issue.code
    if (code === 'WORDPRESS_CATEGORY_AMBIGUOUS') return Boolean(draft.categoryId)
    if (code === 'WORDPRESS_TITLE_MISSING' || code === 'WORDPRESS_TITLE_AMBIGUOUS') return Boolean(draft.title.trim())
    if (code === 'WORDPRESS_DATE_AMBIGUOUS') return Boolean(draft.publishedOn)
    if (code === 'WORDPRESS_DISPLAY_ID_AMBIGUOUS') return contentGroup === 'chinese' || Boolean(draft.displayId?.trim())
    if (code === 'WORDPRESS_SERIES_NO_AMBIGUOUS') return contentGroup === 'news' || Boolean(draft.seriesNo)
    if (code === 'WORDPRESS_SLUG_AMBIGUOUS') return Boolean(draft.slug.trim())
    if (code === 'WORDPRESS_URL_AMBIGUOUS') return Boolean(draft.wordpressUrl?.trim())
    if (code === 'SOURCE_CANDIDATE_AMBIGUOUS') return sourceAmbiguityResolved(draft)
    if (code === 'CHINESE_SOURCE_VALUE_AMBIGUOUS') {
      if (contentGroup !== 'chinese') return true
      const field = issue.path.replace(/^metadata\./, '')
      const value = draft.metadata[field]
      return field === 'episodeListIncluded' ? typeof value === 'boolean' : typeof value === 'string' && Boolean(value.trim())
    }
    return false
  }
  return result.issues.some((issue) => issue.severity === 'error' && !resolved(issue))
}

function validationFingerprint(
  draft: WordPressHtmlDraft,
  parserResult: WordPressHtmlParserResult,
  validation: ImportValidationResult,
) {
  const issues = [
    ...parserResult.issues.map((issue) => ({ scope: 'parser', code: issue.code, severity: issue.severity, path: issue.path })),
    ...validation.bundleIssues.map((issue) => ({ scope: 'bundle', code: issue.code, severity: issue.severity, path: issue.path })),
    ...validation.items.flatMap((item) => item.issues.map((issue) => ({ scope: `item:${item.index}`, code: issue.code, severity: issue.severity, path: issue.path }))),
  ].sort((left, right) => left.scope.localeCompare(right.scope)
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
    || left.severity.localeCompare(right.severity))
  return canonicalizeImportPayload({
    payload: mapNormalizedImportItemToPayload(draft, 'legacy'),
    issues,
  })
}

type SaveFunction = (client: DatabaseClient, post: WordPressHtmlDraft) => Promise<SaveWordPressManualPostResult>

export function WordPressHtmlImportWorkflow({
  client,
  categories,
  parse = parseWordPressHtml,
  duplicateLookup = getImportDuplicateReferenceData,
  save = saveWordPressManualPost,
  onSaved,
}: {
  client: DatabaseClient | null
  categories: ImportCategory[]
  parse?: typeof parseWordPressHtml
  duplicateLookup?: typeof getImportDuplicateReferenceData
  save?: SaveFunction
  onSaved?: (result: SaveWordPressManualPostResult) => void
}) {
  const navigate = useNavigate()
  const [rawHtml, setRawHtml] = useState('')
  const [parserResult, setParserResult] = useState<WordPressHtmlParserResult | null>(null)
  const [draft, setDraft] = useState<WordPressHtmlDraft | null>(null)
  const [validation, setValidation] = useState<ImportValidationResult | null>(null)
  const [warningsApproved, setWarningsApproved] = useState(false)
  const [status, setStatus] = useState<'idle' | 'checking' | 'review' | 'saving' | 'failed' | 'saved'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const activeSave = useRef(false)
  const approvalFingerprint = useRef<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  function invalidateAfterRawEdit(value: string) {
    if (activeSave.current) return
    approvalFingerprint.current = null
    setRawHtml(value); setParserResult(null); setDraft(null); setValidation(null); setWarningsApproved(false); setStatus('idle'); setMessage(null)
  }

  function analyze() {
    if (activeSave.current) return
    const next = parse(rawHtml, categories)
    setParserResult(next)
    setDraft(initialDraft(rawHtml, next))
    setValidation(null)
    setWarningsApproved(false)
    approvalFingerprint.current = null
    setStatus('review')
    setMessage(next.issues.some((issue) => issue.severity === 'error') ? '차단 또는 해결이 필요한 후보를 확인하고 필드를 편집해 주세요.' : '로컬 구조 분석이 완료되었습니다. 필드를 확인한 뒤 DB 중복 검사를 실행하세요.')
  }

  function updateDraft(next: WordPressHtmlDraft) {
    approvalFingerprint.current = null
    setDraft(next)
    setValidation(null)
    setWarningsApproved(false)
    setMessage('필드가 변경되어 이전 검증과 중복 검사 상태를 무효화했습니다.')
  }

  async function check(final = false): Promise<{ validation: ImportValidationResult; reference: ImportReferenceData; fingerprint: string } | null> {
    if (!draft || !parserResult) return null
    setStatus(final ? 'saving' : 'checking')
    setMessage(final ? '저장 직전 최종 중복과 검증 상태를 다시 확인하고 있습니다.' : 'DB exact duplicate와 canonical validation을 확인하고 있습니다.')
    try {
      const lookup = client
        ? await duplicateLookup(client, collectImportDuplicateCandidates(bundle(draft)))
        : { databaseCheck: 'unavailable' as const, referenceData: emptyReference }
      if (!mounted.current) return null
      const reference = { categories, ...lookup.referenceData }
      const next = validateImportBundle(bundle(draft), reference, lookup.databaseCheck, 'wordpress-manual')
      setValidation(next)
      if (lookup.databaseCheck !== 'complete') {
        if (final) { approvalFingerprint.current = null; setWarningsApproved(false) }
        setStatus('review'); setMessage('DB 중복 검사가 complete가 아니므로 저장할 수 없습니다. 연결을 확인한 뒤 다시 검사해 주세요.'); return null
      }
      if (hasBlockingParserIssue(parserResult, draft, categories) || next.status === 'invalid' || next.items.some((item) => item.status === 'invalid' || item.status === 'duplicate')) {
        if (final) { approvalFingerprint.current = null; setWarningsApproved(false) }
        setStatus('review'); setMessage(final ? '저장 직전 새 중복 또는 검증 오류가 발견되었습니다. 다시 검토해 주세요.' : '차단 오류 또는 exact duplicate를 해결한 뒤 다시 검사해 주세요.'); return null
      }
      const fingerprint = validationFingerprint(draft, parserResult, next)
      const hasWarnings = next.status === 'warning' || parserResult.issues.some((issue) => issue.severity === 'warning')
      if (!final) {
        setWarningsApproved(false)
        approvalFingerprint.current = hasWarnings ? null : fingerprint
      }
      setStatus('review')
      setMessage(hasWarnings ? '저장 가능한 경고가 있습니다. 모두 검토하고 승인해 주세요.' : 'DB 중복 검사와 canonical validation이 완료되었습니다.')
      return { validation: next, reference, fingerprint }
    } catch {
      if (mounted.current) {
        if (final) { approvalFingerprint.current = null; setWarningsApproved(false) }
        setStatus('review'); setMessage('DB 중복 검사를 완료하지 못했습니다. 저장하지 않았으며 다시 시도해 주세요.')
      }
      return null
    }
  }

  async function confirmAndSave() {
    if (!client || !draft || !parserResult || !validation || activeSave.current) return
    const hasWarnings = validation.status === 'warning' || parserResult.issues.some((issue) => issue.severity === 'warning')
    if (hasWarnings && !warningsApproved) return
    const approvedFingerprint = approvalFingerprint.current
    if (!approvedFingerprint || approvedFingerprint !== validationFingerprint(draft, parserResult, validation)) {
      approvalFingerprint.current = null
      setWarningsApproved(false)
      setMessage('검증 상태가 변경되어 이전 승인을 무효화했습니다. 다시 검사하고 검토해 주세요.')
      return
    }
    if (!window.confirm('WordPress 게시물 한 건을 영구 저장합니다.\n출처 provenance는 서버에서 wordpress_manual로 고정됩니다.\nWordPress 원격 조회·수정·발행 작업은 수행하지 않습니다.')) {
      setMessage('저장을 취소했습니다. DB write는 수행되지 않았습니다.')
      return
    }
    activeSave.current = true
    const final = await check(true)
    if (!final || !mounted.current) { activeSave.current = false; return }
    if (final.fingerprint !== approvedFingerprint) {
      approvalFingerprint.current = null
      setWarningsApproved(false)
      setStatus('review')
      setMessage('저장 직전 검증 상태가 변경되어 이전 승인을 무효화했습니다. 갱신된 결과를 다시 검토하고 승인해 주세요.')
      activeSave.current = false
      return
    }
    try {
      const saved = await save(client, draft)
      if (!mounted.current) return
      setStatus('saved'); setMessage('WordPress manual import 콘텐츠 한 건을 저장했습니다.'); onSaved?.(saved); navigate(`/content/${saved.postId}`)
    } catch (error) {
      if (mounted.current) { setStatus('failed'); setMessage(error instanceof WordPressManualRepositoryError ? error.message : '저장하지 못했습니다. 미리보기는 유지되며 자동 재시도하지 않습니다.') }
    } finally { activeSave.current = false }
  }

  function reset() {
    if (activeSave.current) return
    approvalFingerprint.current = null
    setRawHtml(''); setParserResult(null); setDraft(null); setValidation(null); setWarningsApproved(false); setStatus('idle'); setMessage(null)
  }

  function approveWarnings(approved: boolean) {
    setWarningsApproved(approved)
    approvalFingerprint.current = approved && draft && parserResult && validation
      ? validationFingerprint(draft, parserResult, validation)
      : null
  }

  const hasWarnings = Boolean(validation && (validation.status === 'warning' || parserResult?.issues.some((issue) => issue.severity === 'warning')))
  const canSave = Boolean(client && draft && parserResult && validation?.databaseCheck === 'complete' && validation.status !== 'invalid' && !validation.items.some((item) => item.status === 'invalid' || item.status === 'duplicate') && !hasBlockingParserIssue(parserResult!, draft!, categories) && (!hasWarnings || warningsApproved) && status !== 'checking' && status !== 'saving' && status !== 'saved')

  return <section className="wordpress-html-workflow" aria-labelledby="wordpress-html-workflow-title" aria-busy={status === 'checking' || status === 'saving'}>
    <div className="import-panel">
      <div className="import-panel__heading"><div><h2 id="wordpress-html-workflow-title">WordPress HTML 붙여넣기</h2><p>DOMParser로 브라우저 내부에서만 분석하며 네트워크·AI·WordPress API를 사용하지 않습니다.</p></div></div>
      <label htmlFor="wordpress-html-raw">WordPress HTML 원문</label>
      <textarea id="wordpress-html-raw" className="wordpress-html-raw" value={rawHtml} disabled={status === 'checking' || status === 'saving' || status === 'saved'} onChange={(event) => invalidateAfterRawEdit(event.target.value)} spellCheck={false} />
      <div className="chatgpt-paste-actions"><button className="primary-button" type="button" disabled={status === 'checking' || status === 'saving' || status === 'saved'} onClick={analyze}>로컬 HTML 분석</button><button className="secondary-button" type="button" disabled={status === 'checking' || status === 'saving'} onClick={reset}>붙여넣기 초기화</button></div>
    </div>
    {parserResult && draft ? <>
      <WordPressHtmlImportPreview result={parserResult} draft={draft} categories={categories} validation={validation} disabled={status === 'checking' || status === 'saving' || status === 'saved'} onChange={updateDraft} />
      <section className="import-panel wordpress-html-save-actions">
        <p>뉴스 issue/change-log/watch-points는 추출 미리보기일 뿐 저장되지 않습니다. 저장 시 원본 HTML과 편집한 canonical 필드만 전송합니다.</p>
        {message ? <p role={status === 'failed' ? 'alert' : 'status'} className={status === 'failed' ? 'form-alert' : 'field-help'}>{message}</p> : null}
        <button className="secondary-button" type="button" disabled={status === 'checking' || status === 'saving' || status === 'saved'} onClick={() => void check(false)}>{status === 'checking' ? '검사 중' : 'Canonical 검증 및 DB 중복 검사'}</button>
        {hasWarnings ? <label><input type="checkbox" checked={warningsApproved} disabled={status === 'saving' || status === 'saved'} onChange={(event) => approveWarnings(event.target.checked)} /> legacy 경고와 저장 가능한 모든 경고를 확인했습니다.</label> : null}
        <button className="primary-button" type="button" disabled={!canSave} onClick={() => void confirmAndSave()}>{status === 'saving' ? '최종 검사 및 저장 중' : status === 'failed' ? '수동으로 다시 저장' : '확인 후 WordPress 글 한 건 저장'}</button>
      </section>
    </> : null}
  </section>
}
