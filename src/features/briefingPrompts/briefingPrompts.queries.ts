import { useQuery } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { getNewsBriefingPromptContext } from './briefingPrompts.repository'
import type { BriefingPromptSettings } from './briefingPrompts.types'

export const briefingPromptQueryKeys = {
  all: ['briefing-prompts'] as const,
  context: (userId: string, settings: BriefingPromptSettings) => [
    ...briefingPromptQueryKeys.all, 'context', userId, settings.categoryId,
    settings.referenceDate, settings.mode, settings.closedLookbackDays,
  ] as const,
}

export function useBriefingPromptContextQuery(
  client: DatabaseClient | null,
  userId: string,
  settings: BriefingPromptSettings | null,
) {
  return useQuery({
    queryKey: settings ? briefingPromptQueryKeys.context(userId, settings) : [...briefingPromptQueryKeys.all, 'idle', userId],
    queryFn: () => {
      if (!client || !settings) throw new Error('브리핑 프롬프트 설정이 필요합니다.')
      return getNewsBriefingPromptContext(client, settings)
    },
    enabled: Boolean(client && userId && settings),
    retry: false,
  })
}
