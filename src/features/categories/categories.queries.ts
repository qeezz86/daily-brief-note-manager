import { useQuery } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import { getActiveCategories } from './categories.repository'

export const categoryQueryKeys = {
  all: ['categories'] as const,
  active: () => [...categoryQueryKeys.all, 'active'] as const,
}

export function useActiveCategoriesQuery(client: DatabaseClient | null) {
  return useQuery({
    queryKey: categoryQueryKeys.active(),
    queryFn: () => {
      if (!client) {
        throw new Error('Supabase 연결이 설정되지 않았습니다.')
      }

      return getActiveCategories(client)
    },
    enabled: client !== null,
  })
}
