import { useMemo, useState } from 'react'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { buildNonNewsContext } from '../features/nonNewsContexts/buildNonNewsContext'
import { NonNewsContextPreview } from '../features/nonNewsContexts/NonNewsContextPreview'
import {
  DEFAULT_NON_NEWS_CATEGORY_ID,
  getNonNewsCategoryDefinition,
  isSupportedNonNewsCategoryId,
  SUPPORTED_NON_NEWS_CATEGORIES,
} from '../features/nonNewsContexts/nonNewsContexts.constants'
import { useNonNewsContextQuery } from '../features/nonNewsContexts/nonNewsContexts.queries'
import type { SupportedNonNewsCategoryId } from '../features/nonNewsContexts/nonNewsContexts.types'
import { NonNewsPromptComposer } from '../features/nonNewsPrompts/NonNewsPromptComposer'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NonNewsContextsPageContent({ client = supabase }: { client?: DatabaseClient | null }) {
  const [categoryId, setCategoryId] = useState<SupportedNonNewsCategoryId>(DEFAULT_NON_NEWS_CATEGORY_ID)
  const category = getNonNewsCategoryDefinition(categoryId)
  const contextQuery = useNonNewsContextQuery(client, categoryId)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const result = useMemo(
    () => contextQuery.data ? buildNonNewsContext(categoryId, contextQuery.data) : null,
    [categoryId, contextQuery.data],
  )
  const categorySettings = categoriesQuery.data?.find((item) => item.id === categoryId) ?? null
  const composerUnavailableReason = contextQuery.isPending || contextQuery.isFetching
    ? 'Phase 5I 컨텍스트를 불러오는 동안 작성 프롬프트를 생성할 수 없습니다.'
    : contextQuery.isError
      ? 'Phase 5I 컨텍스트 오류를 해결한 뒤 작성 프롬프트를 생성해 주세요.'
      : categoriesQuery.isPending || categoriesQuery.isFetching
        ? '활성 카테고리 설정을 불러오는 동안 작성 프롬프트를 생성할 수 없습니다.'
        : categoriesQuery.isError
          ? '활성 카테고리 설정을 불러오지 못해 작성 프롬프트를 생성할 수 없습니다.'
          : !categorySettings
            ? '선택한 비뉴스 카테고리의 활성 설정을 찾을 수 없습니다.'
            : null

  function changeCategory(value: string) {
    if (isSupportedNonNewsCategoryId(value)) setCategoryId(value)
  }

  if (!client) {
    return <div className="content-state content-state--error" role="alert">
      <h1>Supabase 연결이 설정되지 않았습니다</h1>
      <p>공개 Supabase 환경 변수를 확인해 주세요.</p>
    </div>
  }

  return <section className="content-page" aria-labelledby="non-news-contexts-title">
    <div className="content-page__heading">
      <div>
        <p className="dashboard__eyebrow">Duplicate-prevention context</p>
        <h1 id="non-news-contexts-title">비뉴스 중복 방지 컨텍스트</h1>
        <p>기존 글의 허용된 정보만 읽어 새 글의 주제 중복을 검토할 텍스트를 만듭니다.</p>
      </div>
      {result ? <div className="content-count" aria-label="사용 항목 수">
        <strong>{result.actualCount}</strong><span>최대 {result.maxCount}개</span>
      </div> : null}
    </div>

    <div className="content-filters">
      <div className="content-filter-field">
        <label htmlFor="non-news-category">비뉴스 카테고리</label>
        <select id="non-news-category" value={categoryId} disabled={contextQuery.isFetching} onChange={(event) => changeCategory(event.target.value)}>
          {SUPPORTED_NON_NEWS_CATEGORIES.map((candidate) => <option key={candidate.id} value={candidate.id}>
            {candidate.name} · 최대 {candidate.limit}개
          </option>)}
        </select>
        <p className="field-help">{category.name}의 ready·published 글을 최신순으로 자동 조회합니다.</p>
      </div>
    </div>

    {contextQuery.isPending || contextQuery.isFetching
      ? <div className="content-state" role="status">컨텍스트 항목을 불러오고 있습니다.</div>
      : null}
    {contextQuery.isError ? <div className="content-state content-state--error" role="alert">
      <h2>비뉴스 컨텍스트를 불러오지 못했습니다</h2>
      <p>{contextQuery.error instanceof Error ? contextQuery.error.message : '잠시 후 다시 시도해 주세요.'}</p>
    </div> : null}
    {result && result.actualCount === 0
      ? <div className="content-state" role="status">선택한 카테고리에 기존 글이 없습니다.</div>
      : null}
    {result ? <NonNewsContextPreview result={result} /> : null}
    <NonNewsPromptComposer
      category={categoryId}
      context={result}
      categorySettings={categorySettings}
      unavailableReason={composerUnavailableReason}
    />
  </section>
}

export function NonNewsContextsPage() {
  return <NonNewsContextsPageContent />
}
