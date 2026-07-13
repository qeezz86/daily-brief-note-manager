import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { BriefingPromptRunList } from '../features/briefingPrompts/BriefingPromptRunList'
import { filterPromptRuns } from '../features/briefingPrompts/briefingPromptRuns'
import { usePromptRunHistoryQuery } from '../features/briefingPrompts/briefingPrompts.queries'
import {
  briefingPromptModeLabels,
  briefingPromptModes,
  type BriefingPromptRunFilters,
} from '../features/briefingPrompts/briefingPrompts.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const initialFilters: BriefingPromptRunFilters = { categoryId: '', promptMode: '', pin: 'all' }

export function BriefingPromptHistoryPageContent({
  client = supabase,
  userId,
}: {
  client?: DatabaseClient | null
  userId: string
}) {
  const [filters, setFilters] = useState(initialFilters)
  const query = usePromptRunHistoryQuery(client, userId)
  const categories = useMemo(() => {
    const values = new Map((query.data ?? []).map((run) => [run.categoryId, run.contextSnapshot.category.name]))
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko-KR'))
  }, [query.data])
  const runs = useMemo(() => filterPromptRuns(query.data ?? [], filters), [query.data, filters])
  if (!client) return <div className="content-state content-state--error" role="alert"><h1>Supabase 연결이 설정되지 않았습니다</h1><p>공개 Supabase 환경 변수를 확인해 주세요.</p></div>
  return <section className="content-page" aria-labelledby="prompt-history-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">Prompt history</p><h1 id="prompt-history-title">프롬프트 이력</h1><p>생성 당시의 프롬프트와 context snapshot을 그대로 확인합니다.</p></div><div className="content-page__heading-actions"><Link className="secondary-button" to="/briefing-prompts">프롬프트 생성</Link></div></div>
    <aside className="prompt-retention-notice" aria-label="프롬프트 보존 정책">
      <p>카테고리별 고정하지 않은 최근 프롬프트 30개를 보관합니다. 고정한 프롬프트는 자동 정리 대상에서 제외됩니다.</p>
      <p>오래된 고정 프롬프트를 해제하면 해당 카테고리의 보존 한도를 초과한 이력이 자동 정리될 수 있습니다.</p>
    </aside>
    <div className="content-filters" aria-label="프롬프트 이력 필터">
      <div className="content-filter-field"><label htmlFor="history-category">카테고리</label><select id="history-category" value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}><option value="">전체</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      <div className="content-filter-field"><label htmlFor="history-mode">모드</label><select id="history-mode" value={filters.promptMode} onChange={(event) => setFilters({ ...filters, promptMode: event.target.value as BriefingPromptRunFilters['promptMode'] })}><option value="">전체</option>{briefingPromptModes.map((mode) => <option key={mode} value={mode}>{briefingPromptModeLabels[mode]}</option>)}</select></div>
      <div className="content-filter-field"><label htmlFor="history-pin">고정 상태</label><select id="history-pin" value={filters.pin} onChange={(event) => setFilters({ ...filters, pin: event.target.value as BriefingPromptRunFilters['pin'] })}><option value="all">전체</option><option value="pinned">고정</option><option value="unpinned">미고정</option></select></div>
      <button className="secondary-button content-filters__reset" type="button" onClick={() => setFilters(initialFilters)}>필터 초기화</button>
    </div>
    {query.isPending ? <div className="content-state" role="status">프롬프트 이력을 불러오고 있습니다.</div> : null}
    {query.isError ? <div className="content-state content-state--error" role="alert"><h2>프롬프트 이력을 불러오지 못했습니다</h2><p>{query.error.message}</p></div> : null}
    {query.data ? <><p className="content-results">{runs.length}개 이력</p><BriefingPromptRunList runs={runs} /></> : null}
  </section>
}

export function BriefingPromptHistoryPage() {
  const { user } = useAuth()
  return <BriefingPromptHistoryPageContent userId={user?.id ?? ''} />
}
