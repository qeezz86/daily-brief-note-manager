import type { Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { createImportFingerprint } from './createImportFingerprint'
import { mapNormalizedImportItemToPayload } from './mapNormalizedImportItemToPayload'
import { mapImportTrackingPayload } from './mapImportTrackingPayload'
import { appendImportJobItems, createOrGetImportJob, finalizeImportJob } from './importJobs.repository'
import type { ImportJobSnapshot, PreparedImportJobItem } from './importJobs.types'
import { importItemClientKey } from './importSelection'
import type { ImportCategory, ImportItemValidationResult, ImportValidationResult } from './importValidation.types'

const CHUNK_SIZE = 100

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export async function buildPreparedImportItems(input: {
  items: ImportItemValidationResult[]
  rawItems: unknown[]
  categories: ImportCategory[]
  approvedWarnings: Set<string>
  validationMode?: 'strict' | 'legacy'
}): Promise<PreparedImportJobItem[]> {
  const prepared: PreparedImportJobItem[] = []
  for (let itemIndex = 0; itemIndex < input.items.length; itemIndex += 1) {
    const validation = input.items[itemIndex]
    const rawItem = input.rawItems[itemIndex]
    const externalKey = validation.externalKey ?? importItemClientKey(validation)
    const category = input.categories.find((candidate) => candidate.id === validation.categoryId)
    if (!category) throw new Error('Import category is missing after validation.')
    const raw = record(rawItem)
    const snapshot: ImportJobSnapshot = {
      schemaVersion: 1,
      externalKey,
      contentGroup: category.contentGroup,
      content: mapNormalizedImportItemToPayload(rawItem, input.validationMode),
      tracking: category.contentGroup === 'news' && raw.newsTracking != null
        ? mapImportTrackingPayload(raw.newsTracking) as unknown as Json
        : null,
    }
    prepared.push({
      itemIndex,
      externalKey,
      payloadFingerprint: await createImportFingerprint(snapshot),
      title: validation.title,
      categoryId: validation.categoryId,
      validationStatus: validation.status === 'warning' ? 'warning' : 'ready',
      warningAcknowledged: validation.status === 'warning' && input.approvedWarnings.has(importItemClientKey(validation)),
      normalizedPayload: snapshot,
    })
  }
  return prepared
}

export async function prepareImportJob(client: DatabaseClient, input: {
  format: string
  schemaVersion: number
  sourceName: string | null
  validationResult: ImportValidationResult
  items: ImportItemValidationResult[]
  rawItems: unknown[]
  categories: ImportCategory[]
  approvedWarnings: Set<string>
  validationMode?: 'strict' | 'legacy'
}) {
  const prepared = await buildPreparedImportItems(input)
  const sourceFingerprint = await createImportFingerprint({
    format: input.format,
    schemaVersion: input.schemaVersion,
    items: prepared.map((item) => ({ normalizedPayload: item.normalizedPayload, warningAcknowledged: item.warningAcknowledged })),
  })
  const summary = input.validationResult.summary
  const created = await createOrGetImportJob(client, {
    format: input.format,
    schemaVersion: input.schemaVersion,
    sourceName: input.sourceName,
    sourceFingerprint,
    expectedItemCount: prepared.length,
    dryRunSummary: {
      total: summary.total, readyCount: summary.ready, warningCount: summary.warning,
      invalidCount: summary.invalid, duplicateCount: summary.duplicate,
      acknowledgedWarningCount: prepared.filter((item) => item.validationStatus === 'warning' && item.warningAcknowledged).length,
      databaseCheck: input.validationResult.databaseCheck,
    },
  })
  if (created.status !== 'preparing') return { ...created, sourceFingerprint }
  for (let offset = 0; offset < prepared.length; offset += CHUNK_SIZE) {
    await appendImportJobItems(client, created.jobId, prepared.slice(offset, offset + CHUNK_SIZE))
  }
  const finalized = await finalizeImportJob(client, created.jobId)
  return { ...created, status: finalized.status, sourceFingerprint }
}
