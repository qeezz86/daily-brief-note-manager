import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import { deletePost, inspectPostDeleteEligibility } from './posts.delete.repository'
import type { PostDeleteEligibility } from './posts.delete.repository'
import { postQueryKeys } from './posts.queries'

export const postDeleteQueryKeys = {
  eligibility: (userId: string, postId: string) =>
    [...postQueryKeys.all, 'delete-eligibility', userId, postId] as const,
}

export function usePostDeleteEligibilityQuery(client: DatabaseClient | null, userId: string, postId: string) {
  const enabled = Boolean(client && userId.trim() && postId.trim())
  const query = useQuery({
    queryKey: postDeleteQueryKeys.eligibility(userId, postId),
    queryFn: () => inspectPostDeleteEligibility(requireClient(client), userId, postId),
    enabled,
    networkMode: 'always',
    retry: false,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  const eligibility: PostDeleteEligibility = !enabled || query.isError
    ? 'CHECK_FAILED'
    : query.isPending || query.isFetching
      ? 'CHECKING'
      : query.data ?? 'CHECK_FAILED'
  return { ...query, eligibility }
}

export function useDeletePostMutation(client: DatabaseClient | null, userId: string, postId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deletePost(requireClient(client), userId, postId),
    networkMode: 'always',
    retry: false,
    onSuccess: async () => {
      // Match existing keys without importing newsUpdates.queries (which imports posts).
      const target = ({ queryKey: key }: { queryKey: readonly unknown[] }) =>
        (key[0] === 'posts' && key[2] === userId && key[3] === postId) ||
        (key[0] === 'wordpress' && key[1] === 'draft-attempts' && key[2] === userId && key[3] === postId) ||
        (key[0] === 'news-updates' && key[2] === userId &&
          (key[1] === 'post' || key[1] === 'sources') && key[3] === postId)
      const affected = ({ queryKey: key }: { queryKey: readonly unknown[] }) =>
        (key[0] === 'posts' && key[1] === 'list' && key[2] === userId) ||
        (['news-updates', 'news-topics', 'news-followups'].includes(String(key[0])) && key[2] === userId) ||
        (key[0] === 'dashboard' && key[1] === 'overview' && key[2] === userId) ||
        (key[0] === 'briefing-prompts' && key[1] === 'context' && key[2] === userId) ||
        (key[0] === 'non-news-contexts' && key[1] === 'context') ||
        (key[0] === 'backups' && key[1] === 'estimate' && key[2] === userId)
      await queryClient.cancelQueries({ predicate: (query) => target(query) || affected(query) })
      queryClient.removeQueries({ predicate: target })
      await queryClient.invalidateQueries({ predicate: affected })
    },
  })
}

function requireClient(client: DatabaseClient | null): DatabaseClient {
  if (!client) {
    throw new Error('Supabase 연결이 설정되지 않았습니다.')
  }

  return client
}
