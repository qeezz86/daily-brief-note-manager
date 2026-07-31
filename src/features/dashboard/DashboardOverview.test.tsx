import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { DashboardOverview } from './DashboardOverview'
import { dashboardQueryKeys } from './dashboard.queries'
import { getDashboardOverview } from './dashboard.repository'
import type { DashboardRpcClient } from './dashboard.repository'
import { parseDashboardOverview } from './dashboard.schemas'
import type { DashboardOverviewData } from './dashboard.types'

const rawOverview = {
  schema_version: 1,
  counts: {
    total_posts: 12,
    ready_posts: 3,
    active_news_topics: 4,
    pending_news_followups: 2,
  },
  category_counts: [
    { category_id: 'economy', category_name: '경제', post_count: 7 },
    { category_id: 'global', category_name: '국제', post_count: 0 },
  ],
  recent_posts: [{
    id: '00000000-0000-4000-8000-000000000001',
    title: '최근 경제 콘텐츠',
    category_id: 'economy',
    content_status: 'ready',
    updated_at: '2026-07-29T03:00:00+00:00',
  }],
  recent_prompt_runs: [{
    id: '00000000-0000-4000-8000-000000000002',
    category_id: 'economy',
    reference_date: '2026-07-29',
    requested_post_count: 5,
    actual_post_count: 3,
    generated_at: '2026-07-29T02:00:00+00:00',
  }],
}

const overview = parseDashboardOverview(rawOverview)

function renderOverview(props: Partial<{
  data: DashboardOverviewData
  isPending: boolean
  isError: boolean
  onRetry: () => void
}> = {}) {
  const onRetry = props.onRetry ?? vi.fn()
  render(
    <MemoryRouter>
      <DashboardOverview
        data={props.data}
        isPending={props.isPending ?? false}
        isError={props.isError ?? false}
        onRetry={onRetry}
      />
    </MemoryRouter>,
  )
  return onRetry
}

describe('dashboard response contract', () => {
  it('parses a populated snake-case response into the application model', () => {
    expect(overview).toMatchObject({
      schemaVersion: 1,
      counts: {
        totalPosts: 12,
        readyPosts: 3,
        activeNewsTopics: 4,
        pendingNewsFollowups: 2,
      },
      categoryCounts: [
        { categoryId: 'economy', categoryName: '경제', postCount: 7 },
        { categoryId: 'global', categoryName: '국제', postCount: 0 },
      ],
      recentPosts: [{ title: '최근 경제 콘텐츠', contentStatus: 'ready' }],
      recentPromptRuns: [{ referenceDate: '2026-07-29', actualPostCount: 3 }],
    })
  })

  it('accepts a valid zero-count response', () => {
    expect(parseDashboardOverview({
      schema_version: 1,
      counts: {
        total_posts: 0,
        ready_posts: 0,
        active_news_topics: 0,
        pending_news_followups: 0,
      },
      category_counts: [],
      recent_posts: [],
      recent_prompt_runs: [],
    }).counts.totalPosts).toBe(0)
  })

  it('rejects negative counts and invalid category shapes', () => {
    expect(() => parseDashboardOverview({
      ...rawOverview,
      counts: { ...rawOverview.counts, total_posts: -1 },
    })).toThrow()
    expect(() => parseDashboardOverview({
      ...rawOverview,
      category_counts: [{ category_id: '', category_name: '', post_count: 1 }],
    })).toThrow()
  })

  it('rejects missing, changed, or sensitive extra schema fields', () => {
    const missingVersion = {
      counts: rawOverview.counts,
      category_counts: rawOverview.category_counts,
      recent_posts: rawOverview.recent_posts,
      recent_prompt_runs: rawOverview.recent_prompt_runs,
    } satisfies Omit<typeof rawOverview, 'schema_version'>
    expect(() => parseDashboardOverview(missingVersion)).toThrow()
    expect(() => parseDashboardOverview({ ...rawOverview, schema_version: 2 })).toThrow()
    expect(() => parseDashboardOverview({ ...rawOverview, owner_id: 'private-owner' })).toThrow()
  })

  it('calls the dashboard RPC with the validated limit and normalizes failures', async () => {
    const rpc = vi.fn<DashboardRpcClient['rpc']>().mockResolvedValue({
      data: rawOverview,
      error: null,
    })
    const client = { rpc } satisfies DashboardRpcClient

    await expect(getDashboardOverview(client)).resolves.toEqual(overview)
    expect(rpc).toHaveBeenCalledWith('get_dashboard_overview', { p_recent_limit: 5 })

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'owner_id=private database detail' },
    })
    await expect(getDashboardOverview(client)).rejects.toThrow(
      '대시보드 데이터를 불러오지 못했습니다.',
    )
  })

  it('isolates query keys by authenticated user and limit', () => {
    expect(dashboardQueryKeys.overview('owner-a')).not.toEqual(
      dashboardQueryKeys.overview('owner-b'),
    )
    expect(dashboardQueryKeys.overview('owner-a', 5)).not.toEqual(
      dashboardQueryKeys.overview('owner-a', 10),
    )
  })
})

describe('DashboardOverview', () => {
  it('renders an accessible loading state', () => {
    renderOverview({ isPending: true })
    expect(screen.getByRole('status')).toHaveTextContent('운영 현황을 불러오고 있습니다.')
  })

  it('renders summaries, category counts, and detail links', () => {
    renderOverview({ data: overview })

    expect(screen.getByRole('link', { name: '전체 콘텐츠 12개 보기' })).toHaveAttribute('href', '/content')
    expect(screen.getByRole('link', { name: '발행 준비 3개 보기' })).toHaveAttribute('href', '/content')
    expect(screen.getByRole('link', { name: '진행 중 뉴스 주제 4개 보기' })).toHaveAttribute('href', '/news-topics')
    expect(screen.getByRole('link', { name: '확인 대기 후속 항목 2개 보기' })).toHaveAttribute('href', '/news-followups')
    expect(screen.getByText('경제').closest('li')).toHaveTextContent('7개')
    expect(screen.getByText('국제').closest('li')).toHaveTextContent('0개')
    expect(screen.getByRole('link', { name: /최근 경제 콘텐츠/ })).toHaveAttribute(
      'href',
      '/content/00000000-0000-4000-8000-000000000001',
    )
    expect(screen.getByRole('link', { name: /economy · 2026-07-29/ })).toHaveAttribute(
      'href',
      '/briefing-prompts/history/00000000-0000-4000-8000-000000000002',
    )
  })

  it('renders zero counts and only existing-route empty actions', () => {
    renderOverview({
      data: {
        schemaVersion: 1,
        counts: {
          totalPosts: 0,
          readyPosts: 0,
          activeNewsTopics: 0,
          pendingNewsFollowups: 0,
        },
        categoryCounts: [{ categoryId: 'economy', categoryName: '경제', postCount: 0 }],
        recentPosts: [],
        recentPromptRuns: [],
      },
    })

    expect(screen.getByRole('link', { name: '전체 콘텐츠 0개 보기' })).toBeInTheDocument()
    expect(screen.getByText('최근 콘텐츠가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('최근 저장 프롬프트가 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '콘텐츠 생성' })).toHaveAttribute('href', '/content/new')
    expect(screen.getByRole('link', { name: '뉴스 주제 관리' })).toHaveAttribute('href', '/news-topics')
    expect(screen.getByRole('link', { name: '프롬프트 생성' })).toHaveAttribute('href', '/briefing-prompts')
  })

  it('sanitizes errors and retries only after the user action', () => {
    const onRetry = renderOverview({ isError: true })
    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')
    expect(alert).not.toHaveTextContent('owner_id')
    expect(onRetry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
