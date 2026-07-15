import { z } from 'zod'
import type { Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { restoreJobDetailSchema, restoreJobListSchema, restoreJobRecordSchema, restoreJobStatusSchema, restoreRunResultSchema } from './restoreExecution.schema'
import type { PreparedRestoreRecord, RestoreJobAggregate, RestoreJobDetail, RestoreJobRecord, RestoreRecordFilters, RestoreRecordRunResult } from './restoreExecution.types'
import type { RestorePlan } from './restorePlan.types'
import type { ValidatedBackupBundle, BackupCategoryManifestEntry } from './backupRestore.types'

const rpcClient = (client: DatabaseClient) => client as unknown as { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }
const createSchema = z.object({ jobId: z.string().uuid(), isExisting: z.boolean(), status: restoreJobStatusSchema }).strict()
const appendSchema = z.object({ appendedCount: z.number().int().nonnegative(), existingCount: z.number().int().nonnegative(), storedCount: z.number().int().nonnegative() }).strict()
const finalizeSchema = z.object({ jobId: z.string().uuid(), status: restoreJobStatusSchema, recordCount: z.number().int().nonnegative(), idempotent: z.boolean() }).strict()
const stateSchema = z.object({ jobId: z.string().uuid(), status: restoreJobStatusSchema, idempotent: z.boolean() }).passthrough()

export class SafeRestoreError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

function safeError(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const message = typeof value.message === 'string' ? value.message : ''
  const known = message.match(/RESTORE_[A-Z_]+/)?.[0]
  return new SafeRestoreError(known ?? 'RESTORE_CONNECTION_FAILED', known ? '복원 작업의 최신 상태와 입력을 다시 확인해 주세요.' : '복원 DB 요청을 완료하지 못했습니다.')
}

async function call<T>(client: DatabaseClient, name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await rpcClient(client).rpc(name, args)
  if (error) throw safeError(error)
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new SafeRestoreError('RESTORE_RESPONSE_INVALID', '복원 작업 응답 형식을 확인할 수 없습니다.')
  return parsed.data
}

function categoryMappings(bundle: ValidatedBackupBundle, plan: RestorePlan, current: BackupCategoryManifestEntry[]): Json {
  const source = new Map(bundle.manifest.categoryManifest.map((item) => [item.id, item]))
  const targets = new Map(current.map((item) => [item.id, item]))
  return plan.categoryMappings.map((mapping) => ({ ...mapping, source: source.get(mapping.sourceCategoryId), target: mapping.targetCategoryId ? targets.get(mapping.targetCategoryId) : null })) as Json
}

export function createOrGetRestoreJob(client: DatabaseClient, input: { bundle: ValidatedBackupBundle; plan: RestorePlan; currentCategories: BackupCategoryManifestEntry[]; records: PreparedRestoreRecord[]; sourceName: string | null }) {
  const { bundle, plan } = input
  return call(client, 'create_restore_job', {
    p_backup_format: bundle.format, p_backup_schema_version: bundle.schemaVersion, p_backup_profile: bundle.profile,
    p_backup_checksum: bundle.checksum.value, p_plan_format: plan.format, p_plan_schema_version: plan.schemaVersion,
    p_plan_version: plan.planVersion, p_plan_fingerprint: plan.fingerprint.value, p_analysis_fingerprint: plan.analysis.fingerprint,
    p_plan_status: plan.status, p_source_name: input.sourceName ?? '', p_policies: plan.policies as unknown as Json,
    p_category_mappings: categoryMappings(bundle, plan, input.currentCategories), p_execution_stages: plan.executionStages as unknown as Json,
    p_expected_record_count: input.records.length,
  }, createSchema)
}

export function appendRestoreJobRecords(client: DatabaseClient, jobId: string, records: PreparedRestoreRecord[]) {
  return call(client, 'append_restore_job_records', { p_job_id: jobId, p_records: records as unknown as Json }, appendSchema)
}
export function finalizeRestoreJob(client: DatabaseClient, jobId: string) { return call(client, 'finalize_restore_job', { p_job_id: jobId }, finalizeSchema) }
export function runRestoreJobRecord(client: DatabaseClient, recordId: string): Promise<RestoreRecordRunResult> { return call(client, 'run_restore_job_record', { p_restore_job_record_id: recordId }, restoreRunResultSchema) }
export function cancelRestoreJob(client: DatabaseClient, jobId: string) { return call(client, 'cancel_restore_job', { p_job_id: jobId }, stateSchema) }
export function resumeRestoreJob(client: DatabaseClient, jobId: string) { return call(client, 'resume_cancelled_restore_job', { p_job_id: jobId }, stateSchema) }

export function getRestoreJobs(client: DatabaseClient): Promise<RestoreJobAggregate[]> { return call(client, 'get_restore_jobs', { p_limit: 100 }, z.array(restoreJobListSchema)) }
export async function getRestoreJob(client: DatabaseClient, jobId: string): Promise<RestoreJobDetail | null> {
  const { data, error } = await rpcClient(client).rpc('get_restore_job', { p_job_id: jobId })
  if (error) throw safeError(error); if (data === null) return null
  const parsed = restoreJobDetailSchema.safeParse(data); if (!parsed.success) throw new SafeRestoreError('RESTORE_RESPONSE_INVALID', '복원 작업 상세 응답을 확인할 수 없습니다.')
  return parsed.data as RestoreJobDetail
}
export function getRestoreJobRecords(client: DatabaseClient, jobId: string, filters: RestoreRecordFilters = {}): Promise<RestoreJobRecord[]> {
  return call(client, 'get_restore_job_records', {
    p_job_id: jobId, p_stage: filters.stage || undefined, p_section: filters.section || undefined,
    p_action: filters.action || undefined, p_status: filters.status || undefined,
    p_retryable: filters.retryable, p_search: filters.search || undefined,
  }, z.array(restoreJobRecordSchema))
}
