import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { copyTextToClipboard } from '../features/briefingPrompts/copyTextToClipboard'
import { formatPromptRunDateTime } from '../features/briefingPrompts/briefingPromptRuns'
import {
  usePromptRunQuery,
  useSetPromptRunPinnedMutation,
} from '../features/briefingPrompts/briefingPrompts.queries'
import { briefingPromptModeLabels } from '../features/briefingPrompts/briefingPrompts.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

type CopyState = { target: 'prompt' | 'json'; status: 'success' | 'error' } | null

export function BriefingPromptRunDetailPageContent({
  client = supabase,
  userId,
  runId,
}: {
  client?: DatabaseClient | null
  userId: string
  runId: string
}) {
  const navigate = useNavigate()
  const query = usePromptRunQuery(client, userId, runId)
  const pinMutation = useSetPromptRunPinnedMutation(client, userId, runId)
  const [copyState, setCopyState] = useState<CopyState>(null)
  const [pinMessage, setPinMessage] = useState<string | null>(null)
  const copyOperation = useRef(0)
  async function copy(target: 'prompt' | 'json', text: string) {
    const operation = ++copyOperation.current
    setCopyState(null)
    try {
      await copyTextToClipboard(text)
      if (copyOperation.current === operation) setCopyState({ target, status: 'success' })
    } catch {
      if (copyOperation.current === operation) setCopyState({ target, status: 'error' })
    }
  }
  async function togglePin() {
    if (!query.data) return
    setPinMessage(null)
    try {
      const run = await pinMutation.mutateAsync(!query.data.isPinned)
      if (!run) {
        navigate('/briefing-prompts/history', { replace: true })
        return
      }
      setPinMessage(run.isPinned ? '프롬프트를 고정했습니다.' : '프롬프트 고정을 해제했습니다.')
    } catch {
      setPinMessage('프롬프트 고정 상태를 변경하지 못했습니다.')
    }
  }
  if (!client) return <div className="content-state content-state--error" role="alert"><h1>Supabase 연결이 설정되지 않았습니다</h1><p>공개 Supabase 환경 변수를 확인해 주세요.</p></div>
  if (query.isPending) return <div className="content-state" role="status">프롬프트 이력을 불러오고 있습니다.</div>
  if (query.isError) return <div className="content-state content-state--error" role="alert"><h1>프롬프트 이력을 불러오지 못했습니다</h1><p>{query.error.message}</p></div>
  const run = query.data
  if (!run) return <div className="content-state content-state--error" role="alert"><h1>프롬프트 이력을 찾을 수 없습니다</h1><p>삭제되었거나 접근 권한이 없는 이력입니다.</p><Link to="/briefing-prompts/history">이력 목록으로</Link></div>
  const json = JSON.stringify(run.contextSnapshot, null, 2)
  const validationStatus = run.promptValidationSummary?.status === 'warning' ? '경고 있음' : '유효'
  return <article className="content-detail" aria-labelledby="prompt-run-title">
    <div className="page-heading-with-actions"><div><p className="dashboard__eyebrow">Saved prompt</p><h1 id="prompt-run-title">{run.contextSnapshot.category.name} 프롬프트 이력</h1><p>저장 당시 snapshot만 표시하며 현재 뉴스 데이터로 다시 생성하지 않습니다.</p></div><Link className="secondary-button" to="/briefing-prompts/history">이력 목록으로</Link></div>
    <dl className="content-detail__metadata">
      <div><dt>카테고리</dt><dd>{run.contextSnapshot.category.name}</dd></div>
      <div><dt>기준일</dt><dd>{run.referenceDate}</dd></div>
      <div><dt>모드</dt><dd>{briefingPromptModeLabels[run.promptMode]}</dd></div>
      <div><dt>종료 뉴스 조회 기간</dt><dd>{run.closedLookbackDays}일</dd></div>
      <div><dt>생성 시각</dt><dd>{formatPromptRunDateTime(run.generatedAt)}</dd></div>
      <div><dt>고정 상태</dt><dd>{run.isPinned ? '고정' : '미고정'}</dd></div>
      <div><dt>Context schema</dt><dd>v{run.contextSchemaVersion}</dd></div>
      <div><dt>Template version</dt><dd>{run.promptTemplateVersion === null ? '기록 없음 (이전 이력)' : `v${run.promptTemplateVersion}`}</dd></div>
      <div><dt>저장 당시 검증</dt><dd>{run.promptValidationVersion === null || !run.promptValidationSummary ? '검증 기록 없음 (이전 이력)' : `${validationStatus} · v${run.promptValidationVersion} · 경고 ${run.promptValidationSummary.warningCount} · 통과 ${run.promptValidationSummary.checkCount}`}</dd></div>
      <div><dt>저장 당시 집계</dt><dd>게시물 {run.contextSnapshot.counts.recentPosts} · 뉴스 항목 {run.contextSnapshot.counts.recentUpdates} · 추적 {run.contextSnapshot.counts.openTopics} · 후속 {run.contextSnapshot.counts.pendingFollowups} · 종료 {run.contextSnapshot.counts.recentClosedTopics}</dd></div>
    </dl>
    <div className="detail-actions"><button className="primary-button" type="button" disabled={pinMutation.isPending} onClick={() => void togglePin()}>{pinMutation.isPending ? '변경 중' : run.isPinned ? '고정 해제' : '고정'}</button></div>
    {pinMessage ? <p className={pinMutation.isError ? 'form-alert' : 'form-success'} role={pinMutation.isError ? 'alert' : 'status'}>{pinMessage}</p> : null}
    <section className="prompt-panel content-detail__section" aria-labelledby="saved-prompt-text"><div className="prompt-panel__heading"><h2 id="saved-prompt-text">저장된 프롬프트</h2><button className="secondary-button" type="button" onClick={() => void copy('prompt', run.promptText)}>프롬프트 복사</button></div><textarea className="prompt-preview" value={run.promptText} readOnly aria-label="저장된 프롬프트" />{copyState?.target === 'prompt' ? <p className={copyState.status === 'success' ? 'form-success' : 'form-alert'} role="status">{copyState.status === 'success' ? '프롬프트를 복사했습니다.' : '프롬프트를 복사하지 못했습니다.'}</p> : null}</section>
    <section className="prompt-panel content-detail__section" aria-labelledby="saved-context-json"><div className="prompt-panel__heading"><h2 id="saved-context-json">저장된 Context JSON</h2><button className="secondary-button" type="button" onClick={() => void copy('json', json)}>Context JSON 복사</button></div><pre className="prompt-json">{json}</pre>{copyState?.target === 'json' ? <p className={copyState.status === 'success' ? 'form-success' : 'form-alert'} role="status">{copyState.status === 'success' ? 'Context JSON을 복사했습니다.' : 'Context JSON을 복사하지 못했습니다.'}</p> : null}</section>
  </article>
}

export function BriefingPromptRunDetailPage() {
  const { user } = useAuth()
  const { runId = '' } = useParams()
  return <BriefingPromptRunDetailPageContent userId={user?.id ?? ''} runId={runId} />
}
