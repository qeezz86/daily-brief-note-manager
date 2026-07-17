import { z } from 'zod'

const pagedResourceFields = {
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  truncated: z.boolean(),
}

const categorySchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  slug: z.string(),
  parent: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
}).strict()

const tagSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  slug: z.string(),
  count: z.number().int().nonnegative(),
}).strict()

export const wordpressDiagnosticsSchema = z.object({
  schemaVersion: z.literal(1),
  checkedAt: z.string().datetime({ offset: true }),
  ok: z.literal(true),
  site: z.object({
    name: z.string(),
    origin: z.string().url(),
    restApiReachable: z.literal(true),
    wpV2Available: z.literal(true),
    applicationPasswordsAdvertised: z.boolean(),
  }).strict(),
  authentication: z.object({
    authenticated: z.literal(true),
    userId: z.number().int().nonnegative(),
    displayName: z.string(),
    roles: z.array(z.string()),
  }).strict(),
  capabilities: z.object({
    editPosts: z.boolean(),
    publishPosts: z.boolean(),
    uploadFiles: z.boolean(),
    manageCategories: z.boolean(),
    editOthersPosts: z.boolean(),
    deletePosts: z.boolean(),
  }).strict(),
  resources: z.object({
    postTypeAvailable: z.boolean(),
    postRestBase: z.string().nullable(),
    postTaxonomies: z.array(z.string()),
    statuses: z.array(z.string()),
    categories: z.object({ ...pagedResourceFields, items: z.array(categorySchema) }).strict().nullable(),
    tags: z.object({ ...pagedResourceFields, items: z.array(tagSchema) }).strict().nullable(),
    postsReadable: z.boolean(),
  }).strict(),
  readiness: z.object({
    connection: z.enum(['ready', 'partial', 'insufficient_permissions']),
    draftPublishing: z.enum(['capability-confirmed', 'capability-missing']),
    directPublishing: z.enum(['capability-confirmed', 'capability-missing']),
    mediaUpload: z.enum(['capability-confirmed', 'capability-missing']),
    taxonomyManagement: z.enum(['capability-confirmed', 'capability-missing']),
  }).strict(),
  warnings: z.array(z.string()),
}).strict()

export const wordpressDiagnosticsErrorSchema = z.object({
  schemaVersion: z.literal(1),
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }).strict(),
}).strict()
