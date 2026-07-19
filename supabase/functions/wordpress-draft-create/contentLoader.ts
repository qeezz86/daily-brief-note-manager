import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'

import { createCallerDatabase } from '../wordpress-publication-preview/contentLoader.ts'
import type { PublicationAttempt, AttemptDatabase } from './schemas.ts'

type AttemptRow = {
  id: string; owner_id: string; content_id: string; site_origin: string; idempotency_key: string
  expected_source_updated_at: string; expected_payload_fingerprint: string; actual_payload_fingerprint: string | null
  status: PublicationAttempt['status']; wordpress_post_id: number | null; wordpress_post_status: string | null
  wordpress_post_slug: string | null; wordpress_post_link: string | null; error_code: string | null
  error_retryable: boolean | null; started_at: string | null; completed_at: string | null
}

export class AttemptDatabaseError extends Error {
  constructor(readonly databaseCode: string | null) { super('attempt database operation failed'); this.name = 'AttemptDatabaseError' }
}

function failure(error: { code?: string } | null): never {
  throw new AttemptDatabaseError(error?.code ?? null)
}

function mapAttempt(row: AttemptRow): PublicationAttempt {
  return {
    id: row.id, ownerId: row.owner_id, contentId: row.content_id, siteOrigin: row.site_origin,
    idempotencyKey: row.idempotency_key, expectedSourceUpdatedAt: row.expected_source_updated_at,
    expectedPayloadFingerprint: row.expected_payload_fingerprint, actualPayloadFingerprint: row.actual_payload_fingerprint,
    status: row.status, wordpressPostId: row.wordpress_post_id === null ? null : Number(row.wordpress_post_id),
    wordpressPostStatus: row.wordpress_post_status, wordpressPostSlug: row.wordpress_post_slug,
    wordpressPostLink: row.wordpress_post_link, errorCode: row.error_code, errorRetryable: row.error_retryable,
    startedAt: row.started_at, completedAt: row.completed_at,
  }
}

const fields = 'id,owner_id,content_id,site_origin,idempotency_key,expected_source_updated_at,expected_payload_fingerprint,actual_payload_fingerprint,status,wordpress_post_id,wordpress_post_status,wordpress_post_slug,wordpress_post_link,error_code,error_retryable,started_at,completed_at'

export function createDraftAttemptDatabase(client: SupabaseClient, transitionClient: SupabaseClient, ownerId: string): AttemptDatabase {
  const source = createCallerDatabase(client)
  return {
    ...source,
    async findByIdempotency(siteOrigin, idempotencyKey) {
      const result = await client.from('wordpress_publication_attempts').select(fields)
        .eq('site_origin', siteOrigin).eq('idempotency_key', idempotencyKey).maybeSingle()
      if (result.error) failure(result.error)
      return result.data ? mapAttempt(result.data as unknown as AttemptRow) : null
    },
    async findContentGuard(contentId, siteOrigin) {
      const result = await client.from('wordpress_publication_attempts').select(fields)
        .eq('content_id', contentId).eq('site_origin', siteOrigin)
        .in('status', ['executing', 'succeeded', 'uncertain']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (result.error) failure(result.error)
      return result.data ? mapAttempt(result.data as unknown as AttemptRow) : null
    },
    async insertReceived(input) {
      const result = await client.from('wordpress_publication_attempts').insert({
        owner_id: input.ownerId, content_id: input.contentId, site_origin: input.siteOrigin,
        operation: 'create_draft', idempotency_key: input.idempotencyKey,
        expected_source_updated_at: input.expectedSourceUpdatedAt,
        expected_payload_fingerprint: input.expectedPayloadFingerprint, status: 'received',
      }).select(fields).single()
      if (result.error || !result.data) failure(result.error)
      return mapAttempt(result.data as unknown as AttemptRow)
    },
    async transition(input) {
      const result = await transitionClient.rpc('transition_wordpress_publication_attempt_service', {
        p_owner_id: ownerId, p_attempt_id: input.attemptId, p_expected_status: input.expectedStatus, p_new_status: input.newStatus,
        p_actual_payload_fingerprint: input.actualPayloadFingerprint ?? null,
        p_wordpress_post_id: input.wordpressPostId ?? null,
        p_wordpress_post_status: input.wordpressPostStatus ?? null,
        p_wordpress_post_slug: input.wordpressPostSlug ?? null,
        p_wordpress_post_link: input.wordpressPostLink ?? null,
        p_error_code: input.errorCode ?? null, p_error_retryable: input.errorRetryable ?? null,
      })
      if (result.error || !result.data) failure(result.error)
      return mapAttempt(result.data as unknown as AttemptRow)
    },
  }
}
