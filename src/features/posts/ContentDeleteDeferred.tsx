import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DatabaseClient } from '../../shared/supabase/client'
import { useDeletePostMutation, usePostDeleteEligibilityQuery } from './posts.delete.queries'
import type { PostDeleteEligibility } from './posts.delete.repository'

const deleteEligibilityMessages: Record<PostDeleteEligibility, string> = {
  CHECKING: '삭제 가능 여부를 확인하고 있습니다.',
  DELETABLE: 'Content Manager의 로컬 콘텐츠를 영구 삭제할 수 있습니다.',
  BLOCKED_IMPORT_HISTORY: 'Import 이력 보존을 위해 영구 삭제할 수 없습니다.',
  BLOCKED_WORDPRESS_HISTORY: 'WordPress 발행 시도 이력 보존을 위해 영구 삭제할 수 없습니다.',
  BLOCKED_MULTIPLE_HISTORY: 'Import 이력과 WordPress 발행 시도 이력 보존을 위해 영구 삭제할 수 없습니다.',
  CHECK_FAILED: '삭제 가능 여부를 확인하지 못했습니다. 콘텐츠를 삭제할 수 없습니다.',
}

interface ContentDeleteDeferredProps {
  client: DatabaseClient | null
  userId: string
  postId: string
  postTitle: string
  hasWordPressUrl: boolean
  wordpressAttemptsReadState: 'CHECKING' | 'READY' | 'CHECK_FAILED'
}

export function ContentDeleteDeferred({
  client,
  userId,
  postId,
  postTitle,
  hasWordPressUrl,
  wordpressAttemptsReadState,
}: ContentDeleteDeferredProps) {
  const navigate = useNavigate()
  const deleteSubmitting = useRef(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteMutation = useDeletePostMutation(client, userId, postId)
  const deleteEligibilityQuery = usePostDeleteEligibilityQuery(client, userId, postId)
  const deleteEligibility: PostDeleteEligibility = wordpressAttemptsReadState === 'CHECK_FAILED'
    ? 'CHECK_FAILED'
    : wordpressAttemptsReadState === 'CHECKING'
      ? 'CHECKING'
      : deleteEligibilityQuery.eligibility

  async function handleDelete() {
    if (deleteEligibility !== 'DELETABLE' || deleteSubmitting.current || deleteMutation.isPending) return
    deleteSubmitting.current = true
    try {
      const warning = hasWordPressUrl
        ? '\n이 작업은 Content Manager의 로컬 콘텐츠만 삭제합니다.\nWordPress에 생성된 게시물은 삭제되지 않습니다.'
        : ''
      if (!window.confirm(`‘${postTitle}’ 콘텐츠를 삭제하시겠습니까?\n삭제한 콘텐츠는 복구할 수 없습니다.\nContent Manager의 로컬 콘텐츠를 영구 삭제합니다.${warning}`)) return
      setDeleteError(null)
      await deleteMutation.mutateAsync()
      void navigate('/content', { replace: true, state: { contentDeleted: true } })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '콘텐츠를 삭제하지 못했습니다.')
    } finally {
      deleteSubmitting.current = false
    }
  }

  return (
    <>
      {deleteError ? <p className="form-alert" role="alert">{deleteError}</p> : null}
      <p id="content-delete-eligibility" className="field-help" aria-live="polite">
        {deleteEligibilityMessages[deleteEligibility]}
      </p>
      <button
        className="danger-button"
        type="button"
        aria-describedby="content-delete-eligibility"
        disabled={deleteEligibility !== 'DELETABLE' || deleteMutation.isPending}
        onClick={() => void handleDelete()}
      >
        {deleteMutation.isPending ? '삭제 중' : '삭제'}
      </button>
    </>
  )
}
