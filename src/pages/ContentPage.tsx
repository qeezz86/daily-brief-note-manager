import { useMemo, useState } from 'react'

import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { ContentList } from '../features/posts/ContentList'
import { filterPosts } from '../features/posts/filterPosts'
import { getStatusLabel } from '../features/posts/postFormatters'
import { usePostsQuery } from '../features/posts/posts.queries'
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
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ContentStatus | ''>('')
  const [search, setSearch] = useState('')
  const categoriesQuery = useActiveCategoriesQuery(client)
  const postsQuery = usePostsQuery(client, userId)
  const categories = categoriesQuery.data ?? emptyCategories
  const posts = postsQuery.data ?? emptyPosts
  const filteredPosts = useMemo(
    () => filterPosts(posts, { categoryId, status, search }),
    [categoryId, posts, search, status],
  )
  const hasActiveFilters = Boolean(categoryId || status || search.trim())

  return (
    <section className="content-page" aria-labelledby="content-page-title">
      <div className="content-page__heading">
        <div>
          <p className="dashboard__eyebrow">읽기 전용</p>
          <h1 id="content-page-title">콘텐츠 목록</h1>
        </div>
        <div className="content-count" aria-label={`전체 글 ${posts.length}개`}>
          <strong>{posts.length}</strong>
          <span>전체 글</span>
        </div>
      </div>

      <div className="content-filters" aria-label="콘텐츠 필터">
        <div className="content-filter-field">
          <label htmlFor="content-category">카테고리</label>
          <select
            id="content-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
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
            onChange={(event) =>
              setStatus(event.target.value as ContentStatus | '')
            }
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
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <button
          className="secondary-button content-filters__reset"
          type="button"
          disabled={!search}
          onClick={() => setSearch('')}
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
              ? `검색 결과 ${filteredPosts.length}개`
              : `전체 ${posts.length}개`}
          </p>
          {filteredPosts.length > 0 ? (
            <ContentList categories={categories} posts={filteredPosts} />
          ) : (
            <div className="empty-state" role="status">
              <span className="empty-state__indicator" aria-hidden="true" />
              <div>
                <h2>
                  {posts.length === 0
                    ? '등록된 콘텐츠가 없습니다'
                    : '조건에 맞는 콘텐츠가 없습니다'}
                </h2>
                <p>
                  {posts.length === 0
                    ? '콘텐츠가 등록되면 이곳에서 확인할 수 있습니다.'
                    : '필터나 검색어를 변경해 보세요.'}
                </p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}

export function ContentPage() {
  const { user } = useAuth()

  return <ContentPageContent userId={user?.id ?? ''} />
}
