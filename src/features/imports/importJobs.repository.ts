import { z } from 'zod'
import type { Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { importJobDetailSchema, importJobItemSchema, importJobListItemSchema, importJobStageResultSchema, importJobStatusSchema } from './importJobs.schema'
import type { ImportJobDetail, ImportJobFilters, ImportJobItem, ImportJobListItem, ImportJobStageResult, PreparedImportJobItem } from './importJobs.types'
import { mapImportJobError } from './mapImportJobError'

const createResultSchema = z.object({ jobId: z.string().uuid(), isExisting: z.boolean(), status: importJobStatusSchema }).strict()
const appendResultSchema = z.object({ appendedCount: z.number().int().nonnegative(), existingCount: z.number().int().nonnegative(), storedCount: z.number().int().nonnegative() }).strict()
const finalizeResultSchema = z.object({ jobId: z.string().uuid(), status: importJobStatusSchema, itemCount: z.number().int().nonnegative(), idempotent: z.boolean() }).strict()
const stateResultSchema = z.object({ jobId: z.string().uuid(), status: importJobStatusSchema, idempotent: z.boolean() }).passthrough()

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw mapImportJobError({ code: 'PGRST202', message: 'Import job RPC response mismatch' })
  return parsed.data
}

async function rpc<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await promise
  if (error) throw mapImportJobError(error)
  return parseOrThrow(schema, data)
}

export function createOrGetImportJob(client: DatabaseClient, input: {
  format: string; schemaVersion: number; sourceName: string | null; sourceFingerprint: string;
  expectedItemCount: number; dryRunSummary: Json
}) {
  return rpc(client.rpc('create_import_job', {
    p_format: input.format, p_schema_version: input.schemaVersion, p_source_name: input.sourceName ?? '',
    p_source_fingerprint: input.sourceFingerprint, p_expected_item_count: input.expectedItemCount,
    p_dry_run_summary: input.dryRunSummary,
  }), createResultSchema)
}

export function appendImportJobItems(client: DatabaseClient, jobId: string, items: PreparedImportJobItem[]) {
  return rpc(client.rpc('append_import_job_items', { p_job_id: jobId, p_items: items as unknown as Json }), appendResultSchema)
}

export function finalizeImportJob(client: DatabaseClient, jobId: string) {
  return rpc(client.rpc('finalize_import_job', { p_job_id: jobId }), finalizeResultSchema)
}

export async function getImportJobs(client: DatabaseClient, filters: ImportJobFilters = {}): Promise<ImportJobListItem[]> {
  return rpc(client.rpc('get_import_jobs', {
    p_status: filters.status || undefined, p_source_name: filters.sourceName || undefined,
    p_created_from: filters.createdFrom || undefined, p_created_to: filters.createdTo || undefined, p_limit: 100,
  }), z.array(importJobListItemSchema))
}

export async function getImportJob(client: DatabaseClient, jobId: string): Promise<ImportJobDetail | null> {
  const { data, error } = await client.rpc('get_import_job', { p_job_id: jobId })
  if (error) throw mapImportJobError(error)
  if (data === null) return null
  return parseOrThrow(importJobDetailSchema, data) as ImportJobDetail
}

export async function getImportJobItems(client: DatabaseClient, jobId: string): Promise<ImportJobItem[]> {
  return rpc(client.rpc('get_import_job_items', { p_job_id: jobId }), z.array(importJobItemSchema))
}

export function runImportItemContent(client: DatabaseClient, itemId: string): Promise<ImportJobStageResult> {
  return rpc(client.rpc('run_import_job_item_content', { p_job_item_id: itemId }), importJobStageResultSchema)
}

export function runImportItemTracking(client: DatabaseClient, itemId: string): Promise<ImportJobStageResult> {
  return rpc(client.rpc('run_import_job_item_tracking', { p_job_item_id: itemId }), importJobStageResultSchema)
}

export function cancelImportJob(client: DatabaseClient, jobId: string) {
  return rpc(client.rpc('cancel_import_job', { p_job_id: jobId }), stateResultSchema)
}

export function resumeImportJob(client: DatabaseClient, jobId: string) {
  return rpc(client.rpc('resume_cancelled_import_job', { p_job_id: jobId }), stateResultSchema)
}
