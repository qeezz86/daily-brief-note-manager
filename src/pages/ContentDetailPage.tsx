import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../features/auth/useAuth'
import { useActiveCategoriesQuery } from '../features/categories/categories.queries'
import {
  formatDateOnly,
  formatUpdatedAt,
  getPostIdentifier,
  getStatusLabel,
} from '../features/posts/postFormatters'
import {
  useArchivePostMutation,
  usePostQuery,
  useSeoDataQuery,
} from '../features/posts/posts.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'

interface ContentDetailPageContentProps {
  client?: DatabaseClient | null
  userId: string
  postId: string
}

export function ContentDetailPageContent({
  client = supabase,
  userId,
  postId,
}: ContentDetailPageContentProps) {
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const postQuery = usePostQuery(client, userId, postId)
  const seoQuery = useSeoDataQuery(client, userId, postId)
  const categoriesQuery = useActiveCategoriesQuery(client)
  const archiveMutation = useArchivePostMutation(client, userId, postId)
  const post = postQuery.data
  const seoData = seoQuery.data
  const alternativeTitles = Array.isArray(seoData?.alternative_titles)
    ? seoData.alternative_titles.filter((value): value is string => typeof value === 'string')
    : []
  const hasCompleteSeo = Boolean(
    seoData?.representative_title?.trim() &&
    seoData.focus_keyword?.trim() &&
    seoData.meta_description.trim() &&
    alternativeTitles.length === 4,
  )
  const category = categoriesQuery.data?.find(
    (item) => item.id === post?.category_id,
  )

  async function handleArchive() {
    if (!post || post.content_status === 'archived') return
    if (!window.confirm('이 콘텐츠를 보관 처리하시겠습니까?')) return

    setActionMessage(null)
    setActionError(null)

    try {
      await archiveMutation.mutateAsync()
      setActionMessage('콘텐츠를 보관 처리했습니다.')
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : '콘텐츠를 보관하지 못했습니다.',
      )
    }
  }

  if (postQuery.isPending || seoQuery.isPending || categoriesQuery.isPending) {
    return (
      <div className="content-state" role="status">
        <span className="loading-indicator" aria-hidden="true" />
        <p>콘텐츠를 불러오고 있습니다.</p>
      </div>
    )
  }

  if (postQuery.isError || seoQuery.isError || categoriesQuery.isError) {
    return (
      <div className="content-state content-state--error" role="alert">
        <h1>콘텐츠를 불러오지 못했습니다</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <Link to="/content">콘텐츠 목록으로</Link>
      </div>
    )
  }

  if (!post) {
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
    <article className="content-detail" aria-labelledby="content-detail-title">
      <div className="page-heading-with-actions">
        <div>
          <p className="dashboard__eyebrow">{category?.name ?? '콘텐츠'}</p>
          <h1 id="content-detail-title">{post.title}</h1>
        </div>
        <span className={`status-badge status-badge--${post.content_status}`}>
          {getStatusLabel(post.content_status)}
        </span>
      </div>

      <dl className="content-detail__metadata">
        <div><dt>카테고리</dt><dd>{category?.name ?? '알 수 없음'}</dd></div>
        <div><dt>식별 번호</dt><dd>{getPostIdentifier(post, category)}</dd></div>
        {category?.content_group === 'news' ? (
          <div><dt>브리핑 날짜</dt><dd>{formatDateOnly(post.briefing_date)}</dd></div>
        ) : null}
        <div><dt>발행일</dt><dd>{formatDateOnly(post.published_on)}</dd></div>
        <div className="content-detail__wide"><dt>Slug</dt><dd>{post.slug}</dd></div>
        <div className="content-detail__wide">
          <dt>WordPress URL</dt>
          <dd>
            {post.wordpress_url ? (
              <a href={post.wordpress_url} target="_blank" rel="noopener noreferrer">
                {post.wordpress_url}
              </a>
            ) : '등록되지 않음'}
          </dd>
        </div>
        <div><dt>생성일</dt><dd>{formatUpdatedAt(post.created_at)}</dd></div>
        <div><dt>수정일</dt><dd>{formatUpdatedAt(post.updated_at)}</dd></div>
      </dl>

      <section className="content-detail__summary" aria-labelledby="post-summary-title">
        <h2 id="post-summary-title">요약</h2>
        <p>{post.summary}</p>
      </section>

      <section className="content-detail__section" aria-labelledby="completion-title">
        <h2 id="completion-title">콘텐츠 완성 상태</h2>
        <dl className="content-completion">
          <div><dt>WordPress 본문</dt><dd>{post.html_body?.trim() ? '입력 완료' : '미입력'}</dd></div>
          <div><dt>본문 문자 수</dt><dd>{post.html_body?.length.toLocaleString('ko-KR') ?? 0}자</dd></div>
          <div><dt>SEO</dt><dd>{hasCompleteSeo ? '입력 완료' : '미완성'}</dd></div>
          <div><dt>이미지 프롬프트</dt><dd>{post.image_prompt?.trim() ? '입력 완료' : '미입력'}</dd></div>
          <div><dt>ALT 문구</dt><dd>{post.image_alt?.trim() ? '입력 완료' : '미입력'}</dd></div>
          <div><dt>현재 상태</dt><dd>{getStatusLabel(post.content_status)}</dd></div>
        </dl>
      </section>

      <section className="content-detail__section" aria-labelledby="seo-detail-title">
        <h2 id="seo-detail-title">SEO</h2>
        <dl className="content-detail__metadata content-detail__metadata--nested">
          <div className="content-detail__wide"><dt>대표 제목</dt><dd>{seoData?.representative_title || '미입력'}</dd></div>
          <div><dt>대안 제목 수</dt><dd>{alternativeTitles.length}개</dd></div>
          <div><dt>포커스 키워드</dt><dd>{seoData?.focus_keyword || '미입력'}</dd></div>
          <div className="content-detail__wide"><dt>메타 설명</dt><dd>{seoData?.meta_description || '미입력'}</dd></div>
        </dl>
      </section>

      <section className="content-detail__section" aria-labelledby="image-detail-title">
        <h2 id="image-detail-title">대표 이미지 정보</h2>
        <dl className="content-detail__metadata content-detail__metadata--nested">
          <div className="content-detail__wide"><dt>이미지 프롬프트</dt><dd>{post.image_prompt || '미입력'}</dd></div>
          <div className="content-detail__wide"><dt>ALT 문구</dt><dd>{post.image_alt || '미입력'}</dd></div>
          <div><dt>프롬프트 버전</dt><dd>{post.image_prompt_version}</dd></div>
        </dl>
      </section>

      {actionError ? <p className="form-alert" role="alert">{actionError}</p> : null}
      {actionMessage ? <p className="form-success" role="status">{actionMessage}</p> : null}

      <div className="detail-actions">
        <Link className="secondary-link" to="/content">목록으로 돌아가기</Link>
        <Link className="primary-link primary-link--inline" to={`/content/${post.id}/edit`}>
          수정
        </Link>
        {post.content_status !== 'archived' ? (
          <button
            className="danger-button"
            type="button"
            disabled={archiveMutation.isPending}
            onClick={() => void handleArchive()}
          >
            {archiveMutation.isPending ? '보관 처리 중' : '보관 처리'}
          </button>
        ) : null}
      </div>
    </article>
  )
}

export function ContentDetailPage() {
  const { user } = useAuth()
  const { postId = '' } = useParams()

  return <ContentDetailPageContent userId={user?.id ?? ''} postId={postId} />
}
