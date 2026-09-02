import type { RemoteSnapshot, StoredAttempt } from './schemas.ts'

export const reconciliationPrimaries = ['IN_SYNC', 'REMOTE_NOT_FOUND', 'REMOTE_ACCESS_DENIED', 'REMOTE_IDENTITY_MISMATCH', 'REMOTE_RESPONSE_UNCERTAIN', 'MANUAL_RECONCILIATION_REQUIRED'] as const
export type ReconciliationPrimary = typeof reconciliationPrimaries[number]
export type ReconciliationDelta = 'STATUS_CHANGED' | 'SLUG_CHANGED' | 'LINK_CHANGED'
export interface Reconciliation { primary: ReconciliationPrimary; deltas: ReconciliationDelta[] }
export function reconcile(attempt: StoredAttempt, remote: RemoteSnapshot): Reconciliation {
  if (attempt.wordpressPostId !== remote.wordpressPostId) return { primary: 'REMOTE_IDENTITY_MISMATCH', deltas: [] }
  const deltas: ReconciliationDelta[] = []
  if (attempt.status !== remote.status) deltas.push('STATUS_CHANGED')
  if (attempt.slug !== remote.slug) deltas.push('SLUG_CHANGED')
  if (attempt.link !== remote.link) deltas.push('LINK_CHANGED')
  return { primary: 'IN_SYNC', deltas }
}
