import { DiagnosticError } from './errors.ts'

export type WordPressEndpoint = 'discovery' | 'user' | 'types' | 'statuses' | 'categories' | 'tags' | 'posts'

export interface WordPressResponse {
  data: unknown
  total: number
  totalPages: number
}

export interface WordPressClient {
  get(endpoint: WordPressEndpoint): Promise<WordPressResponse>
}

interface ClientOptions {
  baseUrl: URL
  username: string
  applicationPassword: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxResponseBytes?: number
}

const endpointPaths: Record<WordPressEndpoint, { path: string; query?: Record<string, string> }> = {
  discovery: { path: 'wp-json/' },
  user: { path: 'wp-json/wp/v2/users/me', query: { context: 'edit' } },
  types: { path: 'wp-json/wp/v2/types', query: { context: 'edit' } },
  statuses: { path: 'wp-json/wp/v2/statuses', query: { context: 'edit' } },
  categories: { path: 'wp-json/wp/v2/categories', query: { context: 'edit', per_page: '100', page: '1', hide_empty: 'false', _fields: 'id,name,slug,parent,count' } },
  tags: { path: 'wp-json/wp/v2/tags', query: { context: 'edit', per_page: '100', page: '1', hide_empty: 'false', _fields: 'id,name,slug,count' } },
  posts: { path: 'wp-json/wp/v2/posts', query: { context: 'edit', per_page: '1', page: '1', _fields: 'id,slug,status,modified_gmt' } },
}

function parseCount(value: string | null): number {
  if (!value) return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function basicAuthorization(username: string, applicationPassword: string): string {
  const bytes = new TextEncoder().encode(`${username}:${applicationPassword}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = parseCount(response.headers.get('content-length'))
  if (contentLength > maxBytes) throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
    }
    result += decoder.decode(value, { stream: true })
  }
  return result + decoder.decode()
}

function upstreamError(status: number): DiagnosticError {
  if (status === 401) return new DiagnosticError('WORDPRESS_AUTH_FAILED', { httpStatus: 424 })
  if (status === 403) return new DiagnosticError('WORDPRESS_FORBIDDEN', { httpStatus: 424 })
  if (status === 429) return new DiagnosticError('WORDPRESS_RATE_LIMITED', { httpStatus: 429, retryable: true })
  return new DiagnosticError('WORDPRESS_HTTP_ERROR', { httpStatus: 502, retryable: status >= 500 })
}

export function createWordPressClient(options: ClientOptions): WordPressClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 8_000
  const maxResponseBytes = options.maxResponseBytes ?? 1_048_576
  const applicationPassword = options.applicationPassword.replace(/\s+/g, '')
  const authorization = basicAuthorization(options.username, applicationPassword)

  return {
    async get(endpoint) {
      const definition = endpointPaths[endpoint]
      const url = new URL(definition.path, options.baseUrl)
      for (const [key, value] of Object.entries(definition.query ?? {})) url.searchParams.set(key, value)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            Authorization: authorization,
            'User-Agent': 'Daily-Brief-Note-WordPress-Diagnostics/1.0',
          },
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new DiagnosticError('WORDPRESS_TIMEOUT', { httpStatus: 504, retryable: true })
        }
        throw new DiagnosticError('REST_API_UNREACHABLE', { httpStatus: 502, retryable: true })
      } finally {
        clearTimeout(timer)
      }

      if (response.status >= 300 && response.status < 400) {
        throw new DiagnosticError('WORDPRESS_REDIRECTED', { httpStatus: 502 })
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.includes('application/json')) {
        throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
      }

      const text = await limitedText(response, maxResponseBytes)
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
      }

      if (!response.ok) throw upstreamError(response.status)

      return {
        data,
        total: parseCount(response.headers.get('x-wp-total')),
        totalPages: parseCount(response.headers.get('x-wp-totalpages')),
      }
    },
  }
}
