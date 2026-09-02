import { PostStatusError } from './errors.ts'
import { parseRemoteSnapshot, type RemoteSnapshot } from './schemas.ts'

interface Options { baseUrl: URL; username: string; applicationPassword: string; fetchImpl?: typeof fetch; timeoutMs?: number; maxResponseBytes?: number }

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password.replace(/\s+/g, '')}`)
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}
async function limitedText(response: Response, maxBytes: number): Promise<string> {
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new PostStatusError('WORDPRESS_RESPONSE_OVERSIZED', 502)
  if (!response.body) return ''
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let text = ''
  while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new PostStatusError('WORDPRESS_RESPONSE_OVERSIZED', 502) }; text += decoder.decode(next.value, { stream: true }) }
  return text + decoder.decode()
}
export function createWordPressPostStatusClient(options: Options) {
  const fetchImpl = options.fetchImpl ?? fetch; const authorization = basicAuthorization(options.username, options.applicationPassword)
  const timeoutMs = options.timeoutMs ?? 8_000; const maxBytes = options.maxResponseBytes ?? 1_048_576
  return { async getPost(postId: number): Promise<RemoteSnapshot> {
    if (!Number.isSafeInteger(postId) || postId <= 0) throw new PostStatusError('NO_SYNCABLE_WORDPRESS_ID', 409)
    const url = new URL(`wp-json/wp/v2/posts/${postId}`, options.baseUrl)
    url.searchParams.set('context', 'edit'); url.searchParams.set('_fields', 'id,slug,status,link,modified_gmt,date_gmt')
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try { response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json', Authorization: authorization, 'User-Agent': 'Daily-Brief-Note-WordPress-Post-Status/1.0' } }) }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new PostStatusError('WORDPRESS_TIMEOUT', 504); throw new PostStatusError('WORDPRESS_CONNECTION_FAILURE', 502) }
    finally { clearTimeout(timer) }
    if (response.status >= 300 && response.status < 400) throw new PostStatusError('WORDPRESS_REDIRECT_REJECTED', 502)
    if (response.status === 401) throw new PostStatusError('WORDPRESS_AUTH_FAILURE', 424)
    if (response.status === 403) throw new PostStatusError('WORDPRESS_ACCESS_DENIED', 424)
    if (response.status === 404) throw new PostStatusError('WORDPRESS_POST_NOT_FOUND', 404)
    if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new PostStatusError('WORDPRESS_RESPONSE_INVALID', 502)
    let payload: unknown; try { payload = JSON.parse(await limitedText(response, maxBytes)) } catch (error) { if (error instanceof PostStatusError) throw error; throw new PostStatusError('WORDPRESS_RESPONSE_INVALID', 502) }
    return parseRemoteSnapshot(payload, postId, options.baseUrl.origin)
  } }
}
