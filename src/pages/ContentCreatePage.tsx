import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { PostForm } from '../features/posts/PostForm'
import type { PostFormValues } from '../features/posts/postFormSchema'
import { toNullablePostFormValues } from '../features/posts/postFormValues'
import { useCreatePostMutation } from '../features/posts/posts.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

interface ContentCreatePageContentProps {
  client?: DatabaseClient | null
  userId: string
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '콘텐츠를 저장하지 못했습니다.'
}

export function ContentCreatePageContent({
  client = supabase,
  userId,
}: ContentCreatePageContentProps) {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const createMutation = useCreatePostMutation(client, userId)

  async function handleSubmit(values: PostFormValues) {
    const category = categoriesQuery.data?.find(
      (item) => item.id === values.categoryId,
    )

    if (!category) {
      setSubmitError('선택한 카테고리를 확인해 주세요.')
      return
    }

    setSubmitError(null)
    const normalized = toNullablePostFormValues(values)

    try {
      const post = await createMutation.mutateAsync({
        category,
        title: values.title,
        summary: values.summary,
        slug: values.slug,
        contentStatus: values.contentStatus,
        briefingDate: normalized.briefingDate,
        publishedOn: normalized.publishedOn,
        wordpressUrl: normalized.wordpressUrl,
      })
      navigate(`/content/${post.id}`, { replace: true })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    }
  }

  return (
    <section className="content-editor" aria-labelledby="content-create-title">
      <div className="page-heading-with-actions">
        <div>
          <p className="dashboard__eyebrow">기본 정보</p>
          <h1 id="content-create-title">콘텐츠 신규 생성</h1>
        </div>
        <Link className="secondary-link" to="/content">목록으로</Link>
      </div>

      {categoriesQuery.isPending ? (
        <div className="content-state" role="status">
          <span className="loading-indicator" aria-hidden="true" />
          <p>카테고리를 불러오고 있습니다.</p>
        </div>
      ) : null}

      {categoriesQuery.isError ? (
        <div className="content-state content-state--error" role="alert">
          <h2>카테고리를 불러오지 못했습니다</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
      ) : null}

      {categoriesQuery.data ? (
        <PostForm
          mode="create"
          categories={categoriesQuery.data}
          isSaving={createMutation.isPending}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  )
}

export function ContentCreatePage() {
  const { user } = useAuth()

  return <ContentCreatePageContent userId={user?.id ?? ''} />
}
