import { PublicationError } from './errors.ts'
import type { ExistingPostMatch } from './schemas.ts'
import type { PublicationWordPressClient, ReadablePostStatus } from './wordpressClient.ts'

const readableStatuses: ReadablePostStatus[] = ['draft', 'pending', 'publish', 'future', 'private']

export async function checkDuplicateSlug(client: PublicationWordPressClient, slug: string) {
  const available = new Set(await client.getStatuses())
  const statuses = readableStatuses.filter((status) => available.has(status))
  if (!statuses.length) throw new PublicationError('WORDPRESS_READ_FAILED', { httpStatus: 502 })
  const results = await Promise.all(statuses.map((status) => client.findPostsBySlug(slug, status)))
  const byId = new Map<number, ExistingPostMatch>()
  for (const match of results.flat()) byId.set(match.id, match)
  const matches = [...byId.values()].sort((left, right) => left.id - right.id)
  return { conflict: matches.length > 0, inconsistent: matches.length > 1, matches }
}
