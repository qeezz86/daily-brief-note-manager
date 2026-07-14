import { describe, expect, it } from 'vitest'
import { mapKnownTrackingImportError } from './mapImportTrackingError'

describe('mapKnownTrackingImportError', () => {
  it.each([
    'IMPORT_TRACKING_TOPIC_CONFLICT', 'IMPORT_TRACKING_MISSING_PREVIOUS', 'IMPORT_TRACKING_PREVIOUS_CYCLE',
    'IMPORT_TRACKING_SOURCE_NOT_FOUND', 'IMPORT_TRACKING_INVALID_FOLLOWUP',
  ])('maps %s without exposing raw details', (code) => {
    const mapped = mapKnownTrackingImportError({ code: '23514', message: code, details: 'secret_constraint' })
    expect(mapped.errorCode).toBe(code)
    expect(mapped.message).not.toContain('secret_constraint')
  })

  it('marks permission and connection failures as fatal', () => {
    expect(mapKnownTrackingImportError({ code: '42501', message: 'denied' }).stopExecution).toBe(true)
    expect(mapKnownTrackingImportError({ code: 'PGRST001', message: 'connection' }).stopExecution).toBe(true)
  })

  it('maps unknown failures safely', () => {
    expect(mapKnownTrackingImportError({ message: 'constraint private_name' })).toMatchObject({ errorCode: 'IMPORT_TRACKING_UNKNOWN' })
  })
})
