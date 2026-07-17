import { DiagnosticError } from './errors.ts'
import type { PagedResource, WordPressCategory, WordPressDiagnosticsResult, WordPressTag } from './schemas.ts'
import type { WordPressClient, WordPressEndpoint, WordPressResponse } from './wordpressClient.ts'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
  }
  return value as JsonRecord
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function capability(value: unknown): boolean {
  return value === true
}

function advertisedApplicationPasswords(root: JsonRecord): boolean {
  const authentication = root.authentication
  if (!authentication || typeof authentication !== 'object') return false
  const applicationPasswords = (authentication as JsonRecord)['application-passwords']
  if (!applicationPasswords || typeof applicationPasswords !== 'object') return false
  const endpoints = (applicationPasswords as JsonRecord).endpoints
  if (!endpoints || typeof endpoints !== 'object') return false
  return Boolean(string((endpoints as JsonRecord).authorization))
}

function parseCategory(value: unknown): WordPressCategory {
  const item = record(value)
  return { id: number(item.id), name: string(item.name), slug: string(item.slug), parent: number(item.parent), count: number(item.count) }
}

function parseTag(value: unknown): WordPressTag {
  const item = record(value)
  return { id: number(item.id), name: string(item.name), slug: string(item.slug), count: number(item.count) }
}

function paged<T>(response: WordPressResponse, parser: (value: unknown) => T): PagedResource<T> {
  if (!Array.isArray(response.data)) throw new DiagnosticError('WORDPRESS_RESPONSE_INVALID', { httpStatus: 502 })
  return {
    total: response.total,
    totalPages: response.totalPages,
    truncated: response.totalPages > 1,
    items: response.data.map(parser),
  }
}

interface ResourceCheck {
  endpoint: Exclude<WordPressEndpoint, 'discovery' | 'user'>
  warning: string
}

const resourceChecks: ResourceCheck[] = [
  { endpoint: 'types', warning: 'post type 정보를 확인하지 못했습니다.' },
  { endpoint: 'statuses', warning: 'post status 정보를 확인하지 못했습니다.' },
  { endpoint: 'categories', warning: '카테고리 목록을 확인하지 못했습니다.' },
  { endpoint: 'tags', warning: '태그 목록을 확인하지 못했습니다.' },
  { endpoint: 'posts', warning: '글 목록의 읽기 권한을 확인하지 못했습니다.' },
]

export async function runWordPressDiagnostics(client: WordPressClient, siteOrigin: string, now = () => new Date()): Promise<WordPressDiagnosticsResult> {
  const discoveryResponse = await client.get('discovery')
  const discovery = record(discoveryResponse.data)
  const namespaces = stringArray(discovery.namespaces)
  if (!namespaces.includes('wp/v2')) throw new DiagnosticError('REST_API_UNAVAILABLE', { httpStatus: 502 })

  const userResponse = await client.get('user')
  const user = record(userResponse.data)
  const rawCapabilities = record(user.capabilities)
  const capabilities = {
    editPosts: capability(rawCapabilities.edit_posts),
    publishPosts: capability(rawCapabilities.publish_posts),
    uploadFiles: capability(rawCapabilities.upload_files),
    manageCategories: capability(rawCapabilities.manage_categories),
    editOthersPosts: capability(rawCapabilities.edit_others_posts),
    deletePosts: capability(rawCapabilities.delete_posts),
  }

  const settled = await Promise.all(resourceChecks.map(async ({ endpoint, warning }) => {
    try {
      return { endpoint, response: await client.get(endpoint), warning: null }
    } catch {
      return { endpoint, response: null, warning }
    }
  }))
  const responses = new Map(settled.map((item) => [item.endpoint, item.response]))
  const warnings = settled.flatMap((item) => item.warning ? [item.warning] : [])

  const typesResponse = responses.get('types')
  const types = typesResponse ? record(typesResponse.data) : {}
  const postType = types.post ? record(types.post) : null
  const statusesResponse = responses.get('statuses')
  const statuses = statusesResponse ? Object.keys(record(statusesResponse.data)).sort() : []
  const categoriesResponse = responses.get('categories')
  const tagsResponse = responses.get('tags')
  const applicationPasswordsAdvertised = advertisedApplicationPasswords(discovery)
  if (!applicationPasswordsAdvertised) warnings.unshift('REST discovery가 Application Password endpoint를 광고하지 않습니다.')
  if (postType === null && typesResponse) warnings.push('기본 post type을 확인하지 못했습니다.')
  const missingStatuses = ['draft', 'pending', 'publish', 'future', 'private'].filter((status) => !statuses.includes(status))
  if (statusesResponse && missingStatuses.length) warnings.push(`확인되지 않은 post status: ${missingStatuses.join(', ')}`)

  const hasResourceWarnings = warnings.length > 0
  const connection = !capabilities.editPosts
    ? 'insufficient_permissions'
    : hasResourceWarnings
      ? 'partial'
      : 'ready'

  return {
    schemaVersion: 1,
    checkedAt: now().toISOString(),
    ok: true,
    site: {
      name: string(discovery.name),
      origin: siteOrigin,
      restApiReachable: true,
      wpV2Available: true,
      applicationPasswordsAdvertised,
    },
    authentication: {
      authenticated: true,
      userId: number(user.id),
      displayName: string(user.name),
      roles: stringArray(user.roles),
    },
    capabilities,
    resources: {
      postTypeAvailable: postType !== null,
      postRestBase: postType ? string(postType.rest_base) || null : null,
      postTaxonomies: postType ? stringArray(postType.taxonomies) : [],
      statuses,
      categories: categoriesResponse ? paged(categoriesResponse, parseCategory) : null,
      tags: tagsResponse ? paged(tagsResponse, parseTag) : null,
      postsReadable: responses.get('posts') !== null,
    },
    readiness: {
      connection,
      draftPublishing: capabilities.editPosts ? 'capability-confirmed' : 'capability-missing',
      directPublishing: capabilities.publishPosts ? 'capability-confirmed' : 'capability-missing',
      mediaUpload: capabilities.uploadFiles ? 'capability-confirmed' : 'capability-missing',
      taxonomyManagement: capabilities.manageCategories ? 'capability-confirmed' : 'capability-missing',
    },
    warnings,
  }
}
