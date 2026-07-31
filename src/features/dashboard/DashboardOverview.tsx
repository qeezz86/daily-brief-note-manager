import { Link } from 'react-router-dom'

import type { DashboardOverviewData } from './dashboard.types'

interface DashboardOverviewProps {
  data?: DashboardOverviewData
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

type DashboardContentStatus =
  DashboardOverviewData['recentPosts'][number]['contentStatus']

const statusLabels: Record<DashboardContentStatus, string> = {
  draft: '초안',
  ready: '발행 준비',
  published: '발행됨',
  archived: '보관됨',
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function DashboardOverview({
  data,
  isPending,
  isError,
  onRetry,
}: DashboardOverviewProps) {
  if (isPending) {
    return (
      <div className="dashboard-state" role="status">
        <span className="loading-indicator" aria-hidden="true" />
        <p>운영 현황을 불러오고 있습니다.</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="dashboard-state dashboard-state--error" role="alert">
        <h2>운영 현황을 불러오지 못했습니다</h2>
        <p>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          다시 시도
        </button>
      </div>
    )
  }

  const summaries = [
    { label: '전체 콘텐츠', value: data.counts.totalPosts, to: '/content' },
    { label: '발행 준비', value: data.counts.readyPosts, to: '/content' },
    { label: '진행 중 뉴스 주제', value: data.counts.activeNewsTopics, to: '/news-topics' },
    { label: '확인 대기 후속 항목', value: data.counts.pendingNewsFollowups, to: '/news-followups' },
  ]
  const isEmpty = Object.values(data.counts).every((count) => count === 0)
    && data.recentPosts.length === 0
    && data.recentPromptRuns.length === 0

  return (
    <>
      <section className="dashboard-section" aria-labelledby="dashboard-summary-title">
        <div className="dashboard-section__heading">
          <h2 id="dashboard-summary-title">운영 요약</h2>
          <p>현재 계정의 읽기 전용 현황입니다.</p>
        </div>
        <div className="dashboard-summary-grid">
          {summaries.map((summary) => (
            <Link
              className="dashboard-summary-card"
              key={summary.label}
              to={summary.to}
              aria-label={`${summary.label} ${summary.value}개 보기`}
            >
              <span>{summary.label}</span>
              <strong>{summary.value}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-category-title">
        <div className="dashboard-section__heading">
          <h2 id="dashboard-category-title">카테고리별 콘텐츠</h2>
          <p>활성 카테고리의 전체 콘텐츠 수입니다.</p>
        </div>
        <ul className="dashboard-category-list">
          {data.categoryCounts.map((category) => (
            <li key={category.categoryId}>
              <span>{category.categoryName}</span>
              <strong>{category.postCount}개</strong>
            </li>
          ))}
        </ul>
      </section>

      <div className="dashboard-detail-grid">
        <section className="dashboard-section" aria-labelledby="dashboard-recent-posts-title">
          <div className="dashboard-section__heading dashboard-section__heading--row">
            <div>
              <h2 id="dashboard-recent-posts-title">최근 콘텐츠</h2>
              <p>마지막 수정 순서입니다.</p>
            </div>
            <Link className="secondary-link" to="/content">전체 보기</Link>
          </div>
          {data.recentPosts.length > 0 ? (
            <ul className="dashboard-item-list">
              {data.recentPosts.map((post) => (
                <li key={post.id}>
                  <Link to={`/content/${post.id}`}>
                    <strong>{post.title}</strong>
                    <span>
                      {post.categoryId} · {statusLabels[post.contentStatus] ?? post.contentStatus} · {formatDate(post.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-list-empty">최근 콘텐츠가 없습니다.</p>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="dashboard-recent-prompts-title">
          <div className="dashboard-section__heading dashboard-section__heading--row">
            <div>
              <h2 id="dashboard-recent-prompts-title">최근 저장 프롬프트</h2>
              <p>생성 시각 순서입니다.</p>
            </div>
            <Link className="secondary-link" to="/briefing-prompts/history">전체 보기</Link>
          </div>
          {data.recentPromptRuns.length > 0 ? (
            <ul className="dashboard-item-list">
              {data.recentPromptRuns.map((run) => (
                <li key={run.id}>
                  <Link to={`/briefing-prompts/history/${run.id}`}>
                    <strong>{run.categoryId} · {run.referenceDate}</strong>
                    <span>
                      최근 글 {run.actualPostCount}/{run.requestedPostCount}개 · {formatDate(run.generatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-list-empty">최근 저장 프롬프트가 없습니다.</p>
          )}
        </section>
      </div>

      {isEmpty ? (
        <section className="dashboard-empty" aria-labelledby="dashboard-empty-title">
          <h2 id="dashboard-empty-title">운영을 시작할 준비가 되었습니다</h2>
          <p>콘텐츠를 만들거나 뉴스 추적과 브리핑 프롬프트 작업을 시작해 보세요.</p>
          <div className="dashboard-empty__actions">
            <Link className="primary-link primary-link--inline" to="/content/new">콘텐츠 생성</Link>
            <Link className="secondary-link" to="/news-topics">뉴스 주제 관리</Link>
            <Link className="secondary-link" to="/briefing-prompts">프롬프트 생성</Link>
          </div>
        </section>
      ) : null}
    </>
  )
}
