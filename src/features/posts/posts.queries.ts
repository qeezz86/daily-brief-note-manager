import { useQuery } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import { getPosts } from './posts.repository'

export const postQueryKeys = {
  all: ['posts'] as const,
  list: (userId: string) => [...postQueryKeys.all, 'list', userId] as const,
}

export function usePostsQuery(
  client: DatabaseClient | null,
  userId: string,
) {
  return useQuery({
    queryKey: postQueryKeys.list(userId),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase 연결이 설정되지 않았습니다.')
      }

      return getPosts(client)
    },
    enabled: client !== null && userId !== '',
  })
}
