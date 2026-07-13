import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  getNewsBriefingPromptContext,
  getPromptRunById,
  listPromptRuns,
  savePromptRun,
  setPromptRunPinned,
} from './briefingPrompts.repository'
import type { BriefingPromptSettings, SaveBriefingPromptRunInput } from './briefingPrompts.types'

export const briefingPromptQueryKeys = {
  all: ['briefing-prompts'] as const,
  context: (userId: string, settings: BriefingPromptSettings) => [
    ...briefingPromptQueryKeys.all, 'context', userId, settings.categoryId,
    settings.referenceDate, settings.mode, settings.closedLookbackDays,
  ] as const,
  history: (userId: string) => [...briefingPromptQueryKeys.all, 'history', userId] as const,
  detail: (userId: string, runId: string) => [
    ...briefingPromptQueryKeys.all, 'history', userId, 'detail', runId,
  ] as const,
}

function requireClient(client: DatabaseClient | null): DatabaseClient {
  if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.')
  return client
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

export function usePromptRunHistoryQuery(
  client: DatabaseClient | null,
  userId: string,
) {
  return useQuery({
    queryKey: briefingPromptQueryKeys.history(userId),
    queryFn: () => listPromptRuns(requireClient(client)),
    enabled: Boolean(client && userId),
    retry: false,
  })
}

export function usePromptRunQuery(
  client: DatabaseClient | null,
  userId: string,
  runId: string,
) {
  return useQuery({
    queryKey: briefingPromptQueryKeys.detail(userId, runId),
    queryFn: () => getPromptRunById(requireClient(client), runId),
    enabled: Boolean(client && userId && runId),
    retry: false,
  })
}

export function useSavePromptRunMutation(
  client: DatabaseClient | null,
  userId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveBriefingPromptRunInput) => savePromptRun(requireClient(client), input),
    onSuccess: (run) => {
      queryClient.setQueryData(briefingPromptQueryKeys.detail(userId, run.id), run)
      void queryClient.invalidateQueries({ queryKey: briefingPromptQueryKeys.history(userId) })
    },
  })
}

export function useSetPromptRunPinnedMutation(
  client: DatabaseClient | null,
  userId: string,
  runId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isPinned: boolean) => setPromptRunPinned(requireClient(client), runId, isPinned),
    onSuccess: (run) => {
      queryClient.setQueryData(briefingPromptQueryKeys.detail(userId, runId), run)
      void queryClient.invalidateQueries({ queryKey: briefingPromptQueryKeys.history(userId) })
      void queryClient.invalidateQueries({ queryKey: briefingPromptQueryKeys.detail(userId, runId) })
    },
  })
}
