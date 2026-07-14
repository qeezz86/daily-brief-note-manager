import { importNewsTrackingSchema } from './importTracking.schema'
import type { ImportNewsTrackingPayload } from './importTracking.types'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function getImportNewsTracking(value: unknown) {
  const item = record(value)
  if (!item || item.newsTracking == null) return null
  return importNewsTrackingSchema.parse(item.newsTracking)
}

export function mapImportTrackingPayload(value: unknown): ImportNewsTrackingPayload {
  const tracking = importNewsTrackingSchema.parse(value)
  return {
    topics: tracking.topics.map((topic) => ({
      topic_external_key: topic.topicExternalKey,
      topic_key: topic.topicKey,
      canonical_title: topic.canonicalTitle,
      topic_summary: topic.topicSummary,
      status: topic.status,
      closed_reason: topic.closedReason,
      first_seen_at: topic.firstSeenAt,
      last_seen_at: topic.lastSeenAt,
    })),
    updates: tracking.updates.map((update) => ({
      update_external_key: update.updateExternalKey,
      topic_external_key: update.topicExternalKey,
      update_type: update.updateType,
      headline: update.headline,
      fact_summary: update.factSummary,
      importance_summary: update.importanceSummary,
      impact_summary: update.impactSummary,
      change_summary: update.changeSummary,
      previous_update_external_key: update.previousUpdateExternalKey,
      item_order: update.itemOrder,
      source_orders: update.sourceOrders,
    })),
    followups: tracking.followups.map((followup) => ({
      followup_external_key: followup.followupExternalKey,
      topic_external_key: followup.topicExternalKey,
      check_text: followup.checkText,
      priority: followup.priority,
      due_date: followup.dueDate,
      status: followup.status,
      resolution_note: followup.resolutionNote,
      resolved_at: followup.resolvedAt,
    })),
  }
}
