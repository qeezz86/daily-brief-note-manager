import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { filterNewsTopics } from '../features/newsTopics/filterNewsTopics'
import { NewsTopicList } from '../features/newsTopics/NewsTopicList'
import { useNewsTopicsQuery } from '../features/newsTopics/newsTopics.queries'
import { newsTopicStatuses, newsTopicStatusLabels, type NewsTopicStatus } from '../features/newsTopics/newsTopics.types'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

export function NewsTopicsPageContent({ client = supabase, userId }: { client?: DatabaseClient | null; userId: string }) {
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<NewsTopicStatus | ''>('')
  const [search, setSearch] = useState('')
  const categoriesQuery = useActiveCategoriesQuery(client)
  const topicsQuery = useNewsTopicsQuery(client, userId)
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((item) => item.content_group === 'news'), [categoriesQuery.data])
  const topics = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data])
  const filtered = useMemo(() => filterNewsTopics(topics, { categoryId, status, search }), [topics, categoryId, status, search])
  const pending = categoriesQuery.isPending || topicsQuery.isPending
  const failed = categoriesQuery.isError || topicsQuery.isError

  return <section className="content-page" aria-labelledby="news-topics-title">
    <div className="content-page__heading"><div><p className="dashboard__eyebrow">뉴스 추적</p><h1 id="news-topics-title">뉴스 주제 목록</h1></div><div className="content-page__heading-actions"><Link className="primary-link primary-link--inline" to="/news-topics/new">새 뉴스 주제</Link><div className="content-count" aria-label={`전체 주제 ${topics.length}개`}><strong>{topics.length}</strong><span>전체 주제</span></div></div></div>
    <div className="content-filters" aria-label="뉴스 주제 필터"><div className="content-filter-field"><label htmlFor="news-category">카테고리</label><select id="news-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">전체</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="content-filter-field"><label htmlFor="news-status">상태</label><select id="news-status" value={status} onChange={(event) => setStatus(event.target.value as NewsTopicStatus | '')}><option value="">전체</option>{newsTopicStatuses.map((value) => <option key={value} value={value}>{newsTopicStatusLabels[value]}</option>)}</select></div><div className="content-filter-field"><label htmlFor="news-search">대표 제목·주제 키 검색</label><input id="news-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="secondary-button content-filters__reset" type="button" disabled={!categoryId && !status && !search} onClick={() => { setCategoryId(''); setStatus(''); setSearch('') }}>필터·검색 초기화</button></div>
    {pending ? <div className="content-state" role="status"><span className="loading-indicator" aria-hidden="true" /><p>뉴스 주제를 불러오고 있습니다.</p></div> : null}
    {failed ? <div className="content-state content-state--error" role="alert"><h2>뉴스 주제를 불러오지 못했습니다</h2><p>잠시 후 다시 시도해 주세요.</p></div> : null}
    {!pending && !failed ? <><p className="content-results" aria-live="polite">검색 결과 {filtered.length}개</p>{filtered.length ? <NewsTopicList topics={filtered} categories={categories} /> : <div className="empty-state" role="status"><span className="empty-state__indicator" aria-hidden="true" /><div><h2>{topics.length ? '조건에 맞는 뉴스 주제가 없습니다' : '등록된 뉴스 주제가 없습니다'}</h2><p>새 주제를 만들거나 필터를 변경해 보세요.</p></div></div>}</> : null}
  </section>
}
export function NewsTopicsPage() { const { user } = useAuth(); return <NewsTopicsPageContent userId={user?.id ?? ''} /> }
