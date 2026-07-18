import { DiagnosticError } from '../wordpress-diagnostics/errors.ts'
import { parseAllowedOrigins, parseWordPressConfig } from '../wordpress-diagnostics/config.ts'
import { corsHeaders } from '../wordpress-diagnostics/cors.ts'
import { PublicationError, safePublicationError } from './errors.ts'
import { preparePublicationPlan } from './publicationPlan.ts'
import { parsePreviewRequest } from './requestSchema.ts'
import type { AuthenticatedCaller, CallerDatabase, EnvironmentSource } from './schemas.ts'
import { loadTaxonomyCatalog } from './taxonomyCatalog.ts'
import { createPublicationWordPressClient } from './wordpressClient.ts'

interface Dependencies {
  environment: EnvironmentSource
  verifyCaller(token: string): Promise<AuthenticatedCaller>
  createDatabase(token: string): CallerDatabase
  fetchImpl?: typeof fetch
  now?: () => Date
}

function json(body: unknown, status: number, headers?: Headers) {
  const output = new Headers(headers)
  output.set('Content-Type', 'application/json; charset=utf-8')
  output.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: output })
}

function bearer(request: Request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) throw new PublicationError('CALLER_UNAUTHENTICATED', { httpStatus: 401 })
  return match[1]
}

function diagnosticAsPublication(error: DiagnosticError): PublicationError {
  if (error.code === 'ORIGIN_FORBIDDEN') return new PublicationError('CALLER_FORBIDDEN', { httpStatus: 403 })
  return new PublicationError('PREVIEW_INCOMPLETE', { httpStatus: error.httpStatus, retryable: error.retryable })
}

export function createPublicationPreviewHandler(dependencies: Dependencies) {
  return async function handler(request: Request): Promise<Response> {
    let headers: Headers | undefined
    try {
      try { headers = corsHeaders(request.headers.get('origin') ?? '', parseAllowedOrigins(dependencies.environment)) }
      catch (error) { if (error instanceof DiagnosticError) throw diagnosticAsPublication(error); throw error }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new PublicationError('METHOD_NOT_ALLOWED', { httpStatus: 405 })
      const parsed = await parsePreviewRequest(request)
      let config
      try { config = parseWordPressConfig(dependencies.environment) }
      catch (error) { if (error instanceof DiagnosticError) throw diagnosticAsPublication(error); throw error }
      const accessToken = bearer(request)
      let caller: AuthenticatedCaller
      try { caller = await dependencies.verifyCaller(accessToken) }
      catch { throw new PublicationError('CALLER_UNAUTHENTICATED', { httpStatus: 401 }) }
      if (caller.id !== config.allowedUserId) throw new PublicationError('CALLER_FORBIDDEN', { httpStatus: 403 })
      const wordpress = createPublicationWordPressClient({ baseUrl: config.siteUrl, username: config.username, applicationPassword: config.applicationPassword, fetchImpl: dependencies.fetchImpl })
      const catalog = await loadTaxonomyCatalog(wordpress)
      if (parsed.action === 'get-taxonomy-catalog') {
        return json({ schemaVersion: 1, ok: true, mode: 'dry-run', writePerformed: false, checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(), site: { origin: config.siteUrl.origin }, catalog }, 200, headers)
      }
      const plan = await preparePublicationPlan({ database: dependencies.createDatabase(accessToken), wordpress, catalog, siteOrigin: config.siteUrl.origin, contentId: parsed.contentId, now: dependencies.now })
      if (!plan) throw new PublicationError('CONTENT_NOT_FOUND', { httpStatus: 404 })
      return json(plan, 200, headers)
    } catch (error) {
      const safe = safePublicationError(error)
      return json(safe.body, safe.status, headers)
    }
  }
}
