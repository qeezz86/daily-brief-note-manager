import { PostStatusError } from './errors.ts'

export const wordpressPostStatuses = ['draft', 'pending', 'private', 'publish', 'future', 'trash'] as const
export type WordPressPostStatus = typeof wordpressPostStatuses[number]

export interface StoredAttempt {
  id: string; contentId: string; wordpressPostId: number; status: WordPressPostStatus; slug: string; link: string
}
export interface RemoteSnapshot {
  wordpressPostId: number; status: WordPressPostStatus; slug: string; link: string; modifiedGmt: string; dateGmt: string | null
}

function validGmt(value: unknown, nullable = false): value is string | null {
  return (nullable && value === null) || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value))
}

export function parseRemoteSnapshot(value: unknown, expectedId: number, expectedOrigin: string): RemoteSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PostStatusError('WORDPRESS_RESPONSE_INVALID', 502)
  const item = value as Record<string, unknown>
  if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || typeof item.slug !== 'string' || !item.slug.trim() || item.slug.length > 200
    || typeof item.status !== 'string' || !wordpressPostStatuses.includes(item.status as WordPressPostStatus)
    || typeof item.link !== 'string' || !validGmt(item.modified_gmt) || !validGmt(item.date_gmt, true)) {
    throw new PostStatusError(item.status && !wordpressPostStatuses.includes(item.status as WordPressPostStatus) ? 'WORDPRESS_UNKNOWN_STATUS' : 'WORDPRESS_RESPONSE_INVALID', 502)
  }
  if (Number(item.id) !== expectedId) throw new PostStatusError('WORDPRESS_IDENTITY_MISMATCH', 502)
  let link: URL
  try { link = new URL(item.link) } catch { throw new PostStatusError('WORDPRESS_RESPONSE_INVALID', 502) }
  if (link.protocol !== 'https:' || link.username || link.password || link.origin !== expectedOrigin) throw new PostStatusError('WORDPRESS_RESPONSE_INVALID', 502)
  return { wordpressPostId: Number(item.id), status: item.status as WordPressPostStatus, slug: item.slug, link: link.href, modifiedGmt: item.modified_gmt as string, dateGmt: item.date_gmt as string | null }
}
