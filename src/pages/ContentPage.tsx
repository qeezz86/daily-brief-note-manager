import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { ContentList } from '../features/posts/ContentList'
import { getStatusLabel } from '../features/posts/postFormatters'
import { POST_PAGE_SIZE, usePostsQuery } from '../features/posts/posts.list'
import {
  contentStatuses,
  type ContentStatus,
  type PostListItem,
} from '../features/posts/posts.types'
import type { Category } from '../features/categories/categories.types'
import {
  supabase,
  type DatabaseClient,
} from '../shared/supabase/client'
import { useAuth } from '../features/auth/useAuth'

const statusOptions = contentStatuses.map((value) => ({
  value,
  label: getStatusLabel(value),
}))

const emptyCategories: Category[] = []
const emptyPosts: PostListItem[] = []

interface ContentPageContentProps {
  client?: DatabaseClient | null
  userId: string
}

export function ContentPageContent({
  client = supabase,
  userId,
}: ContentPageContentProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const state: unknown = location.state
  const hasDeleteSignal = typeof state === 'object' && state !== null &&
    'contentDeleted' in state && state.contentDeleted === true
  const [deleteFeedback, setDeleteFeedback] = useState({
    key: location.key, visible: hasDeleteSignal, consuming: hasDeleteSignal,
  })
  if (deleteFeedback.key !== location.key) {
    setDeleteFeedback({
      key: location.key,
      visible: hasDeleteSignal || deleteFeedback.consuming,
      consuming: hasDeleteSignal,
    })
  }
  useEffect(() => {
    if (typeof state !== 'object' || state === null || !('contentDeleted' in state) || state.contentDeleted !== true) return
    // Consume the history signal; local feedback lasts only for this list visit.
    const nextState = { ...state }
    Reflect.deleteProperty(nextState, 'contentDeleted')
    void navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    })
  }, [state, location.pathname, location.search, location.hash, navigate])
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ContentStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const postsQuery = usePostsQuery(client, userId, { categoryId, status, search, page })
  const categories = categoriesQuery.data ?? emptyCategories
  const posts = postsQuery.data?.posts ?? emptyPosts
  const count = postsQuery.data?.count
  const currentPage = postsQuery.data?.page ?? page
  if (postsQuery.isSuccess && currentPage !== page) setPage(currentPage)
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / POST_PAGE_SIZE))
  const hasActiveFilters = Boolean(categoryId || status || search.trim())
  const countLabel = hasActiveFilters ? '검색 결과' : '전체 글'

  return (
    <section className="content-page" aria-labelledby="content-page-title">
      {deleteFeedback.visible ? <p className="form-success" role="status">콘텐츠를 삭제했습니다.</p> : null}
      <div className="content-page__heading">
        <div>
          <p className="dashboard__eyebrow">콘텐츠 관리</p>
          <h1 id="content-page-title">콘텐츠 목록</h1>
        </div>
        <div className="content-page__heading-actions">
          <Link className="primary-link primary-link--inline" to="/content/new">
            새 콘텐츠
          </Link>
          <div className="content-count" aria-label={count === undefined ? '개수 확인 중' : `${countLabel} ${count}개`}>
            <strong>{count ?? '—'}</strong>
            <span>{countLabel}</span>
          </div>
        </div>
      </div>

      <div className="content-filters" aria-label="콘텐츠 필터">
        <div className="content-filter-field">
          <label htmlFor="content-category">카테고리</label>
          <select
            id="content-category"
            value={categoryId}
            onChange={(event) => { setCategoryId(event.target.value); setPage(1) }}
          >
            <option value="">전체</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="content-filter-field">
          <label htmlFor="content-status">상태</label>
          <select
            id="content-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | '')
              setPage(1)
            }}
          >
            <option value="">전체</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="content-filter-field content-filter-field--search">
          <label htmlFor="content-search">제목·slug 검색</label>
          <input
            id="content-search"
            type="search"
            value={search}
            placeholder="검색어를 입력하세요"
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
        </div>

        <button
          className="secondary-button content-filters__reset"
          type="button"
          disabled={!search}
          onClick={() => { setSearch(''); setPage(1) }}
        >
          검색 초기화
        </button>
      </div>

      {categoriesQuery.isPending || postsQuery.isPending ? (
        <div className="content-state" role="status">
          <span className="loading-indicator" aria-hidden="true" />
          <p>콘텐츠 목록을 불러오고 있습니다.</p>
        </div>
      ) : null}

      {categoriesQuery.isError ? (
        <div className="content-state content-state--error" role="alert">
          <h2>카테고리를 불러오지 못했습니다</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : null}

      {postsQuery.isError ? (
        <div className="content-state content-state--error" role="alert">
          <h2>콘텐츠 목록을 불러오지 못했습니다</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : null}

      {categoriesQuery.isSuccess && postsQuery.isSuccess ? (
        <>
          <p className="content-results" aria-live="polite">
            {hasActiveFilters
              ? `검색 결과 ${count}개`
              : `전체 ${count}개`}
            {posts.length > 0 ? ` · ${(currentPage - 1) * POST_PAGE_SIZE + 1}–${(currentPage - 1) * POST_PAGE_SIZE + posts.length}번째` : ''}
          </p>
          {posts.length > 0 ? (
            <ContentList categories={categories} posts={posts} />
          ) : (
            <div className="empty-state" role="status">
              <span className="empty-state__indicator" aria-hidden="true" />
              <div>
                <h2>
                  {!hasActiveFilters
                    ? '등록된 콘텐츠가 없습니다'
                    : '조건에 맞는 콘텐츠가 없습니다'}
                </h2>
                <p>
                  {!hasActiveFilters
                    ? '콘텐츠가 등록되면 이곳에서 확인할 수 있습니다.'
                    : '필터나 검색어를 변경해 보세요.'}
                </p>
              </div>
            </div>
          )}
          {count !== undefined && count > 0 ? (
            <nav className="content-pagination" aria-label="콘텐츠 페이지 이동">
              <button className="secondary-button" type="button" disabled={currentPage === 1 || postsQuery.isFetching}
                onClick={() => setPage(currentPage - 1)}>이전 페이지</button>
              <span aria-live="polite">{currentPage} / {pageCount} 페이지</span>
              <button className="secondary-button" type="button" disabled={currentPage >= pageCount || postsQuery.isFetching}
                onClick={() => setPage(currentPage + 1)}>다음 페이지</button>
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export function ContentPage() {
  const { user } = useAuth()

  return <ContentPageContent userId={user?.id ?? ''} />
}
