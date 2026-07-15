import { z } from 'zod'

const action = z.enum(['create', 'preserve_id', 'remap_id', 'reuse_existing', 'skip', 'block'])
export const restorePlanSchema = z.object({
  format: z.literal('daily-brief-note-restore-plan'), schemaVersion: z.literal(1), planVersion: z.literal(1),
  status: z.enum(['ready', 'warning', 'blocked']), createdAt: z.string().datetime({ offset: true }),
  backup: z.object({ format: z.literal('daily-brief-note-backup'), schemaVersion: z.literal(1), profile: z.enum(['core', 'full']), checksum: z.string().regex(/^[0-9a-f]{64}$/), exportedAt: z.string().datetime({ offset: true }) }).strict(),
  analysis: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/), createdAt: z.string().datetime({ offset: true }), databaseLookupStatus: z.enum(['complete', 'partial', 'unavailable']), recheckRequiredBeforeExecution: z.literal(true) }).strict(),
  policies: z.object({ idConflict: z.enum(['remap', 'block']), identicalData: z.enum(['reuse', 'skip']), operationalHistory: z.enum(['include', 'exclude']), inactiveCategory: z.enum(['allow', 'block']), patternDifference: z.enum(['use_current', 'block']), timestamps: z.enum(['preserve', 'database_default']), recordOverrides: z.record(z.string(), z.enum(['remap_id', 'reuse_existing', 'skip', 'block'])) }).strict(),
  categoryMappings: z.array(z.object({ sourceCategoryId: z.string(), targetCategoryId: z.string().nullable(), status: z.enum(['compatible', 'warning', 'blocked']), warnings: z.array(z.string()) }).strict()),
  recordActions: z.array(z.object({ section: z.string(), sourceId: z.string(), targetId: z.string().nullable(), action, conflictType: z.string(), reasonCode: z.string(), dependencies: z.array(z.string()), warnings: z.array(z.string()), safeDisplay: z.string(), details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }).strict()),
  idMap: z.record(z.string(), z.record(z.string(), z.object({ action: z.enum(['preserve_id', 'remap_id', 'reuse_existing', 'skip', 'block']), targetId: z.string().nullable() }).strict())),
  executionStages: z.array(z.object({ order: z.number().int().positive(), name: z.string(), operation: z.enum(['insert', 'insert_without_previous', 'link', 'counter_max']), recordKeys: z.array(z.string()), dependsOn: z.array(z.string()) }).strict()),
  summary: z.object({ totalRecords: z.number().int().nonnegative(), actionCounts: z.record(z.string(), z.number().int().nonnegative()), sectionCounts: z.record(z.string(), z.number().int().nonnegative()), expectedCreateRows: z.number().int().nonnegative(), expectedReuseRows: z.number().int().nonnegative(), expectedSkippedRows: z.number().int().nonnegative(), blockedRows: z.number().int().nonnegative(), categoryWarningCount: z.number().int().nonnegative(), operationalHistory: z.enum(['included', 'excluded', 'not_present']) }).strict(),
  issues: z.array(z.object({ code: z.string(), severity: z.enum(['error', 'warning', 'info']), message: z.string(), section: z.string(), recordKey: z.string().optional() }).strict()),
  fingerprint: z.object({ algorithm: z.literal('SHA-256'), value: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
}).strict()
