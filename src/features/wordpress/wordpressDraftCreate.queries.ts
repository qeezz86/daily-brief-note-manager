import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { WordPressDraftCreateInput } from './wordpressDraftCreate.schema'
import { getWordPressPublicationAttempts } from './wordpressDraftCreate.repository'
import { createWordPressDraft } from './wordpressDraftCreate.service'

const attemptKey = (userId: string, contentId: string) => ['wordpress', 'draft-attempts', userId, contentId] as const

export function useWordPressPublicationAttemptsQuery(client: DatabaseClient | null, userId: string, contentId: string) {
  return useQuery({
    queryKey: attemptKey(userId, contentId),
    queryFn: () => {
      if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.')
      return getWordPressPublicationAttempts(client, contentId)
    },
    enabled: Boolean(client && userId && contentId), retry: false,
  })
}

export function useWordPressDraftCreateMutation(client: DatabaseClient | null, userId: string, contentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['wordpress', 'create-draft', contentId],
    mutationFn: (input: WordPressDraftCreateInput) => createWordPressDraft(client, input),
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: attemptKey(userId, contentId) }),
  })
}
