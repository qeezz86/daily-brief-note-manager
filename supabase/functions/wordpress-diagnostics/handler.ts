import { asDiagnosticError, DiagnosticError, safeErrorBody } from './errors.ts'
import { parseAllowedOrigins, parseWordPressConfig } from './config.ts'
import { corsHeaders } from './cors.ts'
import { runWordPressDiagnostics } from './diagnostics.ts'
import type { CallerVerifier, EnvironmentSource } from './schemas.ts'
import { createWordPressClient } from './wordpressClient.ts'

interface HandlerDependencies {
  environment: EnvironmentSource
  verifyCaller: CallerVerifier
  fetchImpl?: typeof fetch
  now?: () => Date
}

function json(body: unknown, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  if (!match) throw new DiagnosticError('CALLER_UNAUTHENTICATED', { httpStatus: 401 })
  return match[1]
}

async function requestAction(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) throw new DiagnosticError('INVALID_REQUEST', { httpStatus: 400 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new DiagnosticError('INVALID_REQUEST', { httpStatus: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { action?: unknown }).action !== 'diagnose') {
    throw new DiagnosticError('INVALID_REQUEST', { httpStatus: 400 })
  }
  return 'diagnose'
}

export function createHandler(dependencies: HandlerDependencies) {
  return async function handle(request: Request): Promise<Response> {
    let headers: Headers | undefined
    try {
      headers = corsHeaders(request.headers.get('origin') ?? '', parseAllowedOrigins(dependencies.environment))

      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new DiagnosticError('METHOD_NOT_ALLOWED', { httpStatus: 405 })
      await requestAction(request)
      const config = parseWordPressConfig(dependencies.environment)

      let caller
      try {
        caller = await dependencies.verifyCaller(bearerToken(request))
      } catch (error) {
        if (error instanceof DiagnosticError) throw error
        throw new DiagnosticError('CALLER_UNAUTHENTICATED', { httpStatus: 401 })
      }
      if (caller.id !== config.allowedUserId) throw new DiagnosticError('CALLER_FORBIDDEN', { httpStatus: 403 })

      const client = createWordPressClient({
        baseUrl: config.siteUrl,
        username: config.username,
        applicationPassword: config.applicationPassword,
        fetchImpl: dependencies.fetchImpl,
      })
      const result = await runWordPressDiagnostics(client, config.siteUrl.origin, dependencies.now)
      return json(result, 200, headers)
    } catch (error) {
      const safeError = asDiagnosticError(error)
      return json(safeErrorBody(safeError), safeError.httpStatus, headers)
    }
  }
}
