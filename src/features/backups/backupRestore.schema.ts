import { z } from 'zod'

const id = z.string().uuid()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const datetime = z.string().datetime({ offset: true })
const nullableString = z.string().nullable()
const nullableDate = date.nullable()
const nullableDatetime = datetime.nullable()
const nonnegative = z.number().int().nonnegative()
const positive = z.number().int().positive()

export const backupCategoryRestoreSchema = z.object({
  id: z.string().min(1), contentGroup: z.enum(['news', 'ai', 'info_db', 'chinese']),
  name: z.string().min(1), code: z.string().min(1), wrapperClass: z.string().min(1),
  displayIdPattern: nullableString, slugPattern: z.string().min(1), sortOrder: nonnegative,
  enabled: z.boolean(), createdAt: datetime.optional(), updatedAt: datetime.optional(),
}).strict()

export const backupRestoreSectionSchemas = {
  posts: z.array(z.object({
    id, categoryId: z.string().min(1), seriesNo: positive.nullable(), briefingDate: nullableDate,
    publishedOn: nullableDate, displayId: nullableString, title: z.string(), summary: z.string(),
    htmlBody: nullableString, slug: z.string(), wordpressUrl: nullableString,
    contentStatus: z.enum(['draft', 'ready', 'published', 'archived']),
    publishedAt: nullableDatetime,
    sourceImportType: z.enum(['chatgpt_paste', 'wordpress_manual', 'manual_entry', 'json_import']),
    imagePrompt: nullableString, imageAlt: nullableString, imagePromptVersion: positive,
    imagePromptUpdatedAt: nullableDatetime, createdAt: datetime, updatedAt: datetime,
  }).strict()),
  seoData: z.array(z.object({
    postId: id, representativeTitle: nullableString, alternativeTitles: z.array(z.string()),
    metaDescription: z.string(), focusKeyword: nullableString, createdAt: datetime, updatedAt: datetime,
  }).strict()),
  tags: z.array(z.object({ id, name: z.string(), normalizedName: z.string(), createdAt: datetime }).strict()),
  postTags: z.array(z.object({ postId: id, tagId: id }).strict()),
  sources: z.array(z.object({
    id, postId: id, newsUpdateId: id.nullable(), sourceName: z.string(), sourceTitle: z.string(),
    sourceUrl: z.string(), sourcePublishedAt: nullableDatetime, checkedAt: nullableDatetime,
    checkedPoint: z.string(), sortOrder: nonnegative, createdAt: datetime, updatedAt: datetime,
  }).strict()),
  aiMetadata: z.array(z.object({ postId: id, fieldName: nullableString, difficulty: nullableString, estimatedReadMin: positive.nullable() }).strict()),
  infoDbMetadata: z.array(z.object({ postId: id, fieldName: nullableString, difficulty: nullableString, estimatedReadMin: positive.nullable(), referenceDate: nullableDate }).strict()),
  chineseMetadata: z.array(z.object({
    postId: id, learningTopic: nullableString, programName: nullableString, originalTitle: nullableString,
    originalUrl: nullableString, originalPublishedAt: nullableDatetime, episodeListIncluded: z.boolean().nullable(),
    verifiedCoreFact: nullableString, difficulty: nullableString, learningPoints: nullableString,
  }).strict()),
  seriesCounters: z.array(z.object({ categoryId: z.string().min(1), lastIssuedNo: nonnegative, updatedAt: datetime }).strict()),
  newsTopics: z.array(z.object({
    id, categoryId: z.string().min(1), topicKey: z.string(), canonicalTitle: z.string(), topicSummary: nullableString,
    status: z.enum(['active', 'monitoring', 'closed', 'reopened']), closedReason: nullableString,
    firstSeenAt: date, lastSeenAt: date, createdAt: datetime, updatedAt: datetime,
  }).strict()),
  newsStatusHistory: z.array(z.object({
    id, topicId: id, fromStatus: z.enum(['active', 'monitoring', 'closed', 'reopened']).nullable(),
    toStatus: z.enum(['active', 'monitoring', 'closed', 'reopened']), reason: nullableString, changedAt: datetime,
  }).strict()),
  newsUpdates: z.array(z.object({
    id, postId: id, topicId: id, itemOrder: positive,
    updateType: z.enum(['new', 'follow_up', 'correction', 'closure_note']), headline: z.string(),
    factSummary: z.string(), importanceSummary: nullableString, impactSummary: nullableString,
    changeSummary: nullableString, previousUpdateId: id.nullable(), createdAt: datetime, updatedAt: datetime,
  }).strict()),
  newsFollowups: z.array(z.object({
    id, topicId: id, checkText: z.string(), status: z.enum(['pending', 'done', 'cancelled']),
    dueDate: nullableDate, priority: z.enum(['high', 'normal', 'low']), resolutionNote: nullableString,
    resolvedAt: nullableDatetime, createdAt: datetime, updatedAt: datetime,
  }).strict()),
  generatedPrompts: z.array(z.object({
    id, categoryId: z.string().min(1), requestedPostCount: z.union([z.literal(5), z.literal(10), z.literal(15)]),
    actualPostCount: nonnegative, promptMode: z.enum(['simple', 'standard', 'detailed']), referenceDate: date,
    closedLookbackDays: positive, contextSchemaVersion: positive, contextSnapshot: z.unknown(),
    promptText: z.string(), isPinned: z.boolean(), generatedAt: datetime,
  }).strict()),
  importJobs: z.array(z.object({
    id, format: z.string(), schemaVersion: positive, sourceName: nullableString,
    sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/), status: z.string(), expectedItemCount: nonnegative,
    totalCount: nonnegative, readyCount: nonnegative, warningCount: nonnegative, invalidCount: nonnegative,
    duplicateCount: nonnegative, acknowledgedWarningCount: nonnegative, dryRunSummary: z.unknown(),
    startedAt: nullableDatetime, completedAt: nullableDatetime, cancelledAt: nullableDatetime,
    createdAt: datetime, updatedAt: datetime,
  }).strict()),
  importJobItems: z.array(z.object({
    id, jobId: id, itemIndex: nonnegative, externalKey: z.string(),
    payloadFingerprint: z.string().regex(/^[0-9a-f]{64}$/), title: z.string(), categoryId: z.string(),
    validationStatus: z.string(), normalizedPayload: z.unknown(), warningAcknowledged: z.boolean(),
    contentStatus: z.string(), trackingStatus: z.string(), postId: id.nullable(),
    contentAttemptCount: nonnegative, trackingAttemptCount: nonnegative,
    contentErrorCode: nullableString, contentErrorMessage: nullableString, contentRetryable: z.boolean(),
    trackingErrorCode: nullableString, trackingErrorMessage: nullableString, trackingRetryable: z.boolean(),
    topicCount: nonnegative.nullable(), reusedTopicCount: nonnegative.nullable(), createdTopicCount: nonnegative.nullable(),
    updateCount: nonnegative.nullable(), followupCount: nonnegative.nullable(), sourceLinkCount: nonnegative.nullable(),
    contentStartedAt: nullableDatetime, contentCompletedAt: nullableDatetime,
    trackingStartedAt: nullableDatetime, trackingCompletedAt: nullableDatetime,
    createdAt: datetime, updatedAt: datetime,
  }).strict()),
  importJobItemAttempts: z.array(z.object({
    id, jobItemId: id, stage: z.string(), attemptNo: positive, status: z.string(),
    safeErrorCode: nullableString, safeErrorMessage: nullableString, retryable: z.boolean(),
    startedAt: datetime, completedAt: nullableDatetime,
  }).strict()),
} as const

export type BackupRestoreSectionName = keyof typeof backupRestoreSectionSchemas

export const backupRestoreDataSchema = z.object({
  posts: backupRestoreSectionSchemas.posts,
  seoData: backupRestoreSectionSchemas.seoData,
  tags: backupRestoreSectionSchemas.tags,
  postTags: backupRestoreSectionSchemas.postTags,
  sources: backupRestoreSectionSchemas.sources,
  aiMetadata: backupRestoreSectionSchemas.aiMetadata,
  infoDbMetadata: backupRestoreSectionSchemas.infoDbMetadata,
  chineseMetadata: backupRestoreSectionSchemas.chineseMetadata,
  seriesCounters: backupRestoreSectionSchemas.seriesCounters,
  newsTopics: backupRestoreSectionSchemas.newsTopics,
  newsStatusHistory: backupRestoreSectionSchemas.newsStatusHistory,
  newsUpdates: backupRestoreSectionSchemas.newsUpdates,
  newsFollowups: backupRestoreSectionSchemas.newsFollowups,
  generatedPrompts: backupRestoreSectionSchemas.generatedPrompts,
  importJobs: backupRestoreSectionSchemas.importJobs.optional(),
  importJobItems: backupRestoreSectionSchemas.importJobItems.optional(),
  importJobItemAttempts: backupRestoreSectionSchemas.importJobItemAttempts.optional(),
}).strict()
export type ValidatedBackupData = z.infer<typeof backupRestoreDataSchema>
