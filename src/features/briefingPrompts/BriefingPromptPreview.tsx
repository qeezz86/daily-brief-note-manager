import { useRef, useState } from 'react'
import { copyTextToClipboard } from './copyTextToClipboard'
import type { NewsBriefingPromptContext } from './briefingPrompts.types'

type CopyState = { target: 'prompt' | 'json'; status: 'success' | 'error' } | null

export function BriefingPromptPreview({ context, prompt }: { context: NewsBriefingPromptContext; prompt: string }) {
  const [copyState, setCopyState] = useState<CopyState>(null)
  const operation = useRef(0)
  const json = JSON.stringify(context, null, 2)
  async function copy(target: 'prompt' | 'json', text: string) {
    const current = ++operation.current
    setCopyState(null)
    try { await copyTextToClipboard(text); if (operation.current === current) setCopyState({ target, status: 'success' }) }
    catch { if (operation.current === current) setCopyState({ target, status: 'error' }) }
  }
  const counts = context.counts
  const warnings = [
    !counts.recentPosts && '최근 브리핑이 없습니다.',
    !counts.openTopics && '추적 중인 뉴스 주제가 없습니다.',
    !counts.pendingFollowups && '미완료 후속 확인 항목이 없습니다.',
    !counts.recentClosedTopics && '조회 기간 내 종료된 주제가 없습니다.',
  ].filter(Boolean) as string[]
  return <div className="prompt-results">
    <section className="prompt-panel" aria-labelledby="prompt-counts"><h2 id="prompt-counts">집계 현황</h2><dl className="prompt-counts"><div><dt>최근 브리핑</dt><dd>{counts.recentPosts}</dd></div><div><dt>최근 뉴스 항목</dt><dd>{counts.recentUpdates}</dd></div><div><dt>추적 중 주제</dt><dd>{counts.openTopics}</dd></div><div><dt>pending 후속</dt><dd>{counts.pendingFollowups}</dd></div><div><dt>마감 초과</dt><dd>{counts.overdueFollowups}</dd></div><div><dt>최근 종료 주제</dt><dd>{counts.recentClosedTopics}</dd></div></dl></section>
    <section className="prompt-panel" aria-labelledby="prompt-warnings"><h2 id="prompt-warnings">경고</h2>{warnings.length ? <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>현재 집계 경고가 없습니다.</p>}</section>
    <section className="prompt-panel" aria-labelledby="prompt-preview"><div className="prompt-panel__heading"><h2 id="prompt-preview">프롬프트 미리보기</h2><button className="secondary-button" type="button" onClick={() => void copy('prompt', prompt)}>프롬프트 복사</button></div><textarea className="prompt-preview" value={prompt} readOnly aria-label="복사용 프롬프트" />{copyState?.target === 'prompt' ? <p className={copyState.status === 'success' ? 'form-success' : 'form-alert'} role="status">{copyState.status === 'success' ? '프롬프트를 복사했습니다.' : '프롬프트를 복사하지 못했습니다.'}</p> : null}</section>
    <details className="prompt-panel"><summary>구조화 데이터 보기</summary><div className="prompt-panel__heading"><h2>Context JSON</h2><button className="secondary-button" type="button" onClick={() => void copy('json', json)}>구조화 JSON 복사</button></div><pre className="prompt-json">{json}</pre>{copyState?.target === 'json' ? <p className={copyState.status === 'success' ? 'form-success' : 'form-alert'} role="status">{copyState.status === 'success' ? '구조화 JSON을 복사했습니다.' : '구조화 JSON을 복사하지 못했습니다.'}</p> : null}</details>
  </div>
}
