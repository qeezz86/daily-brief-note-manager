import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { createNewsTopic, getNewsTopicById, listNewsTopics, listNewsTopicStatusHistory, transitionNewsTopicStatus, updateNewsTopic } from './newsTopics.repository'
import type { CreateNewsTopicInput, TransitionNewsTopicStatusInput, UpdateNewsTopicInput } from './newsTopics.types'

export const newsTopicQueryKeys = {
  all: ['news-topics'] as const,
  list: (userId: string) => ['news-topics', 'list', userId] as const,
  detail: (userId: string, topicId: string) => ['news-topics', 'detail', userId, topicId] as const,
  history: (userId: string, topicId: string) => ['news-topics', 'history', userId, topicId] as const,
}
function requireClient(client: DatabaseClient | null) { if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.'); return client }

export function useNewsTopicsQuery(client: DatabaseClient | null, userId: string) { return useQuery({ queryKey: newsTopicQueryKeys.list(userId), queryFn: () => listNewsTopics(requireClient(client)), enabled: !!client && !!userId }) }
export function useNewsTopicQuery(client: DatabaseClient | null, userId: string, topicId: string) { return useQuery({ queryKey: newsTopicQueryKeys.detail(userId, topicId), queryFn: () => getNewsTopicById(requireClient(client), topicId), enabled: !!client && !!userId && !!topicId, retry: false }) }
export function useNewsTopicHistoryQuery(client: DatabaseClient | null, userId: string, topicId: string) { return useQuery({ queryKey: newsTopicQueryKeys.history(userId, topicId), queryFn: () => listNewsTopicStatusHistory(requireClient(client), topicId), enabled: !!client && !!userId && !!topicId, retry: false }) }

export function useCreateNewsTopicMutation(client: DatabaseClient | null, userId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: Omit<CreateNewsTopicInput, 'ownerId'>) => createNewsTopic(requireClient(client), { ...input, ownerId: userId }), onSuccess: (topic) => { qc.setQueryData(newsTopicQueryKeys.detail(userId, topic.id), topic); void qc.invalidateQueries({ queryKey: newsTopicQueryKeys.list(userId) }) } })
}
export function useUpdateNewsTopicMutation(client: DatabaseClient | null, userId: string, topicId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: UpdateNewsTopicInput) => updateNewsTopic(requireClient(client), topicId, input), onSuccess: (topic) => { qc.setQueryData(newsTopicQueryKeys.detail(userId, topicId), topic); void qc.invalidateQueries({ queryKey: newsTopicQueryKeys.list(userId) }) } })
}
export function useTransitionNewsTopicMutation(client: DatabaseClient | null, userId: string, topicId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: TransitionNewsTopicStatusInput) => transitionNewsTopicStatus(requireClient(client), topicId, input), onSuccess: (topic) => { qc.setQueryData(newsTopicQueryKeys.detail(userId, topicId), topic); void qc.invalidateQueries({ queryKey: newsTopicQueryKeys.list(userId) }); void qc.invalidateQueries({ queryKey: newsTopicQueryKeys.history(userId, topicId) }); void qc.invalidateQueries({ queryKey: ['news-followups'] }) } })
}
