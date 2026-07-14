import { describe, expect, it } from 'vitest'
import { validNewsTracking } from './imports.fixtures'
import { mapImportTrackingPayload } from './mapImportTrackingPayload'

describe('mapImportTrackingPayload', () => {
  it('maps stable external references and 1-based source orders', () => {
    const payload = mapImportTrackingPayload(validNewsTracking())
    expect(payload.topics[0]).toMatchObject({ topic_external_key: 'economy-core-topic', topic_key: 'economy-core' })
    expect(payload.updates[0]).toMatchObject({ update_external_key: 'economy-core-update', previous_update_external_key: null, source_orders: [1] })
  })

  it('does not emit owner or internal UUID fields', () => {
    const serialized = JSON.stringify(mapImportTrackingPayload(validNewsTracking()))
    expect(serialized).not.toMatch(/owner|topic_id|update_id|source_id|followup_id/)
  })
})
