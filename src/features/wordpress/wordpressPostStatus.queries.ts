import { useMutation } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { WordPressPostStatusInput } from './wordpressPostStatus.schema'
import { checkWordPressPostStatus } from './wordpressPostStatus.service'

export function useWordPressPostStatusMutation(client: DatabaseClient | null, contentId: string) {
  return useMutation({ mutationKey: ['wordpress', 'post-status', contentId], mutationFn: (input: WordPressPostStatusInput) => checkWordPressPostStatus(client, input), retry: false })
}
