import { PublicationError } from './errors.ts'
import type { ExistingPostMatch } from './schemas.ts'

export type ReadablePostStatus = 'draft' | 'pending' | 'publish' | 'future' | 'private'
export type CatalogTaxonomy = 'categories' | 'tags'

export interface WordPressReadResponse { data: unknown; total: number; totalPages: number }

export interface PublicationWordPressClient {
  getCatalogPage(taxonomy: CatalogTaxonomy, page: number): Promise<WordPressReadResponse>
  getStatuses(): Promise<string[]>
  findPostsBySlug(slug: string, status: ReadablePostStatus): Promise<ExistingPostMatch[]>
}

interface Options {
  baseUrl: URL
  username: string
  applicationPassword: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxResponseBytes?: number
}

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password.replace(/\s+/g, '')}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

function strictHeaderInteger(value: string | null, name: string): number {
  if (value === null || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (name === 'pages' && parsed < 1)) {
    throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
  }
  return parsed
}

async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const header = response.headers.get('content-length')
  if (header && /^\d+$/.test(header) && Number(header) > maxBytes) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > maxBytes) { await reader.cancel(); throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 }) }
    text += decoder.decode(chunk.value, { stream: true })
  }
  return text + decoder.decode()
}

function upstream(status: number) {
  if (status === 429) return new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 429, retryable: true })
  return new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: status === 401 || status === 403 ? 424 : 502, retryable: status >= 500 })
}

export function createPublicationWordPressClient(options: Options): PublicationWordPressClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const authorization = basicAuthorization(options.username, options.applicationPassword)
  const timeoutMs = options.timeoutMs ?? 8_000
  const maxBytes = options.maxResponseBytes ?? 1_048_576

  async function read(path: string, query: Readonly<Record<string, string>>, pagination = false): Promise<WordPressReadResponse> {
    const url = new URL(path, options.baseUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    if (url.searchParams.has('_method')) throw new PublicationError('PREVIEW_INCOMPLETE')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: authorization, 'User-Agent': 'Daily-Brief-Note-WordPress-Preview/1.0' },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 504, retryable: true })
      throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502, retryable: true })
    } finally { clearTimeout(timer) }
    if (response.status >= 300 && response.status < 400) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
    const text = await limitedText(response, maxBytes)
    let data: unknown
    try { data = JSON.parse(text) } catch { throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 }) }
    if (!response.ok) throw upstream(response.status)
    return {
      data,
      total: pagination ? strictHeaderInteger(response.headers.get('x-wp-total'), 'total') : 0,
      totalPages: pagination ? strictHeaderInteger(response.headers.get('x-wp-totalpages'), 'pages') : 0,
    }
  }

  return {
    getCatalogPage(taxonomy, page) {
      if (!Number.isInteger(page) || page < 1 || page > 20) throw new PublicationError('WORDPRESS_CATALOG_INCOMPLETE', { httpStatus: 502 })
      const fields = taxonomy === 'categories' ? 'id,name,slug,parent,count' : 'id,name,slug,count'
      return read(`wp-json/wp/v2/${taxonomy}`, { context: 'view', page: String(page), per_page: '100', hide_empty: 'false', order: 'asc', orderby: 'id', _fields: fields }, true)
    },
    async getStatuses() {
      const response = await read('wp-json/wp/v2/statuses', { context: 'edit' })
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
      return Object.keys(response.data as Record<string, unknown>).sort()
    },
    async findPostsBySlug(slug, status) {
      if (!slug || slug.length > 200 || !['draft', 'pending', 'publish', 'future', 'private'].includes(status)) throw new PublicationError('INVALID_REQUEST', { httpStatus: 400 })
      const response = await read('wp-json/wp/v2/posts', { context: 'edit', slug, status, per_page: '100', page: '1', _fields: 'id,slug,status,modified_gmt,link' })
      if (!Array.isArray(response.data)) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
      return response.data.map((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
        const item = raw as Record<string, unknown>
        if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || item.slug !== slug || typeof item.status !== 'string') throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
        return { id: Number(item.id), slug: String(item.slug), status: String(item.status), modifiedGmt: typeof item.modified_gmt === 'string' ? item.modified_gmt : null, link: typeof item.link === 'string' ? item.link : null }
      })
    },
  }
}
