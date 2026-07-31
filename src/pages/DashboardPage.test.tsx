import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { DashboardRpcClient } from '../features/dashboard/dashboard.repository'
import { DashboardPageContent } from './DashboardPage'

describe('DashboardPage', () => {
  it('renders the owner-scoped operational overview page', async () => {
    const rpc = vi.fn<DashboardRpcClient['rpc']>().mockResolvedValue({
      data: {
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
      },
      error: null,
    })
    const client = { rpc } satisfies DashboardRpcClient
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPageContent client={client} userId="owner-a" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: '운영 현황' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: '전체 콘텐츠 0개 보기' }),
    ).toHaveAttribute('href', '/content')
    expect(rpc).toHaveBeenCalledWith('get_dashboard_overview', {
      p_recent_limit: 5,
    })
  })
})
