import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefingPromptForm } from '../features/briefingPrompts/BriefingPromptForm'
import { BriefingPromptPreview } from '../features/briefingPrompts/BriefingPromptPreview'
import { BriefingPromptRuleSummary } from '../features/briefingPrompts/BriefingPromptRuleSummary'
import { BriefingPromptValidationPanel } from '../features/briefingPrompts/BriefingPromptValidationPanel'
import { getSeoulDate } from '../features/briefingPrompts/briefingPromptDates'
import { buildNewsBriefingPrompt } from '../features/briefingPrompts/buildBriefingPrompt'
import {
  useBriefingPromptContextQuery,
  useSavePromptRunMutation,
} from '../features/briefingPrompts/briefingPrompts.queries'
import type { BriefingPromptSettings } from '../features/briefingPrompts/briefingPrompts.types'
import { validateBriefingPrompt } from '../features/briefingPrompts/validateBriefingPrompt'
import {
  BRIEFING_PROMPT_VALIDATION_VERSION,
  summarizeBriefingPromptValidation,
} from '../features/briefingPrompts/briefingPromptValidation.types'
import {
  PROMPT_TEMPLATE_VERSION,
  getCategoryConfigurationError,
} from '../features/briefingPrompts/categoryPromptRules'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

const initialSettings: BriefingPromptSettings = { categoryId: '', referenceDate: getSeoulDate(), mode: 'standard', closedLookbackDays: 90 }

function settingsMatch(left: BriefingPromptSettings, right: BriefingPromptSettings): boolean {
  return left.categoryId === right.categoryId
    && left.referenceDate === right.referenceDate
    && left.mode === right.mode
    && left.closedLookbackDays === right.closedLookbackDays
}

export function BriefingPromptsPageContent({ client = supabase, userId }: { client?: DatabaseClient | null; userId: string }) {
  const [settings, setSettings] = useState(initialSettings)
  const [submitted, setSubmitted] = useState<BriefingPromptSettings | null>(null)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((category) => category.content_group === 'news'), [categoriesQuery.data])
  const displayedSettings = settings.categoryId || !categories[0] ? settings : { ...settings, categoryId: categories[0].id }
  const selectedCategory = categories.find((category) => category.id === displayedSettings.categoryId)
  const configurationError = selectedCategory ? getCategoryConfigurationError({
    id: selectedCategory.id,
    wrapperClass: selectedCategory.wrapper_class,
    displayIdPattern: selectedCategory.display_id_pattern,
    slugPattern: selectedCategory.slug_pattern,
  }) : '뉴스 카테고리를 선택해 주세요.'
  const contextQuery = useBriefingPromptContextQuery(client, userId, submitted)
  const saveMutation = useSavePromptRunMutation(client, userId)
  const versionedContext = useMemo(() => contextQuery.data ? {
    ...contextQuery.data,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
  } : null, [contextQuery.data])
  const promptResult = useMemo(() => {
    if (!versionedContext || !submitted) return { prompt: null, error: null }
    try {
      return { prompt: buildNewsBriefingPrompt(versionedContext, submitted.mode), error: null }
    } catch (error) {
      return { prompt: null, error: error instanceof Error ? error.message : '카테고리 프롬프트 규칙을 적용하지 못했습니다.' }
    }
  }, [versionedContext, submitted])
  const prompt = promptResult.prompt
  const isStale = Boolean(submitted && !settingsMatch(displayedSettings, submitted))
  const validation = useMemo(() => {
    if (!versionedContext || !submitted || !prompt) return null
    return validateBriefingPrompt({
      promptText: prompt,
      context: versionedContext,
      mode: submitted.mode,
      settings: submitted,
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION,
    })
  }, [prompt, submitted, versionedContext])
  async function saveCurrentPrompt() {
    if (!versionedContext || !prompt || !submitted || !validation || isStale) return
    const summary = summarizeBriefingPromptValidation(validation)
    if (!summary) return
    const context = {
      ...versionedContext,
      promptValidationVersion: BRIEFING_PROMPT_VALIDATION_VERSION,
      promptValidationSummary: summary,
    }
    await saveMutation.mutateAsync({ settings: submitted, context, promptText: prompt }).catch(() => undefined)
  }
  if (!client) return <div className="content-state content-state--error" role="alert"><h1>Supabase 연결이 설정되지 않았습니다</h1><p>공개 Supabase 환경 변수를 확인해 주세요.</p></div>
  return <section className="content-page" aria-labelledby="briefing-prompts-title"><div className="content-page__heading"><div><p className="dashboard__eyebrow">Briefing prompts</p><h1 id="briefing-prompts-title">브리핑 프롬프트</h1><p>저장된 뉴스 이력을 집계해 ChatGPT에 복사할 일반 텍스트 프롬프트를 만듭니다.</p></div><div className="content-page__heading-actions"><Link className="secondary-button" to="/briefing-prompts/history">이력 보기</Link></div></div>
    {categoriesQuery.isPending ? <div className="content-state" role="status">뉴스 카테고리를 불러오고 있습니다.</div> : null}
    {categoriesQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>뉴스 카테고리를 불러오지 못했습니다</h2></div> : null}
    {!categoriesQuery.isPending && !categoriesQuery.isError ? <><BriefingPromptForm categories={categories} value={displayedSettings} disabled={contextQuery.isFetching} configurationError={configurationError} onChange={(next) => { setSettings(next); saveMutation.reset() }} onSubmit={() => { saveMutation.reset(); setSubmitted({ ...displayedSettings }) }} /><BriefingPromptRuleSummary category={selectedCategory} referenceDate={displayedSettings.referenceDate} /></> : null}
    {contextQuery.isFetching ? <div className="content-state" role="status">프롬프트 데이터를 집계하고 있습니다.</div> : null}
    {contextQuery.isError ? <div className="content-state content-state--error" role="alert"><h2>프롬프트 데이터를 불러오지 못했습니다</h2><p>{contextQuery.error.message}</p></div> : null}
    {promptResult.error ? <div className="content-state content-state--error" role="alert"><h2>카테고리 규칙을 적용하지 못했습니다</h2><p>{promptResult.error}</p></div> : null}
    {versionedContext && prompt && validation ? <><div className="prompt-results"><BriefingPromptValidationPanel result={validation} stale={isStale} /></div><BriefingPromptPreview context={versionedContext} prompt={prompt} promptCopyDisabled={isStale || validation.status === 'invalid'} />
      {isStale ? <p className="form-alert" role="status">설정이 변경되어 현재 미리보기가 오래되었습니다. 다시 프롬프트를 생성해 주세요.</p> : null}
      {saveMutation.isSuccess ? <p className="form-success" role="status">프롬프트 이력을 저장했습니다. <Link to={`/briefing-prompts/history/${saveMutation.data.id}`}>저장한 이력 보기</Link></p> : null}
      {saveMutation.isError ? <p className="form-alert" role="alert">{saveMutation.error.message}</p> : null}
    </> : null}
    <div className="detail-actions"><button className="primary-button" type="button" disabled={!versionedContext || !prompt || !validation || validation.status === 'invalid' || isStale || saveMutation.isPending || !prompt.trim()} onClick={() => void saveCurrentPrompt()}>{saveMutation.isPending ? '저장 중' : '현재 프롬프트 저장'}</button><Link className="secondary-button" to="/briefing-prompts/history">이력 보기</Link></div>
  </section>
}

export function BriefingPromptsPage() { const { user } = useAuth(); return <BriefingPromptsPageContent userId={user?.id ?? ''} /> }
