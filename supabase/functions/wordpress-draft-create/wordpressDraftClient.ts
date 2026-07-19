import type { PublicationPayload } from '../wordpress-publication-preview/schemas.ts'
import { DraftError } from './errors.ts'
import type { DraftWordPressClient, WordPressDraftResult } from './schemas.ts'

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

async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let output = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    received += chunk.value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
    }
    output += decoder.decode(chunk.value, { stream: true })
  }
  return output + decoder.decode()
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DraftError('WORDPRESS_DRAFT_RESPONSE_INVALID', 502)
  return value as Record<string, unknown>
}

function parseResult(value: unknown, expectedSlug: string): WordPressDraftResult {
  const item = record(value)
  if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0
    || item.status !== 'draft' || item.slug !== expectedSlug || typeof item.link !== 'string') {
    throw new DraftError('WORDPRESS_DRAFT_RESPONSE_INVALID', 502)
  }
  let link: URL
  try { link = new URL(item.link) } catch { throw new DraftError('WORDPRESS_DRAFT_RESPONSE_INVALID', 502) }
  if (link.protocol !== 'https:' || link.username || link.password) throw new DraftError('WORDPRESS_DRAFT_RESPONSE_INVALID', 502)
  return { postId: Number(item.id), status: 'draft', slug: expectedSlug, link: link.href }
}

export function createWordPressDraftClient(options: Options): DraftWordPressClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const authorization = basicAuthorization(options.username, options.applicationPassword)
  const timeoutMs = options.timeoutMs ?? 8_000
  const maxBytes = options.maxResponseBytes ?? 262_144

  async function request(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new DraftError('WORDPRESS_DRAFT_TIMEOUT_UNCERTAIN', 504)
      throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
    } finally { clearTimeout(timer) }
  }

  return {
    async verifyDraftCapability() {
      const url = new URL('wp-json/wp/v2/users/me', options.baseUrl)
      url.searchParams.set('context', 'edit')
      url.searchParams.set('_fields', 'id,capabilities')
      let response: Response
      try {
        response = await request(url, {
          method: 'GET', headers: { Accept: 'application/json', Authorization: authorization, 'User-Agent': 'Daily-Brief-Note-WordPress-Draft/1.0' },
        })
      } catch { throw new DraftError('WORDPRESS_CAPABILITY_MISSING', 424) }
      if (response.status >= 300 && response.status < 400) throw new DraftError('WORDPRESS_CAPABILITY_MISSING', 424)
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new DraftError('WORDPRESS_CAPABILITY_MISSING', 424)
      let data: unknown
      try { data = JSON.parse(await limitedText(response, maxBytes)) } catch (error) {
        if (error instanceof DraftError) throw error
        throw new DraftError('WORDPRESS_CAPABILITY_MISSING', 424)
      }
      if (!response.ok) throw new DraftError('WORDPRESS_CAPABILITY_MISSING', 424)
      const capabilities = record(record(data).capabilities)
      return capabilities.edit_posts === true
    },
    async createDraft(payload) {
      const body: PublicationPayload = {
        title: payload.title, content: payload.content, status: 'draft', slug: payload.slug,
        excerpt: payload.excerpt, categories: [...payload.categories], tags: [...payload.tags],
      }
      const response = await request(new URL('wp-json/wp/v2/posts', options.baseUrl), {
        method: 'POST', headers: {
          Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json',
          'User-Agent': 'Daily-Brief-Note-WordPress-Draft/1.0',
        }, body: JSON.stringify(body),
      })
      if (response.status >= 300 && response.status < 400) throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
      let data: unknown
      try { data = JSON.parse(await limitedText(response, maxBytes)) } catch (error) {
        if (error instanceof DraftError) throw error
        throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', 502)
      }
      if (!response.ok) {
        if ([400, 401, 403, 404, 409].includes(response.status)) throw new DraftError('WORDPRESS_DRAFT_REJECTED', 424)
        throw new DraftError('WORDPRESS_DRAFT_RESULT_UNCERTAIN', response.status === 504 ? 504 : 502)
      }
      try { return parseResult(data, payload.slug) }
      catch { throw new DraftError('WORDPRESS_DRAFT_RESPONSE_INVALID', 502) }
    },
  }
}
