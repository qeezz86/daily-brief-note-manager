import { describe, expect, it } from 'vitest'
import { validNewsTracking } from './imports.fixtures'
import { validateImportTrackingGraph } from './validateImportTrackingGraph'

describe('validateImportTrackingGraph', () => {
  it('accepts a valid graph', () => expect(validateImportTrackingGraph(validNewsTracking())).toEqual([]))

  it('rejects duplicate update keys and item orders', () => {
    const tracking = validNewsTracking()
    tracking.updates.push({ ...tracking.updates[0], sourceOrders: [2] })
    expect(validateImportTrackingGraph(tracking).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'IMPORT_TRACKING_DUPLICATE_UPDATE_KEY', 'IMPORT_TRACKING_INVALID_ITEM_ORDER',
    ]))
  })

  it('rejects missing, self, and cyclic previous references', () => {
    const missing = validNewsTracking()
    missing.updates[0] = { ...missing.updates[0], updateType: 'follow_up', changeSummary: 'change', previousUpdateExternalKey: 'missing-update' }
    expect(validateImportTrackingGraph(missing).some((issue) => issue.code === 'IMPORT_TRACKING_MISSING_PREVIOUS')).toBe(true)

    const self = validNewsTracking()
    self.updates[0] = { ...self.updates[0], updateType: 'follow_up', changeSummary: 'change', previousUpdateExternalKey: self.updates[0].updateExternalKey }
    expect(validateImportTrackingGraph(self).some((issue) => issue.code === 'IMPORT_TRACKING_PREVIOUS_CYCLE')).toBe(true)

    const cycle = validNewsTracking()
    cycle.updates = [
      { ...cycle.updates[0], updateExternalKey: 'update-a', updateType: 'follow_up', changeSummary: 'a', previousUpdateExternalKey: 'update-b', itemOrder: 1, sourceOrders: [1] },
      { ...cycle.updates[0], updateExternalKey: 'update-b', updateType: 'follow_up', changeSummary: 'b', previousUpdateExternalKey: 'update-a', itemOrder: 2, sourceOrders: [2] },
    ]
    expect(validateImportTrackingGraph(cycle).some((issue) => issue.code === 'IMPORT_TRACKING_PREVIOUS_CYCLE')).toBe(true)
  })

  it('rejects cross-topic previous and repeated source use', () => {
    const tracking = validNewsTracking()
    tracking.topics.push({ ...tracking.topics[0], topicExternalKey: 'second-topic-ref', topicKey: 'second-topic' })
    tracking.updates.push({ ...tracking.updates[0], updateExternalKey: 'second-update', topicExternalKey: 'second-topic-ref', updateType: 'follow_up', changeSummary: 'change', previousUpdateExternalKey: tracking.updates[0].updateExternalKey, itemOrder: 2 })
    const codes = validateImportTrackingGraph(tracking).map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining(['IMPORT_TRACKING_TOPIC_CONFLICT', 'IMPORT_TRACKING_SOURCE_CONFLICT']))
  })

  it('rejects pending followups for a closed topic', () => {
    const tracking = validNewsTracking()
    tracking.topics[0] = { ...tracking.topics[0], status: 'closed', closedReason: 'finished' }
    tracking.followups = [{ followupExternalKey: 'followup-one', topicExternalKey: tracking.topics[0].topicExternalKey, checkText: 'check', priority: 'normal', dueDate: null, status: 'pending', resolutionNote: null, resolvedAt: null }]
    expect(validateImportTrackingGraph(tracking).some((issue) => issue.code === 'IMPORT_TRACKING_INVALID_FOLLOWUP')).toBe(true)
  })
})
