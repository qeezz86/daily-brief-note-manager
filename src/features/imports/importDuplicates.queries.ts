import { useQuery } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  getImportCategories,
} from './importDuplicates.repository'

export const importQueryKeys = {
  all: ['imports'] as const,
  categories: () => [...importQueryKeys.all, 'categories'] as const,
}

export function useImportCategoriesQuery(client: DatabaseClient | null) {
  return useQuery({
    queryKey: importQueryKeys.categories(),
    queryFn: () => {
      if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.')
      return getImportCategories(client)
    },
    enabled: client !== null,
    retry: false,
  })
}
