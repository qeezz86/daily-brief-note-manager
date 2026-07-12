import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { newsTopicQueryKeys } from '../newsTopics/newsTopics.queries'
import { createNewsFollowup, getNewsFollowupById, listNewsFollowups, listTopicNewsFollowups, resolveNewsFollowup, updateNewsFollowup } from './newsFollowups.repository'
import type { CreateNewsFollowupInput, ResolveNewsFollowupInput, SaveNewsFollowupInput } from './newsFollowups.types'

export const newsFollowupQueryKeys = {
  all: ['news-followups'] as const,
  list: (userId: string) => ['news-followups', 'list', userId] as const,
  topic: (userId: string, topicId: string) => ['news-followups', 'topic', userId, topicId] as const,
  detail: (userId: string, id: string) => ['news-followups', 'detail', userId, id] as const,
}
function requireClient(client: DatabaseClient | null) { if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.'); return client }
export function useNewsFollowupsQuery(c: DatabaseClient | null, u: string) { return useQuery({ queryKey: newsFollowupQueryKeys.list(u), queryFn: () => listNewsFollowups(requireClient(c)), enabled: !!c && !!u, retry: false }) }
export function useTopicNewsFollowupsQuery(c: DatabaseClient | null, u: string, t: string) { return useQuery({ queryKey: newsFollowupQueryKeys.topic(u, t), queryFn: () => listTopicNewsFollowups(requireClient(c), t), enabled: !!c && !!u && !!t, retry: false }) }
export function useNewsFollowupQuery(c: DatabaseClient | null, u: string, id: string) { return useQuery({ queryKey: newsFollowupQueryKeys.detail(u, id), queryFn: () => getNewsFollowupById(requireClient(c), id), enabled: !!c && !!u && !!id, retry: false }) }
function invalidate(qc: ReturnType<typeof useQueryClient>, u: string, t: string, id?: string) { void qc.invalidateQueries({ queryKey: newsFollowupQueryKeys.list(u) }); void qc.invalidateQueries({ queryKey: newsFollowupQueryKeys.topic(u, t) }); void qc.invalidateQueries({ queryKey: newsTopicQueryKeys.detail(u, t) }); if (id) void qc.invalidateQueries({ queryKey: newsFollowupQueryKeys.detail(u, id) }) }
export function useCreateNewsFollowupMutation(c: DatabaseClient | null, u: string) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: CreateNewsFollowupInput) => createNewsFollowup(requireClient(c), input), onSuccess: (item, input) => invalidate(qc, u, input.topicId, item.id) }) }
export function useUpdateNewsFollowupMutation(c: DatabaseClient | null, u: string, item: { id: string; topicId: string }) { const qc = useQueryClient(); return useMutation({ mutationFn: (input: SaveNewsFollowupInput) => updateNewsFollowup(requireClient(c), item.id, input), onSuccess: () => invalidate(qc, u, item.topicId, item.id) }) }
export function useResolveNewsFollowupMutation(c: DatabaseClient | null, u: string) { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; topicId: string; input: ResolveNewsFollowupInput }) => resolveNewsFollowup(requireClient(c), id, input), onSuccess: (item, variables) => invalidate(qc, u, variables.topicId, item.id) }) }
