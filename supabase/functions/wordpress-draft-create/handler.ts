import { DiagnosticError } from '../wordpress-diagnostics/errors.ts'
import { parseAllowedOrigins, parseWordPressConfig } from '../wordpress-diagnostics/config.ts'
import { corsHeaders } from '../wordpress-diagnostics/cors.ts'
import { loadTaxonomyCatalog } from '../wordpress-publication-preview/taxonomyCatalog.ts'
import { preparePublicationPlan } from '../wordpress-publication-preview/publicationPlan.ts'
import { createPublicationWordPressClient } from '../wordpress-publication-preview/wordpressClient.ts'
import { PublicationError } from '../wordpress-publication-preview/errors.ts'
import { AttemptDatabaseError } from './contentLoader.ts'
import { DraftError, draftErrorCodes, safeDraftError, type DraftErrorCode } from './errors.ts'
import { parseDraftCreateRequest, type DraftCreateRequest } from './requestSchema.ts'
import type { AttemptDatabase, DraftWordPressClient, PublicationAttempt } from './schemas.ts'
import { createWordPressDraftClient } from './wordpressDraftClient.ts'

interface EnvironmentSource { get(name: string): string | undefined }
interface AuthenticatedCaller { id: string }
interface Dependencies {
  environment: EnvironmentSource
  verifyCaller(token: string): Promise<AuthenticatedCaller>
  createDatabase(token: string, callerId: string): AttemptDatabase
  fetchImpl?: typeof fetch
}

function json(body: unknown, status: number, headers?: Headers) {
  const output = new Headers(headers)
  output.set('Content-Type', 'application/json; charset=utf-8')
  output.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: output })
}

function bearer(request: Request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) throw new DraftError('CALLER_UNAUTHENTICATED', 401)
  return match[1]
}

function fingerprintMatches(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function isDraftCode(value: string | null): value is DraftErrorCode {
  return value !== null && (draftErrorCodes as readonly string[]).includes(value)
}

function success(attempt: PublicationAttempt, created: boolean) {
  if (!attempt.wordpressPostId || attempt.wordpressPostStatus !== 'draft' || !attempt.wordpressPostSlug || !attempt.wordpressPostLink) {
    throw new DraftError('AUDIT_RECORD_FAILED', 500, false, attempt.id)
  }
  return {
    schemaVersion: 1 as const, ok: true as const, operation: 'create-draft' as const,
    created, idempotentReplay: !created, attemptId: attempt.id,
    source: {
      contentId: attempt.contentId, sourceUpdatedAt: attempt.expectedSourceUpdatedAt,
      payloadFingerprint: attempt.actualPayloadFingerprint ?? attempt.expectedPayloadFingerprint,
    },
    wordpress: {
      postId: attempt.wordpressPostId, status: 'draft' as const,
      slug: attempt.wordpressPostSlug, link: attempt.wordpressPostLink,
    },
  }
}

function checkExisting(attempt: PublicationAttempt, request: DraftCreateRequest) {
  if (attempt.contentId !== request.contentId
    || attempt.expectedPayloadFingerprint !== request.expectedPayloadFingerprint
    || attempt.expectedSourceUpdatedAt !== request.expectedSourceUpdatedAt) {
    throw new DraftError('IDEMPOTENCY_KEY_REUSED', 409, false, attempt.id)
  }
  if (attempt.status === 'succeeded') return success(attempt, false)
  if (attempt.status === 'uncertain') throw new DraftError('MANUAL_RECONCILIATION_REQUIRED', 409, false, attempt.id)
  if (attempt.status === 'executing' || attempt.status === 'received' || attempt.status === 'validating') {
    throw new DraftError('REQUEST_IN_PROGRESS', 409, false, attempt.id)
  }
  const code = isDraftCode(attempt.errorCode) ? attempt.errorCode : 'IDEMPOTENCY_KEY_REUSED'
  throw new DraftError(code, 409, false, attempt.id)
}

function checkContentGuard(attempt: PublicationAttempt) {
  if (attempt.status === 'succeeded') throw new DraftError('EXISTING_DRAFT_RECORD', 409, false, attempt.id)
  if (attempt.status === 'uncertain') throw new DraftError('MANUAL_RECONCILIATION_REQUIRED', 409, false, attempt.id)
  throw new DraftError('REQUEST_IN_PROGRESS', 409, false, attempt.id)
}

async function block(database: AttemptDatabase, attemptId: string, code: DraftErrorCode, actualFingerprint?: string): Promise<never> {
  try {
    await database.transition({
      attemptId, expectedStatus: 'validating', newStatus: 'blocked', actualPayloadFingerprint: actualFingerprint,
      errorCode: code, errorRetryable: false,
    })
  } catch { throw new DraftError('AUDIT_RECORD_FAILED', 500, false, attemptId) }
  throw new DraftError(code, code === 'PUBLICATION_PLAN_BLOCKED' ? 422 : 409, false, attemptId)
}

async function recordWordPressFailure(database: AttemptDatabase, attemptId: string, fingerprint: string, error: DraftError): Promise<never> {
  const status = error.code === 'WORDPRESS_DRAFT_REJECTED' ? 'failed_safe' : 'uncertain'
  try {
    await database.transition({
      attemptId, expectedStatus: 'executing', newStatus: status, actualPayloadFingerprint: fingerprint,
      errorCode: error.code, errorRetryable: false,
    })
  } catch { throw new DraftError('AUDIT_RECORD_FAILED', 500, false, attemptId) }
  throw new DraftError(error.code, error.httpStatus, false, attemptId)
}

async function recordAuditFailureAfterWordPress(database: AttemptDatabase, attemptId: string, fingerprint: string): Promise<never> {
  try {
    await database.transition({
      attemptId, expectedStatus: 'executing', newStatus: 'uncertain', actualPayloadFingerprint: fingerprint,
      errorCode: 'AUDIT_RECORD_FAILED', errorRetryable: false,
    })
  } catch {
    // The first transition may have committed even if its response was lost, or
    // the database may be unavailable. The durable execution lock still blocks
    // another WordPress POST; manual reconciliation is the only safe response.
  }
  throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502, false, attemptId)
}

function mapDiagnostic(error: DiagnosticError): DraftError {
  if (error.code === 'ORIGIN_FORBIDDEN') return new DraftError('ORIGIN_FORBIDDEN', 403)
  return new DraftError('CONFIG_MISSING', 500)
}

export function createWordPressDraftHandler(dependencies: Dependencies) {
  return async function handler(request: Request): Promise<Response> {
    let headers: Headers | undefined
    try {
      try { headers = corsHeaders(request.headers.get('origin') ?? '', parseAllowedOrigins(dependencies.environment)) }
      catch (error) { if (error instanceof DiagnosticError) throw mapDiagnostic(error); throw error }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new DraftError('METHOD_NOT_ALLOWED', 405)

      const token = bearer(request)
      let caller: AuthenticatedCaller
      try { caller = await dependencies.verifyCaller(token) } catch { throw new DraftError('CALLER_UNAUTHENTICATED', 401) }
      let config
      try { config = parseWordPressConfig(dependencies.environment) }
      catch (error) { if (error instanceof DiagnosticError) throw mapDiagnostic(error); throw error }
      if (caller.id !== config.allowedUserId) throw new DraftError('CALLER_FORBIDDEN', 403)
      const parsed = await parseDraftCreateRequest(request)
      const database = dependencies.createDatabase(token, caller.id)

      const existing = await database.findByIdempotency(config.siteUrl.origin, parsed.idempotencyKey)
      if (existing) {
        const replay = checkExisting(existing, parsed)
        return json(replay, 200, headers)
      }
      const guard = await database.findContentGuard(parsed.contentId, config.siteUrl.origin)
      if (guard) checkContentGuard(guard)

      const source = await database.loadContent(parsed.contentId, config.siteUrl.origin)
      if (!source) throw new DraftError('CONTENT_NOT_FOUND', 404)

      let attempt: PublicationAttempt
      try {
        attempt = await database.insertReceived({
          ownerId: caller.id, contentId: parsed.contentId, siteOrigin: config.siteUrl.origin,
          idempotencyKey: parsed.idempotencyKey, expectedSourceUpdatedAt: parsed.expectedSourceUpdatedAt,
          expectedPayloadFingerprint: parsed.expectedPayloadFingerprint,
        })
      } catch (error) {
        if (error instanceof AttemptDatabaseError && error.databaseCode === '23505') {
          const raced = await database.findByIdempotency(config.siteUrl.origin, parsed.idempotencyKey)
          if (raced) {
            const replay = checkExisting(raced, parsed)
            return json(replay, 200, headers)
          }
        }
        throw new DraftError('AUDIT_RECORD_FAILED', 500)
      }
      try { attempt = await database.transition({ attemptId: attempt.id, expectedStatus: 'received', newStatus: 'validating' }) }
      catch { throw new DraftError('AUDIT_RECORD_FAILED', 500, false, attempt.id) }

      if (source.updatedAt !== parsed.expectedSourceUpdatedAt) await block(database, attempt.id, 'SOURCE_CHANGED')

      const draftClient: DraftWordPressClient = createWordPressDraftClient({
        baseUrl: config.siteUrl, username: config.username, applicationPassword: config.applicationPassword,
        fetchImpl: dependencies.fetchImpl,
      })
      let capable = false
      try { capable = await draftClient.verifyDraftCapability() } catch { await block(database, attempt.id, 'WORDPRESS_CAPABILITY_MISSING') }
      if (!capable) await block(database, attempt.id, 'WORDPRESS_CAPABILITY_MISSING')

      const readClient = createPublicationWordPressClient({
        baseUrl: config.siteUrl, username: config.username, applicationPassword: config.applicationPassword,
        fetchImpl: dependencies.fetchImpl,
      })
      const plan = await (async () => {
        try {
        const catalog = await loadTaxonomyCatalog(readClient)
        return await preparePublicationPlan({
          database, wordpress: readClient, catalog, siteOrigin: config.siteUrl.origin, contentId: parsed.contentId,
        })
        } catch (error) {
          void (error instanceof PublicationError)
          return await block(database, attempt.id, 'PUBLICATION_PLAN_BLOCKED')
        }
      })()
      if (!plan) return await block(database, attempt.id, 'PUBLICATION_PLAN_BLOCKED')
      if (plan.blockers.some((issue) => issue.code === 'WORDPRESS_DUPLICATE_SLUG' || issue.code === 'WORDPRESS_DUPLICATE_INCONSISTENT')) {
        await block(database, attempt.id, 'WORDPRESS_DUPLICATE_SLUG', plan.payloadFingerprint)
      }
      if (!fingerprintMatches(plan.payloadFingerprint, parsed.expectedPayloadFingerprint)) {
        await block(database, attempt.id, 'PAYLOAD_FINGERPRINT_MISMATCH', plan.payloadFingerprint)
      }
      if (!plan.readyForDraftCreation || plan.blockers.length) await block(database, attempt.id, 'PUBLICATION_PLAN_BLOCKED', plan.payloadFingerprint)

      try {
        attempt = await database.transition({
          attemptId: attempt.id, expectedStatus: 'validating', newStatus: 'executing',
          actualPayloadFingerprint: plan.payloadFingerprint,
        })
      } catch (error) {
        if (error instanceof AttemptDatabaseError && error.databaseCode === '23505') {
          await block(database, attempt.id, 'REQUEST_IN_PROGRESS', plan.payloadFingerprint)
        }
        throw new DraftError('AUDIT_RECORD_FAILED', 500, false, attempt.id)
      }

      const wordpressResult = await (async () => {
        try { return await draftClient.createDraft(plan.payload) }
        catch (error) {
          const safe = error instanceof DraftError ? error : new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
          return await recordWordPressFailure(database, attempt.id, plan.payloadFingerprint, safe)
        }
      })()

      try {
        attempt = await database.transition({
          attemptId: attempt.id, expectedStatus: 'executing', newStatus: 'succeeded',
          actualPayloadFingerprint: plan.payloadFingerprint, wordpressPostId: wordpressResult.postId,
          wordpressPostStatus: 'draft', wordpressPostSlug: wordpressResult.slug, wordpressPostLink: wordpressResult.link,
        })
      } catch { return await recordAuditFailureAfterWordPress(database, attempt.id, plan.payloadFingerprint) }
      return json(success(attempt, true), 201, headers)
    } catch (error) {
      const safe = safeDraftError(error)
      return json(safe.body, safe.status, headers)
    }
  }
}
