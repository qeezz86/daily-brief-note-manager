import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { cancelRestoreJob, getRestoreJob, getRestoreJobRecords, getRestoreJobs, resumeRestoreJob } from './restoreExecution.repository'
import type { RestoreRecordFilters } from './restoreExecution.types'

export const restoreJobQueryKeys = { all: ['restore-jobs'] as const, list: (userId: string) => ['restore-jobs', 'list', userId] as const, detail: (userId: string, jobId: string) => ['restore-jobs', 'detail', userId, jobId] as const, records: (userId: string, jobId: string, filters: RestoreRecordFilters) => ['restore-jobs', 'records', userId, jobId, filters] as const }
const required = (client: DatabaseClient | null) => { if (!client) throw new Error('Supabase client is not configured.'); return client }
export function useRestoreJobsQuery(client: DatabaseClient | null, userId: string) { return useQuery({ queryKey: restoreJobQueryKeys.list(userId), queryFn: () => getRestoreJobs(required(client)), enabled: !!client && !!userId, retry: false }) }
export function useRestoreJobQuery(client: DatabaseClient | null, userId: string, jobId: string) { return useQuery({ queryKey: restoreJobQueryKeys.detail(userId, jobId), queryFn: () => getRestoreJob(required(client), jobId), enabled: !!client && !!userId && !!jobId, retry: false }) }
export function useRestoreJobRecordsQuery(client: DatabaseClient | null, userId: string, jobId: string, filters: RestoreRecordFilters) { return useQuery({ queryKey: restoreJobQueryKeys.records(userId, jobId, filters), queryFn: () => getRestoreJobRecords(required(client), jobId, filters), enabled: !!client && !!userId && !!jobId, retry: false }) }
function useRestoreMutation(client: DatabaseClient | null, userId: string, jobId: string, fn: (client: DatabaseClient, jobId: string) => Promise<unknown>) { const query = useQueryClient(); return useMutation({ mutationFn: () => fn(required(client), jobId), onSuccess: () => { void query.invalidateQueries({ queryKey: restoreJobQueryKeys.all }); void query.invalidateQueries({ queryKey: restoreJobQueryKeys.detail(userId, jobId) }) } }) }
export function useCancelRestoreJobMutation(client: DatabaseClient | null, userId: string, jobId: string) { return useRestoreMutation(client, userId, jobId, cancelRestoreJob) }
export function useResumeRestoreJobMutation(client: DatabaseClient | null, userId: string, jobId: string) { return useRestoreMutation(client, userId, jobId, resumeRestoreJob) }
