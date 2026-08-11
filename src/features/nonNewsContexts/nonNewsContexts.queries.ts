import { useQuery } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { isSupportedNonNewsCategoryId } from './nonNewsContexts.constants'
import { listNonNewsContextItems } from './nonNewsContexts.repository'

export const nonNewsContextQueryKeys = {
  all: ['non-news-contexts'] as const,
  context: (categoryId: string) => [
    ...nonNewsContextQueryKeys.all,
    'context',
    categoryId,
  ] as const,
  idle: () => [...nonNewsContextQueryKeys.all, 'idle'] as const,
}

export function useNonNewsContextQuery(
  client: DatabaseClient | null,
  categoryId: string | null,
) {
  const isValidCategory = isSupportedNonNewsCategoryId(categoryId)

  return useQuery({
    queryKey: isValidCategory
      ? nonNewsContextQueryKeys.context(categoryId)
      : nonNewsContextQueryKeys.idle(),
    queryFn: () => {
      if (!client || !isValidCategory) {
        throw new Error('지원하는 비뉴스 카테고리를 선택해 주세요.')
      }
      return listNonNewsContextItems(client, categoryId)
    },
    enabled: Boolean(client && isValidCategory),
    retry: false,
    gcTime: 0,
  })
}
