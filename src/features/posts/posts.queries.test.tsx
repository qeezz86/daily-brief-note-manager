import { onlineManager, QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { postDeleteQueryKeys, useDeletePostMutation, usePostDeleteEligibilityQuery } from './posts.delete.queries'
import { deletePost, inspectPostDeleteEligibility } from './posts.delete.repository'
import { postQueryKeys } from './posts.queries'

vi.mock('./posts.delete.repository', async (importOriginal) => ({
  ...await importOriginal<typeof import('./posts.delete.repository')>(),
  deletePost: vi.fn(),
  inspectPostDeleteEligibility: vi.fn(),
}))

const client = {} as DatabaseClient
const owner = 'owner-a'
const post = 'post-1'
function setup() {
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: Infinity },
    mutations: { retry: 3, retryDelay: 0 },
  } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

beforeEach(() => {
  vi.mocked(deletePost).mockReset().mockResolvedValue(undefined)
  vi.mocked(inspectPostDeleteEligibility).mockReset().mockResolvedValue('DELETABLE')
})

afterEach(() => {
  onlineManager.setOnline(true)
})

const targetKeys = [
  postQueryKeys.detail(owner, post), postQueryKeys.seo(owner, post),
  postQueryKeys.tags(owner, post), postQueryKeys.sources(owner, post),
  postQueryKeys.chineseMetadata(owner, post), postQueryKeys.aiMetadata(owner, post),
  postQueryKeys.infoDbMetadata(owner, post), postDeleteQueryKeys.eligibility(owner, post),
  ['wordpress', 'draft-attempts', owner, post],
  ['news-updates', 'post', owner, post], ['news-updates', 'sources', owner, post, 'update-1'],
]
const affectedKeys = [
  [...postQueryKeys.list(owner), { page: 2, categoryId: '', status: '', search: '' }],
  [...postQueryKeys.list(owner), { page: 1, categoryId: 'economy', status: 'draft', search: '검색' }],
  postQueryKeys.list(owner), ['news-updates', 'topic', owner, 'topic-1'],
  ['news-updates', 'detail', owner, 'update-1'], ['news-updates', 'previous', owner, 'topic-1'],
  ['news-topics', 'detail', owner, 'topic-1'], ['news-followups', 'list', owner],
  ['dashboard', 'overview', owner, 5], ['briefing-prompts', 'context', owner, 'economy'],
  ['non-news-contexts', 'context', 'ai-column'], ['backups', 'estimate', owner, 'core'],
]
const untouchedKeys = [
  postQueryKeys.detail(owner, 'other-post'), postQueryKeys.list('other-owner'),
  ['wordpress', 'draft-attempts', owner, 'other-post'], ['categories', 'active'],
  ['briefing-prompts', 'history', owner], ['restore-jobs', 'list', owner],
]

describe('permanent delete query flow', () => {
  it('awaits targeted cleanup and invalidation while preserving unrelated caches', async () => {
    const { queryClient, wrapper } = setup()
    for (const key of [...targetKeys, ...affectedKeys, ...untouchedKeys]) queryClient.setQueryData(key, { retained: true })
    const { result } = renderHook(() => useDeletePostMutation(client, owner, post), { wrapper })
    await act(async () => { await result.current.mutateAsync() })
    expect(deletePost).toHaveBeenCalledExactlyOnceWith(client, owner, post)
    for (const key of targetKeys) expect(queryClient.getQueryState(key)).toBeUndefined()
    for (const key of affectedKeys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of untouchedKeys) {
      expect(queryClient.getQueryData(key)).toEqual({ retained: true })
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    }
    queryClient.clear()
  })

  it('disables automatic retry and leaves all caches intact on failure', async () => {
    vi.mocked(deletePost).mockRejectedValue(new Error('삭제 실패'))
    const { queryClient, wrapper } = setup()
    for (const key of [...targetKeys, ...affectedKeys]) queryClient.setQueryData(key, { retained: true })
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
    const remove = vi.spyOn(queryClient, 'removeQueries')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDeletePostMutation(client, owner, post), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toThrow('삭제 실패') })
    expect(queryClient.getMutationCache().getAll()[0].options.retry).toBe(false)
    expect(deletePost).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    for (const key of [...targetKeys, ...affectedKeys]) expect(queryClient.getQueryData(key)).toEqual({ retained: true })
    queryClient.clear()
  })

  it('executes a destructive mutation while offline instead of pausing it for reconnect', async () => {
    onlineManager.setOnline(false)
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useDeletePostMutation(client, owner, post), { wrapper })
    await act(async () => { await result.current.mutateAsync() })
    const mutation = queryClient.getMutationCache().getAll()[0]
    expect(mutation.options.networkMode).toBe('always')
    expect(mutation.options.retry).toBe(false)
    expect(mutation.state.isPaused).toBe(false)
    expect(deletePost).toHaveBeenCalledExactlyOnceWith(client, owner, post)
    queryClient.clear()
  })

  it('cancels an active target read before removal so its late response cannot resurrect the post', async () => {
    const { queryClient, wrapper } = setup()
    const detailKey = postQueryKeys.detail(owner, post)
    const lifecycle: string[] = []
    let resolveRead!: (value: { id: string }) => void
    const read = new Promise<{ id: string }>((resolve) => { resolveRead = resolve })
    const observer = new QueryObserver(queryClient, {
      queryKey: detailKey,
      queryFn: ({ signal }) => {
        signal.addEventListener('abort', () => { lifecycle.push('cancelled') }, { once: true })
        // Model a transport that still delivers its response after cancellation.
        return read
      },
    })
    const unsubscribe = observer.subscribe(() => undefined)
    const activeQuery = queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'removed' && event.query === activeQuery) lifecycle.push('removed')
    })
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
    const remove = vi.spyOn(queryClient, 'removeQueries')
    const { result, unmount } = renderHook(() => useDeletePostMutation(client, owner, post), { wrapper })
    try {
      expect(queryClient.getQueryCache().findAll({ queryKey: detailKey, exact: true, type: 'active' })).toHaveLength(1)
      expect(observer.getCurrentResult().fetchStatus).toBe('fetching')
      expect(queryClient.isFetching({ queryKey: detailKey, exact: true })).toBe(1)
      expect(lifecycle).toEqual([])

      await act(async () => { await result.current.mutateAsync() })
      expect(deletePost).toHaveBeenCalledExactlyOnceWith(client, owner, post)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0])
      expect(lifecycle).toEqual(['cancelled', 'removed'])
      expect(queryClient.getQueryState(detailKey)).toBeUndefined()

      await act(async () => {
        resolveRead({ id: post })
        await read
      })
      // Keep the observer subscribed until after the stale response is settled.
      expect(queryClient.getQueryState(detailKey)).toBeUndefined()
      expect(queryClient.getQueryData(detailKey)).toBeUndefined()
      expect(queryClient.isFetching({ queryKey: detailKey, exact: true })).toBe(0)
    } finally {
      resolveRead({ id: post })
      unsubscribeCache()
      unsubscribe()
      unmount()
      queryClient.clear()
    }
  })

  it.each([
    [null, owner, post], [client, '', post], [client, owner, ''], [client, ' ', post],
  ] as const)('disables eligibility without required inputs %#', async (db, userId, postId) => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => usePostDeleteEligibilityQuery(db, userId, postId), { wrapper })
    expect(result.current.eligibility).toBe('CHECK_FAILED')
    expect(inspectPostDeleteEligibility).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('exposes CHECKING and does not expose stale DELETABLE after a failed refetch', async () => {
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => usePostDeleteEligibilityQuery(client, owner, post), { wrapper })
    expect(result.current.eligibility).toBe('CHECKING')
    await waitFor(() => expect(result.current.eligibility).toBe('DELETABLE'))
    vi.mocked(inspectPostDeleteEligibility).mockRejectedValue(new Error('offline'))
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.eligibility).toBe('CHECK_FAILED'))
    queryClient.clear()
  })

  it('executes the eligibility check while offline instead of pausing a cached decision', async () => {
    onlineManager.setOnline(false)
    const { queryClient, wrapper } = setup()
    queryClient.setQueryData(postDeleteQueryKeys.eligibility(owner, post), 'DELETABLE')
    const { result } = renderHook(() => usePostDeleteEligibilityQuery(client, owner, post), { wrapper })
    await waitFor(() => expect(inspectPostDeleteEligibility).toHaveBeenCalledExactlyOnceWith(client, owner, post))
    await waitFor(() => expect(result.current.eligibility).toBe('DELETABLE'))
    const query = queryClient.getQueryCache().find({ queryKey: postDeleteQueryKeys.eligibility(owner, post), exact: true })
    expect(query?.options.networkMode).toBe('always')
    expect(query?.state.fetchStatus).not.toBe('paused')
    queryClient.clear()
  })
})
