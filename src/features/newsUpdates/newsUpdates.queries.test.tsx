import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { newsUpdateQueryKeys, useCreateNewsUpdateMutation } from './newsUpdates.queries'

describe('news update query isolation', () => {
  it('uses different cache keys for different accounts', () => {
    expect(newsUpdateQueryKeys.detail('owner-a', 'update')).not.toEqual(newsUpdateQueryKeys.detail('owner-b', 'update'))
    expect(newsUpdateQueryKeys.sources('owner-a', 'post')).not.toEqual(newsUpdateQueryKeys.sources('owner-b', 'post'))
    expect(newsUpdateQueryKeys.previous('owner-a', 'topic')).not.toEqual(newsUpdateQueryKeys.previous('owner-b', 'topic'))
  })

  it('invalidates assignable source and previous candidate caches after creation', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const sourceKey = newsUpdateQueryKeys.sources('owner', 'post')
    const previousKey = newsUpdateQueryKeys.previous('owner', 'topic')
    queryClient.setQueryData(sourceKey, [{ id: 'source' }])
    queryClient.setQueryData(previousKey, [])
    const client = { rpc: vi.fn().mockResolvedValue({ data: { id: 'update' }, error: null }) } as unknown as DatabaseClient
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useCreateNewsUpdateMutation(client, 'owner'), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ postId: 'post', topicId: 'topic', updateType: 'new', headline: '제목', factSummary: '사실', importanceSummary: null, impactSummary: null, changeSummary: null, previousUpdateId: null, sourceIds: ['source'] })
    })

    expect(queryClient.getQueryState(sourceKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(previousKey)?.isInvalidated).toBe(true)
  })
})
