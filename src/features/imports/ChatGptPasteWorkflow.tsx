import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseClient } from '../../shared/supabase/client'
import { saveChatGptPastePost } from './chatGptPaste.repository'
import { ChatGptPastePreview } from './ChatGptPastePreview'
import {
  ChatGptPasteRepositoryError,
  type ChatGptPasteParserResult,
  type ChatGptPastePersistencePayload,
  type ChatGptPasteWorkflowStatus,
  type SaveChatGptPastePostResult,
} from './chatGptPaste.types'
import { parseChatGptPaste } from './parseChatGptPaste'

type SaveFunction = (
  client: DatabaseClient,
  payload: ChatGptPastePersistencePayload,
) => Promise<SaveChatGptPastePostResult>

export function ChatGptPasteWorkflow({
  client,
  parse = parseChatGptPaste,
  save = saveChatGptPastePost,
  onSaved,
}: {
  client: DatabaseClient | null
  parse?: (input: string) => ChatGptPasteParserResult
  save?: SaveFunction
  onSaved?: (result: SaveChatGptPastePostResult) => void
}) {
  const navigate = useNavigate()
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<ChatGptPasteParserResult | null>(null)
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [status, setStatus] = useState<ChatGptPasteWorkflowStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeSaveRef = useRef(false)
  const mountedRef = useRef(true)
  const parseAlertRef = useRef<HTMLDivElement>(null)
  const saveAlertRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  useEffect(() => {
    if (status === 'invalid-preview') parseAlertRef.current?.focus()
    if (status === 'save-failed') saveAlertRef.current?.focus()
  }, [status])

  function updateInput(value: string) {
    setRawText(value)
    setResult(null)
    setWarningsAcknowledged(false)
    setSaveError(null)
    setStatus('idle')
  }

  async function createPreview() {
    if (activeSaveRef.current) return
    setStatus('parsing')
    setSaveError(null)
    setWarningsAcknowledged(false)
    await Promise.resolve()
    if (!mountedRef.current) return
    const next = parse(rawText)
    setResult(next)
    if (!next.saveEligibility.isEligible) setStatus('invalid-preview')
    else if (next.saveEligibility.requiresWarningAcknowledgement) setStatus('awaiting-warning-acknowledgement')
    else setStatus('ready-to-confirm')
  }

  function acknowledgeWarnings(acknowledged: boolean) {
    setWarningsAcknowledged(acknowledged)
    setStatus(acknowledged ? 'ready-to-confirm' : 'awaiting-warning-acknowledgement')
  }

  function reset() {
    if (activeSaveRef.current) return
    setRawText('')
    setResult(null)
    setWarningsAcknowledged(false)
    setSaveError(null)
    setStatus('idle')
  }

  async function confirmSave() {
    if (
      activeSaveRef.current
      || status === 'saved'
      || !result?.saveEligibility.isEligible
      || !result.persistencePayload
      || result.saveEligibility.requiresWarningAcknowledgement && !warningsAcknowledged
    ) return
    activeSaveRef.current = true
    setStatus('saving')
    setSaveError(null)
    try {
      if (!client) throw new Error('PERSISTENCE_UNAVAILABLE')
      const saved = await save(client, result.persistencePayload)
      if (!mountedRef.current) return
      setStatus('saved')
      onSaved?.(saved)
      navigate(`/content/${saved.postId}`)
    } catch (error) {
      if (!mountedRef.current) return
      setSaveError(error instanceof ChatGptPasteRepositoryError
        ? `${error.message} 미리보기는 유지되며 수동으로 다시 시도할 수 있습니다.`
        : '콘텐츠를 저장하지 못했습니다. 미리보기는 유지됩니다. 연결과 로그인 상태를 확인한 뒤 수동으로 다시 시도해 주세요.')
      setStatus('save-failed')
    } finally {
      activeSaveRef.current = false
    }
  }

  const warningReady = !result?.saveEligibility.requiresWarningAcknowledgement || warningsAcknowledged
  const canConfirm = Boolean(result?.saveEligibility.isEligible && result.persistencePayload && warningReady && status !== 'saving' && status !== 'saved')

  return <section className="chatgpt-paste-workflow" aria-labelledby="chatgpt-paste-workflow-title" aria-busy={status === 'parsing' || status === 'saving'}>
    <div className="import-panel chatgpt-paste-input">
      <div className="import-panel__heading"><div>
        <h2 id="chatgpt-paste-workflow-title">ChatGPT 구조화 응답 붙여넣기</h2>
        <p>분석은 브라우저 안에서만 수행됩니다. 원문은 저장 요청에 포함되지 않습니다.</p>
      </div></div>
      <label htmlFor="chatgpt-paste-text">구조화 ChatGPT 응답 plain text</label>
      <textarea
        id="chatgpt-paste-text"
        className="chatgpt-paste-textarea"
        value={rawText}
        disabled={status === 'parsing' || status === 'saving' || status === 'saved'}
        onChange={(event) => updateInput(event.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="chatgpt-paste-actions">
        <button className="primary-button" type="button" disabled={status === 'parsing' || status === 'saving' || status === 'saved'} onClick={() => void createPreview()}>{status === 'parsing' ? '분석 중' : '로컬 미리보기 생성'}</button>
        <button className="secondary-button" type="button" disabled={status === 'parsing' || status === 'saving'} onClick={reset}>붙여넣기 초기화</button>
      </div>
    </div>

    {result ? <>
      <div ref={parseAlertRef} tabIndex={-1} role={result.blockingIssues.length ? 'alert' : 'status'} className="paste-result-announcement">
        {result.blockingIssues.length ? `미리보기에서 차단 오류 ${result.blockingIssues.length}개를 확인해 주세요.` : `로컬 미리보기가 준비되었습니다. 경고 ${result.warnings.length}개입니다.`}
      </div>
      <ChatGptPastePreview result={result} />
      {result.saveEligibility.requiresWarningAcknowledgement ? <label className="paste-warning-acknowledgement">
        <input type="checkbox" checked={warningsAcknowledged} disabled={status === 'saving' || status === 'saved'} onChange={(event) => acknowledgeWarnings(event.target.checked)} />
        저장에서 제외되는 항목과 모든 경고를 확인했습니다.
      </label> : null}
      {saveError ? <p ref={saveAlertRef} tabIndex={-1} className="form-alert" role="alert">{saveError}</p> : null}
      {status === 'saved' ? <p className="form-success" role="status">콘텐츠 한 건을 저장했습니다. 상세 화면으로 이동합니다.</p> : null}
      <div className="chatgpt-paste-confirm">
        <p>확인 전에는 DB에 아무것도 저장되지 않습니다. NEWS_TRACKING_JSON은 이번 저장에서 제외됩니다.</p>
        <button className="primary-button" type="button" disabled={!canConfirm} onClick={() => void confirmSave()}>
          {status === 'saving' ? '저장 중' : status === 'save-failed' ? '수동으로 다시 저장' : '미리보기 확인 후 한 건 저장'}
        </button>
      </div>
    </> : null}
  </section>
}
