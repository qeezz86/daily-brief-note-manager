import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import { PostForm } from '../features/posts/PostForm'
import type { PostFormValues } from '../features/posts/postFormSchema'
import { toNullablePostFormValues } from '../features/posts/postFormValues'
import {
  usePostQuery,
  useUpdatePostMutation,
} from '../features/posts/posts.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

interface ContentEditPageContentProps {
  client?: DatabaseClient | null
  userId: string
  postId: string
}

export function ContentEditPageContent({
  client = supabase,
  userId,
  postId,
}: ContentEditPageContentProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const postQuery = usePostQuery(client, userId, postId)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const updateMutation = useUpdatePostMutation(client, userId, postId)

  async function handleSubmit(values: PostFormValues) {
    setSubmitError(null)
    setSubmitSuccess(null)
    const normalized = toNullablePostFormValues(values)

    try {
      await updateMutation.mutateAsync({
        title: values.title,
        summary: values.summary,
        slug: values.slug,
        contentStatus: values.contentStatus,
        publishedOn: normalized.publishedOn,
        wordpressUrl: normalized.wordpressUrl,
      })
      setSubmitSuccess('변경 사항을 저장했습니다.')
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : '콘텐츠를 수정하지 못했습니다.',
      )
    }
  }

  if (postQuery.isPending || categoriesQuery.isPending) {
    return (
      <div className="content-state" role="status">
        <span className="loading-indicator" aria-hidden="true" />
        <p>콘텐츠를 불러오고 있습니다.</p>
      </div>
    )
  }

  if (postQuery.isError || categoriesQuery.isError) {
    return (
      <div className="content-state content-state--error" role="alert">
        <h1>콘텐츠를 불러오지 못했습니다</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
      </div>
    )
  }

  if (!postQuery.data || !categoriesQuery.data) {
    return (
      <section className="not-found">
        <p className="dashboard__eyebrow">Not found</p>
        <h1>콘텐츠를 찾을 수 없습니다</h1>
        <p>주소가 올바르지 않거나 접근할 수 없는 콘텐츠입니다.</p>
        <Link to="/content">콘텐츠 목록으로</Link>
      </section>
    )
  }

  return (
    <section className="content-editor" aria-labelledby="content-edit-title">
      <div className="page-heading-with-actions">
        <div>
          <p className="dashboard__eyebrow">기본 정보</p>
          <h1 id="content-edit-title">콘텐츠 수정</h1>
        </div>
        <Link className="secondary-link" to={`/content/${postId}`}>상세로</Link>
      </div>

      <PostForm
        mode="edit"
        categories={categoriesQuery.data}
        post={postQuery.data}
        isSaving={updateMutation.isPending}
        submitError={submitError}
        submitSuccess={submitSuccess}
        onSubmit={handleSubmit}
      />
    </section>
  )
}

export function ContentEditPage() {
  const { user } = useAuth()
  const { postId = '' } = useParams()

  return <ContentEditPageContent userId={user?.id ?? ''} postId={postId} />
}
