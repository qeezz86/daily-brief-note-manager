import { z } from 'zod'
import type { NewsBriefingPromptContext } from './briefingPrompts.types'

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
