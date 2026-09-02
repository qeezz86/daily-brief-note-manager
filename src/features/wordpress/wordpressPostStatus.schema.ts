export const wordpressPostStatusValues = ['draft', 'pending', 'private', 'publish', 'future', 'trash'] as const
export type WordPressPostStatusValue = (typeof wordpressPostStatusValues)[number]

const reconciliationPrimaries = ['IN_SYNC', 'REMOTE_NOT_FOUND', 'REMOTE_ACCESS_DENIED', 'REMOTE_IDENTITY_MISMATCH', 'REMOTE_RESPONSE_UNCERTAIN', 'MANUAL_RECONCILIATION_REQUIRED'] as const
const reconciliationDeltas = ['STATUS_CHANGED', 'SLUG_CHANGED', 'LINK_CHANGED'] as const

type ReconciliationPrimary = (typeof reconciliationPrimaries)[number]
type ReconciliationDelta = (typeof reconciliationDeltas)[number]

interface WordPressPostStatusStored {
  wordpressPostId: number
  status: WordPressPostStatusValue
  slug: string
  link: string
}

interface WordPressPostStatusRemote extends WordPressPostStatusStored {
  modifiedGmt: string
  dateGmt: string | null
}

export interface WordPressPostStatusSuccess {
  schemaVersion: 1
  ok: true
  checkedAt: string
  source: { contentId: string; attemptId: string }
  stored: WordPressPostStatusStored
  wordpress: WordPressPostStatusRemote | null
  reconciliation: { primary: ReconciliationPrimary; deltas: ReconciliationDelta[] }
}

export interface WordPressPostStatusErrorPayload {
  schemaVersion: 1
  ok: false
  error: { code: string; message: string; retryable: boolean }
}

export interface WordPressPostStatusInput { contentId: string; attemptId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value))
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function isKnownStatus(value: unknown): value is WordPressPostStatusValue {
  return typeof value === 'string' && wordpressPostStatusValues.some((status) => status === value)
}

function isReconciliationPrimary(value: string): value is ReconciliationPrimary {
  return reconciliationPrimaries.some((known) => known === value)
}

function parseStored(value: unknown): WordPressPostStatusStored | null {
  if (!isRecord(value) || !hasExactKeys(value, ['wordpressPostId', 'status', 'slug', 'link'])) return null
  if (!Number.isInteger(value.wordpressPostId) || (value.wordpressPostId as number) <= 0 || !isKnownStatus(value.status) || typeof value.slug !== 'string' || value.slug.length < 1 || value.slug.length > 200 || !isSafeHttpsUrl(value.link)) return null
  return { wordpressPostId: value.wordpressPostId as number, status: value.status, slug: value.slug, link: value.link }
}

function parseRemote(value: unknown): WordPressPostStatusRemote | null {
  if (!isRecord(value) || !hasExactKeys(value, ['wordpressPostId', 'status', 'slug', 'link', 'modifiedGmt', 'dateGmt'])) return null
  const stored = parseStored({ wordpressPostId: value.wordpressPostId, status: value.status, slug: value.slug, link: value.link })
  if (!stored || typeof value.modifiedGmt !== 'string' || (value.dateGmt !== null && typeof value.dateGmt !== 'string')) return null
  return { ...stored, modifiedGmt: value.modifiedGmt, dateGmt: value.dateGmt }
}

export function parseWordPressPostStatusSuccess(value: unknown): WordPressPostStatusSuccess | null {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'ok', 'checkedAt', 'source', 'stored', 'wordpress', 'reconciliation'])) return null
  if (value.schemaVersion !== 1 || value.ok !== true || !isDateTime(value.checkedAt) || !isRecord(value.source) || !hasExactKeys(value.source, ['contentId', 'attemptId']) || !isUuid(value.source.contentId) || !isUuid(value.source.attemptId)) return null
  const stored = parseStored(value.stored)
  const wordpress = value.wordpress === null ? null : parseRemote(value.wordpress)
  const reconciliation = value.reconciliation
  if (!stored || (value.wordpress !== null && !wordpress) || !isRecord(reconciliation) || !hasExactKeys(reconciliation, ['primary', 'deltas'])) return null
  const { primary, deltas } = reconciliation
  if (typeof primary !== 'string' || !isReconciliationPrimary(primary) || !Array.isArray(deltas) || !deltas.every((delta): delta is ReconciliationDelta => typeof delta === 'string' && reconciliationDeltas.some((known) => known === delta))) return null
  return { schemaVersion: 1, ok: true, checkedAt: value.checkedAt, source: { contentId: value.source.contentId, attemptId: value.source.attemptId }, stored, wordpress, reconciliation: { primary, deltas } }
}

export function parseWordPressPostStatusError(value: unknown): WordPressPostStatusErrorPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'ok', 'error']) || value.schemaVersion !== 1 || value.ok !== false || !isRecord(value.error) || !hasExactKeys(value.error, ['code', 'message', 'retryable']) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string' || typeof value.error.retryable !== 'boolean') return null
  return { schemaVersion: 1, ok: false, error: { code: value.error.code, message: value.error.message, retryable: value.error.retryable } }
}
