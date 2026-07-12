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
  useAiMetadataQuery,
  useChineseMetadataQuery,
  useInfoDbMetadataQuery,
  usePostQuery,
  usePostSourcesQuery,
  usePostTagsQuery,
  useSeoDataQuery,
} from '../features/posts/posts.queries'
import { supabase, type DatabaseClient } from '../shared/supabase/client'
import { usePostNewsUpdatesQuery, useReorderNewsUpdatesMutation } from '../features/newsUpdates/newsUpdates.queries'
import { newsUpdateTypeLabels, type NewsUpdateType } from '../features/newsUpdates/newsUpdates.types'

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
  const tagsQuery = usePostTagsQuery(client, userId, postId)
  const sourcesQuery = usePostSourcesQuery(client, userId, postId)
  const chineseMetadataQuery = useChineseMetadataQuery(client, userId, postId)
  const aiMetadataQuery = useAiMetadataQuery(client, userId, postId)
  const infoDbMetadataQuery = useInfoDbMetadataQuery(client, userId, postId)
  const archiveMutation = useArchivePostMutation(client, userId, postId)
  const newsUpdatesQuery = usePostNewsUpdatesQuery(client, userId, postId)
  const reorderMutation = useReorderNewsUpdatesMutation(client, userId, postId)
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
  const difficultyLabel = (value: string | null | undefined) => {
    if (value === 'beginner') return '입문'
    if (value === 'intermediate') return '중급'
    if (value === 'advanced') return '고급'
    return value?.trim() || '미등록'
  }

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

  async function moveUpdate(index: number, direction: -1 | 1) {
    const updates = newsUpdatesQuery.data ?? []
    const target = index + direction
    if (target < 0 || target >= updates.length) return
    const ids = updates.map((item) => item.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setActionError(null)
    try { await reorderMutation.mutateAsync(ids) } catch (cause) { setActionError(cause instanceof Error ? cause.message : '뉴스 항목 순서를 저장할 수 없습니다.') }
  }

  if (postQuery.isPending || seoQuery.isPending || categoriesQuery.isPending || tagsQuery.isPending || sourcesQuery.isPending || chineseMetadataQuery.isPending || aiMetadataQuery.isPending || infoDbMetadataQuery.isPending || newsUpdatesQuery.isPending) {
    return (
      <div className="content-state" role="status">
        <span className="loading-indicator" aria-hidden="true" />
        <p>콘텐츠를 불러오고 있습니다.</p>
      </div>
    )
  }

  if (postQuery.isError || seoQuery.isError || categoriesQuery.isError || tagsQuery.isError || sourcesQuery.isError || chineseMetadataQuery.isError || aiMetadataQuery.isError || infoDbMetadataQuery.isError || newsUpdatesQuery.isError) {
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

      {category?.content_group === 'news' ? <section className="content-detail__section" aria-labelledby="news-items-title"><div className="page-heading-with-actions"><h2 id="news-items-title">뉴스 항목 ({newsUpdatesQuery.data?.length ?? 0}개)</h2><Link className="primary-link primary-link--inline" to={`/content/${post.id}/news-updates/new`}>뉴스 항목 추가</Link></div>{newsUpdatesQuery.data?.length ? <ol className="news-update-list">{newsUpdatesQuery.data.map((item, index, items) => <li key={item.id}><div><strong>{item.item_order}. {item.headline}</strong><span className="status-badge">{newsUpdateTypeLabels[item.update_type as NewsUpdateType] ?? item.update_type}</span></div><p><Link to={`/news-topics/${item.topic.id}`}>{item.topic.canonical_title}</Link></p><p>{item.fact_summary}</p>{item.change_summary ? <p><strong>변화:</strong> {item.change_summary}</p> : null}<p className="field-help">연결 출처 {item.sources.length}개</p><div className="detail-actions"><Link to={`/news-updates/${item.id}`}>상세 보기</Link><Link to={`/news-updates/${item.id}/edit`}>수정</Link><button type="button" disabled={index === 0 || reorderMutation.isPending} onClick={() => void moveUpdate(index, -1)}>위로 이동</button><button type="button" disabled={index === items.length - 1 || reorderMutation.isPending} onClick={() => void moveUpdate(index, 1)}>아래로 이동</button></div></li>)}</ol> : <p className="field-help">등록된 뉴스 항목이 없습니다.</p>}</section> : null}

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

      {category?.content_group === 'chinese' ? (
        <section className="content-detail__section" aria-labelledby="chinese-metadata-title">
          <h2 id="chinese-metadata-title">중국어 학습 정보</h2>
          <dl className="content-detail__metadata content-detail__metadata--nested">
            <div><dt>학습 주제</dt><dd>{chineseMetadataQuery.data?.learning_topic || '미입력'}</dd></div>
            <div><dt>프로그램명</dt><dd>{chineseMetadataQuery.data?.program_name || '미입력'}</dd></div>
            <div className="content-detail__wide"><dt>원문 제목</dt><dd>{chineseMetadataQuery.data?.original_title || '미입력'}</dd></div>
            <div className="content-detail__wide"><dt>원문 URL</dt><dd>{chineseMetadataQuery.data?.original_url ? <a href={chineseMetadataQuery.data.original_url} target="_blank" rel="noopener noreferrer">{chineseMetadataQuery.data.original_url}</a> : '미입력'}</dd></div>
            <div><dt>원문 게시·업데이트 시각</dt><dd>{chineseMetadataQuery.data?.original_published_at ? formatUpdatedAt(chineseMetadataQuery.data.original_published_at) : '미입력'}</dd></div>
            <div><dt>본편 목록 포함 여부</dt><dd>{chineseMetadataQuery.data?.episode_list_included === null || chineseMetadataQuery.data?.episode_list_included === undefined ? '미확인' : chineseMetadataQuery.data.episode_list_included ? '포함' : '미포함'}</dd></div>
            <div className="content-detail__wide"><dt>확인한 핵심 사실</dt><dd>{chineseMetadataQuery.data?.verified_core_fact || '미입력'}</dd></div>
            <div><dt>난이도</dt><dd>{chineseMetadataQuery.data?.difficulty || '미입력'}</dd></div>
            <div className="content-detail__wide"><dt>학습 포인트</dt><dd>{chineseMetadataQuery.data?.learning_points || '미입력'}</dd></div>
          </dl>
        </section>
      ) : null}

      {category?.content_group === 'ai' ? (
        <section className="content-detail__section" aria-labelledby="ai-metadata-title">
          <h2 id="ai-metadata-title">AI 칼럼 정보</h2>
          <dl className="content-detail__metadata content-detail__metadata--nested">
            <div><dt>분야</dt><dd>{aiMetadataQuery.data?.field_name || '미등록'}</dd></div>
            <div><dt>난이도</dt><dd>{difficultyLabel(aiMetadataQuery.data?.difficulty)}</dd></div>
            <div><dt>예상 읽기 시간</dt><dd>{aiMetadataQuery.data?.estimated_read_min ? `${aiMetadataQuery.data.estimated_read_min}분` : '미등록'}</dd></div>
          </dl>
        </section>
      ) : null}

      {category?.content_group === 'info_db' ? (
        <section className="content-detail__section" aria-labelledby="info-db-metadata-title">
          <h2 id="info-db-metadata-title">정보DB 정보</h2>
          <dl className="content-detail__metadata content-detail__metadata--nested">
            <div><dt>분야</dt><dd>{infoDbMetadataQuery.data?.field_name || '미등록'}</dd></div>
            <div><dt>난이도</dt><dd>{difficultyLabel(infoDbMetadataQuery.data?.difficulty)}</dd></div>
            <div><dt>예상 읽기 시간</dt><dd>{infoDbMetadataQuery.data?.estimated_read_min ? `${infoDbMetadataQuery.data.estimated_read_min}분` : '미등록'}</dd></div>
            <div><dt>기준일</dt><dd>{infoDbMetadataQuery.data?.reference_date || '미등록'}</dd></div>
          </dl>
        </section>
      ) : null}

      <section className="content-detail__section" aria-labelledby="tag-detail-title">
        <h2 id="tag-detail-title">SEO 태그 ({tagsQuery.data?.length ?? 0}개)</h2>
        {tagsQuery.data?.length ? (
          <ul className="detail-tag-list">{tagsQuery.data.map((tag) => <li key={tag.id}>{tag.name}</li>)}</ul>
        ) : <p className="field-help">미등록</p>}
      </section>

      <section className="content-detail__section" aria-labelledby="source-detail-title">
        <h2 id="source-detail-title">출처 및 참고자료 ({sourcesQuery.data?.length ?? 0}개)</h2>
        {sourcesQuery.data?.length ? (
          <ol className="detail-source-list">
            {sourcesQuery.data.map((source) => (
              <li key={source.id}>
                <h3>{source.source_name}</h3>
                <p>{source.source_title}</p>
                <a href={source.source_url} target="_blank" rel="noopener noreferrer">{source.source_url}</a>
                <dl><div><dt>게시·업데이트일</dt><dd>{source.source_published_at ? formatUpdatedAt(source.source_published_at) : '미입력'}</dd></div><div><dt>확인한 핵심 내용</dt><dd>{source.checked_point}</dd></div></dl>
              </li>
            ))}
          </ol>
        ) : <p className="field-help">미등록</p>}
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
