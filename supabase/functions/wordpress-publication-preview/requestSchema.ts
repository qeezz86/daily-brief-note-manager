import { PublicationError } from './errors.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PreviewRequest =
  | { action: 'get-taxonomy-catalog' }
  | { action: 'prepare-publication'; contentId: string }

export async function parsePreviewRequest(request: Request): Promise<PreviewRequest> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new PublicationError('INVALID_REQUEST', { httpStatus: 400 })
  }
  let body: unknown
  try { body = await request.json() } catch { throw new PublicationError('INVALID_REQUEST', { httpStatus: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PublicationError('INVALID_REQUEST', { httpStatus: 400 })
  const record = body as Record<string, unknown>
  if (record.action === 'get-taxonomy-catalog' && Object.keys(record).length === 1) return { action: record.action }
  if (record.action === 'prepare-publication' && Object.keys(record).length === 2 && typeof record.contentId === 'string' && uuidPattern.test(record.contentId)) {
    return { action: record.action, contentId: record.contentId }
  }
  throw new PublicationError('INVALID_REQUEST', { httpStatus: 400 })
}
