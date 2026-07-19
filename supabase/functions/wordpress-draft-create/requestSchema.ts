import { DraftError } from './errors.ts'

const MAX_REQUEST_BYTES = 4_096
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/

export interface DraftCreateRequest {
  action: 'create-draft'
  contentId: string
  expectedSourceUpdatedAt: string
  expectedPayloadFingerprint: string
  idempotencyKey: string
  confirmation: { confirmed: true; scope: 'single-wordpress-draft' }
}

export async function parseDraftCreateRequest(request: Request): Promise<DraftCreateRequest> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new DraftError('INVALID_REQUEST', 400)
  }
  const length = request.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > MAX_REQUEST_BYTES) throw new DraftError('INVALID_REQUEST', 400)
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new DraftError('INVALID_REQUEST', 400)
  let body: unknown
  try { body = JSON.parse(text) } catch { throw new DraftError('INVALID_REQUEST', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DraftError('INVALID_REQUEST', 400)
  const record = body as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join(',') !== 'action,confirmation,contentId,expectedPayloadFingerprint,expectedSourceUpdatedAt,idempotencyKey') {
    throw new DraftError('INVALID_REQUEST', 400)
  }
  const confirmation = record.confirmation
  if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)) throw new DraftError('CONFIRMATION_REQUIRED', 400)
  const confirmationRecord = confirmation as Record<string, unknown>
  if (Object.keys(confirmationRecord).sort().join(',') !== 'confirmed,scope'
    || confirmationRecord.confirmed !== true || confirmationRecord.scope !== 'single-wordpress-draft') {
    throw new DraftError('CONFIRMATION_REQUIRED', 400)
  }
  if (record.action !== 'create-draft'
    || typeof record.contentId !== 'string' || !uuidPattern.test(record.contentId)
    || typeof record.expectedSourceUpdatedAt !== 'string' || !timestampPattern.test(record.expectedSourceUpdatedAt)
    || Number.isNaN(Date.parse(record.expectedSourceUpdatedAt))
    || typeof record.expectedPayloadFingerprint !== 'string' || !fingerprintPattern.test(record.expectedPayloadFingerprint)
    || typeof record.idempotencyKey !== 'string' || !uuidPattern.test(record.idempotencyKey)) {
    throw new DraftError('INVALID_REQUEST', 400)
  }
  return {
    action: 'create-draft', contentId: record.contentId,
    expectedSourceUpdatedAt: record.expectedSourceUpdatedAt,
    expectedPayloadFingerprint: record.expectedPayloadFingerprint,
    idempotencyKey: record.idempotencyKey,
    confirmation: { confirmed: true, scope: 'single-wordpress-draft' },
  }
}
