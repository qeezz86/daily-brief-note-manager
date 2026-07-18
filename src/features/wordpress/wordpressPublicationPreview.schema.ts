import { z } from 'zod'

const termSchema = z.object({ id: z.number().int().positive(), name: z.string(), slug: z.string().min(1), count: z.number().int().nonnegative() }).strict()
const categoryTermSchema = termSchema.extend({ parent: z.number().int().nonnegative() }).strict()
export const taxonomyCatalogResponseSchema = z.object({
  schemaVersion: z.literal(1), ok: z.literal(true), mode: z.literal('dry-run'), writePerformed: z.literal(false), checkedAt: z.string(),
  site: z.object({ origin: z.string().url() }).strict(),
  catalog: z.object({ categories: z.array(categoryTermSchema), tags: z.array(termSchema), categoryPages: z.number().int().positive(), tagPages: z.number().int().positive() }).strict(),
}).strict()

const issueSchema = z.object({ code: z.string(), message: z.string(), detail: z.string().optional() }).strict()
const candidateSchema = z.object({ id: z.number().int().positive(), slug: z.string(), name: z.string() }).strict()
const resolutionItemSchema = z.object({ localKey: z.string(), localName: z.string(), termId: z.number().int().positive().optional(), termSlug: z.string().optional(), termName: z.string().optional(), candidates: z.array(candidateSchema).optional() }).strict()
const resolutionGroupSchema = z.object({ resolved: z.array(resolutionItemSchema), missing: z.array(resolutionItemSchema), ambiguous: z.array(resolutionItemSchema), stale: z.array(resolutionItemSchema) }).strict()

export const publicationPlanSchema = z.object({
  schemaVersion: z.literal(1), ok: z.literal(true), mode: z.literal('dry-run'), writePerformed: z.literal(false), checkedAt: z.string(),
  source: z.object({ contentId: z.string().uuid(), contentType: z.enum(['news', 'ai', 'info_db', 'chinese']), categoryId: z.string(), updatedAt: z.string(), seriesId: z.number().int().positive().nullable() }).strict(),
  site: z.object({ origin: z.string().url() }).strict(),
  taxonomy: z.object({ categories: resolutionGroupSchema, tags: resolutionGroupSchema }).strict(),
  duplicate: z.object({ conflict: z.boolean(), matches: z.array(z.object({ id: z.number().int().positive(), slug: z.string(), status: z.string(), modifiedGmt: z.string().nullable(), link: z.string().nullable() }).strict()) }).strict(),
  payload: z.object({ title: z.string(), content: z.string(), status: z.literal('draft'), slug: z.string(), excerpt: z.string(), categories: z.array(z.number().int().positive()), tags: z.array(z.number().int().positive()) }).strict(),
  payloadFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  payloadSize: z.object({ titleBytes: z.number().int().nonnegative(), contentBytes: z.number().int().nonnegative(), excerptBytes: z.number().int().nonnegative(), canonicalPayloadBytes: z.number().int().nonnegative() }).strict(),
  readyForDraftCreation: z.boolean(), blockers: z.array(issueSchema), warnings: z.array(issueSchema),
}).strict()

export const publicationErrorSchema = z.object({ schemaVersion: z.literal(1), ok: z.literal(false), error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).strict() }).strict()

export type TaxonomyCatalogResponse = z.infer<typeof taxonomyCatalogResponseSchema>
export type PublicationPlan = z.infer<typeof publicationPlanSchema>
