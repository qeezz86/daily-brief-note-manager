import { Link } from 'react-router-dom'
import { briefingPromptModeLabels } from './briefingPrompts.types'
import { formatPromptRunDateTime, summarizePromptText } from './briefingPromptRuns'
import type { BriefingPromptRun } from './briefingPrompts.types'

export function BriefingPromptRunList({ runs }: { runs: BriefingPromptRun[] }) {
  if (!runs.length) {
    return <div className="content-state"><p>조건에 맞는 프롬프트 이력이 없습니다.</p></div>
  }
  return <ul className="content-list" aria-label="프롬프트 이력 목록">
    {runs.map((run) => <li key={run.id}><article className="content-card">
      <div className="content-card__heading"><div>
        <p className="content-card__category">{run.contextSnapshot.category.name}</p>
        <h2><Link to={`/briefing-prompts/history/${run.id}`}>{summarizePromptText(run.promptText)}</Link></h2>
      </div><span className={`status-badge${run.isPinned ? ' status-badge--published' : ''}`}>{run.isPinned ? '고정' : '미고정'}</span></div>
      <dl className="content-card__details">
        <div><dt>기준일</dt><dd>{run.referenceDate}</dd></div>
        <div><dt>모드</dt><dd>{briefingPromptModeLabels[run.promptMode]}</dd></div>
        <div><dt>생성 시각</dt><dd>{formatPromptRunDateTime(run.generatedAt)}</dd></div>
        <div><dt>Context 요약</dt><dd>게시물 {run.contextSnapshot.counts.recentPosts} · 추적 {run.contextSnapshot.counts.openTopics} · 후속 {run.contextSnapshot.counts.pendingFollowups} · 종료 {run.contextSnapshot.counts.recentClosedTopics}</dd></div>
      </dl>
    </article></li>)}
  </ul>
}
