import { z } from 'zod'
import type {
  BriefingPromptRun,
  NewsBriefingPromptContext,
  SaveBriefingPromptRunInput,
} from './briefingPrompts.types'
import { PROMPT_TEMPLATE_VERSION } from './categoryPromptRules'

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestamp = z.string().datetime({ offset: true })
const nullableText = z.string().nullable().catch(null)
const safeArray = <T extends z.ZodTypeAny>(item: T) => z.preprocess(
  (value) => Array.isArray(value) ? value : [],
  z.array(item),
)

const updateSchema = z.object({
  id: z.string().uuid(), itemOrder: z.number().int().positive(),
  updateType: z.enum(['new', 'follow_up', 'correction', 'closure_note']),
  headline: z.string(), factSummary: z.string(), importanceSummary: nullableText,
  impactSummary: nullableText, changeSummary: nullableText, topicId: z.string().uuid(),
  topicKey: z.string(), topicTitle: z.string(), previousUpdateId: z.string().uuid().nullable().catch(null),
})

const latestUpdateSchema = z.object({
  id: z.string().uuid(), headline: z.string(),
  updateType: z.enum(['new', 'follow_up', 'correction', 'closure_note']),
  factSummary: z.string(), changeSummary: nullableText,
  publishedOn: dateOnly.nullable().catch(null),
})

const contextSchema = z.object({
  schemaVersion: z.literal(1),
  promptTemplateVersion: z.number().int().positive().optional(),
  referenceDate: dateOnly,
  category: z.object({
    id: z.string(), name: z.string(), code: z.string(), wrapperClass: z.string(),
    displayIdPattern: nullableText, slugPattern: z.string(),
  }),
  recentPosts: safeArray(z.object({
    id: z.string().uuid(), publishedOn: dateOnly, displayId: nullableText,
    title: z.string(), summary: z.string(), updates: safeArray(updateSchema),
  })),
  openTopics: safeArray(z.object({
    id: z.string().uuid(), topicKey: z.string(), canonicalTitle: z.string(),
    topicSummary: nullableText, status: z.enum(['active', 'monitoring', 'reopened']),
    firstSeenAt: timestamp, lastSeenAt: timestamp, lastClosedReason: nullableText,
    latestUpdate: latestUpdateSchema.nullable().catch(null),
  })),
  pendingFollowups: safeArray(z.object({
    id: z.string().uuid(), checkText: z.string(), priority: z.enum(['high', 'normal', 'low']),
    dueDate: dateOnly.nullable().catch(null), overdue: z.boolean(), topicId: z.string().uuid(),
    topicKey: z.string(), topicTitle: z.string(),
  })),
  recentClosedTopics: safeArray(z.object({
    id: z.string().uuid(), topicKey: z.string(), canonicalTitle: z.string(),
    topicSummary: nullableText, closedReason: nullableText, closedAt: timestamp,
    closureNote: z.object({ headline: z.string(), factSummary: z.string(), changeSummary: nullableText }).nullable().catch(null),
  })),
  counts: z.object({
    recentPosts: z.number().int().nonnegative(), recentUpdates: z.number().int().nonnegative(),
    openTopics: z.number().int().nonnegative(), pendingFollowups: z.number().int().nonnegative(),
    overdueFollowups: z.number().int().nonnegative(), recentClosedTopics: z.number().int().nonnegative(),
  }),
})

const promptRunRowSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().min(1),
  reference_date: dateOnly,
  prompt_mode: z.enum(['simple', 'standard', 'detailed']),
  closed_lookback_days: z.number().int().min(1).max(180),
  context_schema_version: z.literal(1),
  context_snapshot: z.unknown(),
  prompt_text: z.string().refine((value) => value.trim().length > 0),
  is_pinned: z.boolean(),
  generated_at: timestamp,
  requested_post_count: z.number().int().positive(),
  actual_post_count: z.number().int().nonnegative(),
})

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

export function parseNewsBriefingPromptContext(value: unknown): NewsBriefingPromptContext {
  const parsed = contextSchema.parse(value)
  const recentPosts = uniqueById(parsed.recentPosts)
    .map((post) => ({ ...post, updates: uniqueById(post.updates).sort((a, b) => a.itemOrder - b.itemOrder || a.id.localeCompare(b.id)) }))
  const openOrder = { reopened: 0, active: 1, monitoring: 2 }
  const openTopics = uniqueById(parsed.openTopics).sort((a, b) =>
    openOrder[a.status] - openOrder[b.status] || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.topicKey.localeCompare(b.topicKey))
  const priorityOrder = { high: 0, normal: 1, low: 2 }
  const pendingFollowups = uniqueById(parsed.pendingFollowups).sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || priorityOrder[a.priority] - priorityOrder[b.priority] ||
    (a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate)))
  const recentClosedTopics = uniqueById(parsed.recentClosedTopics).sort((a, b) => b.closedAt.localeCompare(a.closedAt) || a.id.localeCompare(b.id))
  const counts = {
    recentPosts: recentPosts.length,
    recentUpdates: recentPosts.reduce((sum, post) => sum + post.updates.length, 0),
    openTopics: openTopics.length,
    pendingFollowups: pendingFollowups.length,
    overdueFollowups: pendingFollowups.filter((item) => item.overdue).length,
    recentClosedTopics: recentClosedTopics.length,
  }
  return { ...parsed, recentPosts, openTopics, pendingFollowups, recentClosedTopics, counts }
}

export function parseBriefingPromptRun(value: unknown): BriefingPromptRun {
  const row = promptRunRowSchema.parse(value)
  const contextSnapshot = parseNewsBriefingPromptContext(row.context_snapshot)
  if (
    contextSnapshot.category.id !== row.category_id
    || contextSnapshot.referenceDate !== row.reference_date
    || contextSnapshot.schemaVersion !== row.context_schema_version
  ) {
    throw new Error('저장된 프롬프트 snapshot 설정이 일치하지 않습니다.')
  }
  return {
    id: row.id,
    categoryId: row.category_id,
    referenceDate: row.reference_date,
    promptMode: row.prompt_mode,
    closedLookbackDays: row.closed_lookback_days,
    contextSchemaVersion: row.context_schema_version,
    promptTemplateVersion: contextSnapshot.promptTemplateVersion ?? null,
    contextSnapshot,
    promptText: row.prompt_text,
    isPinned: row.is_pinned,
    generatedAt: row.generated_at,
    requestedPostCount: row.requested_post_count,
    actualPostCount: row.actual_post_count,
  }
}

export function validateSaveBriefingPromptRunInput(
  input: SaveBriefingPromptRunInput,
): SaveBriefingPromptRunInput {
  const context = parseNewsBriefingPromptContext(input.context)
  const promptText = z.string().refine((value) => value.trim().length > 0).parse(input.promptText)
  if (
    context.category.id !== input.settings.categoryId
    || context.referenceDate !== input.settings.referenceDate
    || context.schemaVersion !== 1
    || context.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION
    || !Number.isInteger(input.settings.closedLookbackDays)
    || input.settings.closedLookbackDays < 1
    || input.settings.closedLookbackDays > 180
  ) {
    throw new Error('현재 설정과 프롬프트 snapshot이 일치하지 않습니다.')
  }
  return { ...input, context, promptText }
}
