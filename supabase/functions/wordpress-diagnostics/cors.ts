import { DiagnosticError } from './errors.ts'

const allowedHeaders = 'authorization, apikey, content-type'

export function corsHeaders(origin: string, allowedOrigins: ReadonlySet<string>): Headers {
  if (!origin || !allowedOrigins.has(origin)) {
    throw new DiagnosticError('ORIGIN_FORBIDDEN', { httpStatus: 403 })
  }

  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  })
}
