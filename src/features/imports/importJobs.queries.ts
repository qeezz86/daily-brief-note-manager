import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { cancelImportJob, getImportJob, getImportJobItems, getImportJobs, resumeImportJob } from './importJobs.repository'
import type { ImportJobFilters } from './importJobs.types'

export const importJobQueryKeys = {
  all: ['import-jobs'] as const,
  list: (userId: string, filters: ImportJobFilters) => ['import-jobs', 'list', userId, filters] as const,
  detail: (userId: string, jobId: string) => ['import-jobs', 'detail', userId, jobId] as const,
  items: (userId: string, jobId: string) => ['import-jobs', 'items', userId, jobId] as const,
}

function requireClient(client: DatabaseClient | null) {
  if (!client) throw new Error('Supabase client is not configured.')
  return client
}

export function useImportJobsQuery(client: DatabaseClient | null, userId: string, filters: ImportJobFilters) {
  return useQuery({ queryKey: importJobQueryKeys.list(userId, filters), queryFn: () => getImportJobs(requireClient(client), filters), enabled: !!client && !!userId, retry: false })
}

export function useImportJobQuery(client: DatabaseClient | null, userId: string, jobId: string) {
  return useQuery({ queryKey: importJobQueryKeys.detail(userId, jobId), queryFn: () => getImportJob(requireClient(client), jobId), enabled: !!client && !!userId && !!jobId, retry: false })
}

export function useImportJobItemsQuery(client: DatabaseClient | null, userId: string, jobId: string) {
  return useQuery({ queryKey: importJobQueryKeys.items(userId, jobId), queryFn: () => getImportJobItems(requireClient(client), jobId), enabled: !!client && !!userId && !!jobId, retry: false })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, userId: string, jobId: string) {
  void queryClient.invalidateQueries({ queryKey: importJobQueryKeys.all })
  void queryClient.invalidateQueries({ queryKey: importJobQueryKeys.detail(userId, jobId) })
  void queryClient.invalidateQueries({ queryKey: importJobQueryKeys.items(userId, jobId) })
}

export function useCancelImportJobMutation(client: DatabaseClient | null, userId: string, jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => cancelImportJob(requireClient(client), jobId), onSuccess: () => invalidate(queryClient, userId, jobId) })
}

export function useResumeImportJobMutation(client: DatabaseClient | null, userId: string, jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => resumeImportJob(requireClient(client), jobId), onSuccess: () => invalidate(queryClient, userId, jobId) })
}
