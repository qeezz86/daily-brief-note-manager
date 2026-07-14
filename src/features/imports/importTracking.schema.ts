import { z } from 'zod'

const externalKey = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nullableText = z.string().trim().min(1).nullable().optional().default(null)

export const importTrackingTopicSchema = z.object({
  topicExternalKey: externalKey,
  topicKey: externalKey,
  canonicalTitle: z.string().trim().min(1).max(200),
  topicSummary: nullableText,
  status: z.enum(['active', 'monitoring', 'closed', 'reopened']),
  closedReason: nullableText,
  firstSeenAt: dateOnly,
  lastSeenAt: dateOnly,
}).strict().superRefine((topic, context) => {
  if (topic.lastSeenAt < topic.firstSeenAt) context.addIssue({ code: 'custom', path: ['lastSeenAt'], message: 'lastSeenAt은 firstSeenAt보다 빠를 수 없습니다.' })
  if (topic.status === 'closed' && !topic.closedReason) context.addIssue({ code: 'custom', path: ['closedReason'], message: 'closed 주제에는 closedReason이 필요합니다.' })
  if (topic.status !== 'closed' && topic.closedReason) context.addIssue({ code: 'custom', path: ['closedReason'], message: 'closed가 아닌 주제에는 closedReason을 입력할 수 없습니다.' })
})

export const importTrackingUpdateSchema = z.object({
  updateExternalKey: externalKey,
  topicExternalKey: externalKey,
  updateType: z.enum(['new', 'follow_up', 'correction', 'closure_note']),
  headline: z.string().trim().min(1).max(200),
  factSummary: z.string().trim().min(1).max(4000),
  importanceSummary: nullableText,
  impactSummary: nullableText,
  changeSummary: nullableText,
  previousUpdateExternalKey: externalKey.nullable().optional().default(null),
  itemOrder: z.number().int().positive(),
  sourceOrders: z.array(z.number().int().positive()).min(1),
}).strict().superRefine((update, context) => {
  if (update.updateType === 'new' && update.previousUpdateExternalKey) context.addIssue({ code: 'custom', path: ['previousUpdateExternalKey'], message: 'new update에는 previous update가 없어야 합니다.' })
  if (update.updateType !== 'new' && !update.previousUpdateExternalKey) context.addIssue({ code: 'custom', path: ['previousUpdateExternalKey'], message: '후속·정정·종료 update에는 previous update가 필요합니다.' })
  if (update.updateType !== 'new' && !update.changeSummary) context.addIssue({ code: 'custom', path: ['changeSummary'], message: '후속·정정·종료 update에는 changeSummary가 필요합니다.' })
  if (new Set(update.sourceOrders).size !== update.sourceOrders.length) context.addIssue({ code: 'custom', path: ['sourceOrders'], message: '한 update에서 sourceOrder를 중복 사용할 수 없습니다.' })
})

export const importTrackingFollowupSchema = z.object({
  followupExternalKey: externalKey,
  topicExternalKey: externalKey,
  checkText: z.string().trim().min(1).max(1000),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  dueDate: dateOnly.nullable().optional().default(null),
  status: z.enum(['pending', 'done', 'cancelled']).default('pending'),
  resolutionNote: nullableText,
  resolvedAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
}).strict().superRefine((followup, context) => {
  if (followup.status === 'pending' && (followup.resolutionNote || followup.resolvedAt)) context.addIssue({ code: 'custom', path: ['status'], message: 'pending followup에는 처리 메모나 처리 시각을 입력할 수 없습니다.' })
  if (followup.status !== 'pending' && (!followup.resolutionNote || !followup.resolvedAt)) context.addIssue({ code: 'custom', path: ['resolutionNote'], message: '처리된 followup에는 resolutionNote와 resolvedAt이 필요합니다.' })
})

export const importNewsTrackingSchema = z.object({
  topics: z.array(importTrackingTopicSchema).min(1),
  updates: z.array(importTrackingUpdateSchema).min(1),
  followups: z.array(importTrackingFollowupSchema).default([]),
}).strict()

export type ParsedImportNewsTracking = z.infer<typeof importNewsTrackingSchema>
