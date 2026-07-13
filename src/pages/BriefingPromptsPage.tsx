import { useMemo, useState } from 'react'
import { BriefingPromptForm } from '../features/briefingPrompts/BriefingPromptForm'
import { BriefingPromptPreview } from '../features/briefingPrompts/BriefingPromptPreview'
import { getSeoulDate } from '../features/briefingPrompts/briefingPromptDates'
import { buildNewsBriefingPrompt } from '../features/briefingPrompts/buildBriefingPrompt'
import { useBriefingPromptContextQuery } from '../features/briefingPrompts/briefingPrompts.queries'
import type { BriefingPromptSettings } from '../features/briefingPrompts/briefingPrompts.types'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const initialSettings: BriefingPromptSettings = { categoryId: '', referenceDate: getSeoulDate(), mode: 'standard', closedLookbackDays: 90 }

export function BriefingPromptsPageContent({ client = supabase, userId }: { client?: DatabaseClient | null; userId: string }) {
  const [settings, setSettings] = useState(initialSettings)
  const [submitted, setSubmitted] = useState<BriefingPromptSettings | null>(null)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.content_group === 'news'), [categoriesQuery.data])
  const displayedSettings = settings.categoryId || !categories[0] ? settings : { ...settings, categoryId: categories[0].id }
  const contextQuery = useBriefingPromptContextQuery(client, userId, submitted)
  const prompt = useMemo(() => contextQuery.data && submitted ? buildNewsBriefingPrompt(contextQuery.data, submitted.mode) : null, [contextQuery.data, submitted])
  if (!client) return <div className="content-state content-state--error" role="alert"><h1>Supabase 연결이 설정되지 않았습니다</h1><p>공개 Supabase 환경 변수를 확인해 주세요.</p></div>
  return <section className="content-page" aria-labelledby="briefing-prompts-title"><div className="content-page__heading"><div><p className="dashboard__eyebrow">Briefing prompts</p><h1 id="briefing-prompts-title">브리핑 프롬프트</h1><p>저장된 뉴스 이력을 집계해 ChatGPT에 복사할 일반 텍스트 프롬프트를 만듭니다.</p></div></div>
    {categoriesQuery.isPending ? <div className="content-state" role="status">뉴스 카테고리를 불러오고 있습니다.</div> : null}
    {categoriesQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>뉴스 카테고리를 불러오지 못했습니다</h2></div> : null}
    {!categoriesQuery.isPending && !categoriesQuery.isError ? <BriefingPromptForm categories={categories} value={displayedSettings} disabled={contextQuery.isFetching} onChange={(next) => { setSettings(next); setSubmitted(null) }} onSubmit={() => setSubmitted({ ...displayedSettings })} /> : null}
    {contextQuery.isFetching ? <div className="content-state" role="status">프롬프트 데이터를 집계하고 있습니다.</div> : null}
    {contextQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>프롬프트 데이터를 불러오지 못했습니다</h2><p>{contextQuery.error.message}</p></div> : null}
    {contextQuery.data && prompt ? <BriefingPromptPreview context={contextQuery.data} prompt={prompt} /> : null}
  </section>
}

export function BriefingPromptsPage() { const { user } = useAuth(); return <BriefingPromptsPageContent userId={user?.id ?? ''} /> }
