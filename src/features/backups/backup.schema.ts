import { z } from 'zod'
import {
  BACKUP_CHECKSUM_ALGORITHM,
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
} from './backup.constants'

const profileSchema = z.enum(['core', 'full'])
const id = z.string().uuid()
const row = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough()

const categorySchema = row({
  id: z.string().min(1),
  contentGroup: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  wrapperClass: z.string().min(1),
  displayIdPattern: z.string().nullable(),
  slugPattern: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  enabled: z.boolean(),
})

const backupDataSchema = z.object({
  posts: z.array(row({ id, categoryId: z.string(), createdAt: z.string() })),
  seoData: z.array(row({ postId: id })),
  tags: z.array(row({ id, normalizedName: z.string() })),
  postTags: z.array(row({ postId: id, tagId: id })),
  sources: z.array(row({ id, postId: id, newsUpdateId: id.nullable(), sortOrder: z.number().int().nonnegative() })),
  aiMetadata: z.array(row({ postId: id })),
  infoDbMetadata: z.array(row({ postId: id })),
  chineseMetadata: z.array(row({ postId: id, episodeListIncluded: z.boolean().nullable() })),
  seriesCounters: z.array(row({ categoryId: z.string(), lastIssuedNo: z.number().int().nonnegative() })),
  newsTopics: z.array(row({ id, categoryId: z.string(), topicKey: z.string() })),
  newsStatusHistory: z.array(row({ id, topicId: id, changedAt: z.string() })),
  newsUpdates: z.array(row({ id, postId: id, topicId: id, previousUpdateId: id.nullable(), itemOrder: z.number().int().positive() })),
  newsFollowups: z.array(row({ id, topicId: id, createdAt: z.string() })),
  generatedPrompts: z.array(row({ id, categoryId: z.string(), contextSnapshot: z.unknown(), generatedAt: z.string() })),
  importJobs: z.array(row({ id, createdAt: z.string() })).optional(),
  importJobItems: z.array(row({ id, jobId: id, postId: id.nullable(), itemIndex: z.number().int().nonnegative(), normalizedPayload: z.unknown() })).optional(),
  importJobItemAttempts: z.array(row({ id, jobItemId: id, attemptNo: z.number().int().positive() })).optional(),
}).strict()

export const backupEstimateSchema = z.object({
  profile: profileSchema,
  sectionCounts: z.record(z.string(), z.number().int().nonnegative()),
  totalRecords: z.number().int().nonnegative(),
  categoryManifestCount: z.number().int().nonnegative(),
  includesOperationalHistory: z.boolean(),
  includesNormalizedPayload: z.boolean(),
}).strict()

export const backupSnapshotSchema = z.object({
  profile: profileSchema,
  snapshotSchemaVersion: z.literal(1),
  categoryManifest: z.array(categorySchema),
  sectionCounts: z.record(z.string(), z.number().int().nonnegative()),
  totalRecords: z.number().int().nonnegative(),
  includesOperationalHistory: z.boolean(),
  relationshipCheck: z.enum(['passed', 'failed']),
  data: backupDataSchema,
}).strict()

export const backupManifestSchema = z.object({
  profile: profileSchema,
  sectionNames: z.array(z.string()),
  sectionCounts: z.record(z.string(), z.number().int().nonnegative()),
  totalRecords: z.number().int().nonnegative(),
  generatedPromptCount: z.number().int().nonnegative(),
  includesOperationalHistory: z.boolean(),
  categoryManifestCount: z.number().int().nonnegative(),
  categoryManifest: z.array(categorySchema),
  relationshipCheck: z.literal('passed'),
  snapshotSchemaVersion: z.literal(1),
}).strict()

export const backupPayloadSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  profile: profileSchema,
  exportedAt: z.string().datetime({ offset: true }),
  appVersion: z.string().min(1).nullable(),
  manifest: backupManifestSchema,
  data: backupDataSchema,
}).strict()

export const backupBundleSchema = backupPayloadSchema.extend({
  checksum: z.object({
    algorithm: z.literal(BACKUP_CHECKSUM_ALGORITHM),
    value: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
}).strict()
