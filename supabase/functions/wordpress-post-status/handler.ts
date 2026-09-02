import { DiagnosticError } from '../wordpress-diagnostics/errors.ts'
import { parseAllowedOrigins, parseWordPressConfig } from '../wordpress-diagnostics/config.ts'
import { corsHeaders } from '../wordpress-diagnostics/cors.ts'

import { loadSyncableAttempt } from './contentLoader.ts'
import { asPostStatusError, PostStatusError, safeErrorBody } from './errors.ts'
import { parsePostStatusRequest } from './requestSchema.ts'
import { reconcile, type ReconciliationPrimary } from './reconciliation.ts'
import { createWordPressPostStatusClient } from './wordpressPostStatusClient.ts'

interface EnvironmentSource { get(name: string): string | undefined }
interface Caller { id: string }
interface Dependencies { environment: EnvironmentSource; verifyCaller(token: string): Promise<Caller>; createDatabase(token: string): Parameters<typeof loadSyncableAttempt>[0]; fetchImpl?: typeof fetch; now?: () => Date }

function json(body: unknown, status: number, headers?: Headers) {
  const output = new Headers(headers); output.set('Content-Type', 'application/json; charset=utf-8'); output.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: output })
}
function bearer(request: Request): string {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) throw new PostStatusError('CALLER_UNAUTHORIZED', 401)
  return match[1]
}
function configError(error: unknown): never {
  if (error instanceof DiagnosticError && error.code === 'ORIGIN_FORBIDDEN') throw new PostStatusError('ORIGIN_FORBIDDEN', 403)
  throw new PostStatusError('WORDPRESS_CONFIGURATION_INVALID', 500)
}
function primaryFor(error: PostStatusError): ReconciliationPrimary | null {
  if (error.code === 'WORDPRESS_POST_NOT_FOUND') return 'REMOTE_NOT_FOUND'
  if (error.code === 'WORDPRESS_AUTH_FAILURE' || error.code === 'WORDPRESS_ACCESS_DENIED') return 'REMOTE_ACCESS_DENIED'
  if (error.code === 'WORDPRESS_IDENTITY_MISMATCH') return 'REMOTE_IDENTITY_MISMATCH'
  if (['WORDPRESS_TIMEOUT', 'WORDPRESS_CONNECTION_FAILURE', 'WORDPRESS_REDIRECT_REJECTED', 'WORDPRESS_RESPONSE_OVERSIZED', 'WORDPRESS_RESPONSE_INVALID', 'WORDPRESS_UNKNOWN_STATUS'].includes(error.code)) return 'REMOTE_RESPONSE_UNCERTAIN'
  return null
}

export function createPostStatusHandler(dependencies: Dependencies) {
  return async function handler(request: Request): Promise<Response> {
    let headers: Headers | undefined
    try {
      try { headers = corsHeaders(request.headers.get('origin') ?? '', parseAllowedOrigins(dependencies.environment)) } catch (error) { configError(error) }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new PostStatusError('UNKNOWN', 405)
      if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new PostStatusError('UNKNOWN', 400)
      let raw: unknown; try { raw = await request.json() } catch { throw new PostStatusError('UNKNOWN', 400) }
      const input = parsePostStatusRequest(raw); const token = bearer(request)
      let caller: Caller; try { caller = await dependencies.verifyCaller(token) } catch { throw new PostStatusError('CALLER_UNAUTHORIZED', 401) }
      let config; try { config = parseWordPressConfig(dependencies.environment) } catch (error) { configError(error) }
      if (caller.id !== config.allowedUserId) throw new PostStatusError('CALLER_UNAUTHORIZED', 403)
      const stored = await loadSyncableAttempt(dependencies.createDatabase(token), caller.id, input.contentId, input.attemptId, config.siteUrl.origin)
      const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString()
      const responseBase = { schemaVersion: 1 as const, ok: true as const, checkedAt, source: { contentId: input.contentId, attemptId: input.attemptId }, stored: { wordpressPostId: stored.wordpressPostId, status: stored.status, slug: stored.slug, link: stored.link } }
      try {
        const wordpress = await createWordPressPostStatusClient({ baseUrl: config.siteUrl, username: config.username, applicationPassword: config.applicationPassword, fetchImpl: dependencies.fetchImpl }).getPost(stored.wordpressPostId)
        return json({ ...responseBase, wordpress, reconciliation: reconcile(stored, wordpress) }, 200, headers)
      } catch (error) {
        const safe = asPostStatusError(error); const primary = primaryFor(safe)
        if (!primary) throw safe
        return json({ ...responseBase, wordpress: null, reconciliation: { primary, deltas: [] } }, 200, headers)
      }
    } catch (error) { const safe = asPostStatusError(error); return json(safeErrorBody(safe), safe.httpStatus, headers) }
  }
}
