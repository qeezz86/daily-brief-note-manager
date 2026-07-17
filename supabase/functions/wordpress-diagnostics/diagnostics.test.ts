import { describe, expect, it, vi } from 'vitest'

import { runWordPressDiagnostics } from './diagnostics.ts'
import { DiagnosticError } from './errors.ts'
import type { WordPressClient, WordPressEndpoint, WordPressResponse } from './wordpressClient.ts'

function response(data: unknown, total = 0, totalPages = 0): WordPressResponse {
  return { data, total, totalPages }
}

const readyResponses: Record<WordPressEndpoint, WordPressResponse> = {
  discovery: response({
    name: 'Daily Brief Note',
    url: 'https://should-not-be-returned.example.com',
    namespaces: ['oembed/1.0', 'wp/v2'],
    authentication: { 'application-passwords': { endpoints: { authorization: 'hidden' } } },
  }),
  user: response({
    id: 7,
    name: 'Editor',
    email: 'private@example.com',
    username: 'private-user',
    roles: ['administrator'],
    capabilities: {
      edit_posts: true,
      publish_posts: true,
      upload_files: true,
      manage_categories: true,
      edit_others_posts: true,
      delete_posts: true,
      activate_plugins: true,
    },
  }),
  types: response({ post: { rest_base: 'posts', taxonomies: ['category', 'post_tag'], supports: { editor: true } } }),
  statuses: response({ publish: { name: 'Published' }, draft: { name: 'Draft' }, private: { name: 'Private' }, pending: { name: 'Pending' }, future: { name: 'Future' } }),
  categories: response([{ id: 1, name: 'Economy', slug: 'economy', parent: 0, count: 8 }], 101, 2),
  tags: response([{ id: 2, name: 'AI', slug: 'ai', count: 3 }], 1, 1),
  posts: response([{ id: 99, slug: 'private-slug', status: 'draft', modified_gmt: '2026-01-01T00:00:00' }], 1, 1),
}

function mockClient(overrides: Partial<Record<WordPressEndpoint, WordPressResponse | DiagnosticError>> = {}): WordPressClient {
  const values = { ...readyResponses, ...overrides }
  return {
    get: vi.fn(async (endpoint: WordPressEndpoint) => {
      const value = values[endpoint]
      if (value instanceof DiagnosticError) throw value
      return value
    }),
  }
}

describe('runWordPressDiagnostics', () => {
  it('returns an allowlisted, deterministic ready result without post content or private user fields', async () => {
    const result = await runWordPressDiagnostics(mockClient(), 'https://wordpress.example.com', () => new Date('2026-07-17T00:00:00.000Z'))
    expect(result.schemaVersion).toBe(1)
    expect(result.checkedAt).toBe('2026-07-17T00:00:00.000Z')
    expect(result.readiness.connection).toBe('ready')
    expect(result.resources.categories).toMatchObject({ total: 101, totalPages: 2, truncated: true })
    expect(result.resources.tags).toMatchObject({ total: 1, truncated: false })
    expect(result.resources.statuses).toEqual(['draft', 'future', 'pending', 'private', 'publish'])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('private-user')
    expect(serialized).not.toContain('activate_plugins')
    expect(serialized).not.toContain('private-slug')
    expect(serialized).not.toContain('modified_gmt')
  })

  it('fails when wp/v2 is unavailable', async () => {
    await expect(runWordPressDiagnostics(mockClient({ discovery: response({ name: 'Site', namespaces: [] }) }), 'https://wordpress.example.com')).rejects.toMatchObject({ code: 'REST_API_UNAVAILABLE' })
  })

  it('preserves WordPress authentication failure', async () => {
    await expect(runWordPressDiagnostics(mockClient({ user: new DiagnosticError('WORDPRESS_AUTH_FAILED') }), 'https://wordpress.example.com')).rejects.toMatchObject({ code: 'WORDPRESS_AUTH_FAILED' })
  })

  it('reports missing edit_posts separately from successful authentication', async () => {
    const user = structuredClone(readyResponses.user.data) as { capabilities: Record<string, boolean> }
    user.capabilities.edit_posts = false
    const result = await runWordPressDiagnostics(mockClient({ user: response(user) }), 'https://wordpress.example.com')
    expect(result.authentication.authenticated).toBe(true)
    expect(result.readiness.connection).toBe('insufficient_permissions')
    expect(result.readiness.draftPublishing).toBe('capability-missing')
    expect(result.readiness.directPublishing).toBe('capability-confirmed')
  })

  it.each([
    ['categories', '카테고리 목록을 확인하지 못했습니다.'],
    ['tags', '태그 목록을 확인하지 못했습니다.'],
    ['posts', '글 목록의 읽기 권한을 확인하지 못했습니다.'],
  ] as const)('turns a %s failure into a partial warning', async (endpoint, warning) => {
    const result = await runWordPressDiagnostics(mockClient({ [endpoint]: new DiagnosticError('WORDPRESS_TIMEOUT') }), 'https://wordpress.example.com')
    expect(result.readiness.connection).toBe('partial')
    expect(result.warnings).toContain(warning)
  })

  it('warns when Application Password discovery is not advertised', async () => {
    const result = await runWordPressDiagnostics(mockClient({ discovery: response({ name: 'Site', namespaces: ['wp/v2'] }) }), 'https://wordpress.example.com')
    expect(result.site.applicationPasswordsAdvertised).toBe(false)
    expect(result.readiness.connection).toBe('partial')
    expect(result.warnings[0]).toMatch(/Application Password/)
  })

  it('keeps resource warning order deterministic despite completion order', async () => {
    const client: WordPressClient = {
      async get(endpoint) {
        if (endpoint === 'discovery' || endpoint === 'user') return readyResponses[endpoint]
        await new Promise((resolve) => setTimeout(resolve, endpoint === 'types' ? 5 : 0))
        throw new DiagnosticError('WORDPRESS_TIMEOUT')
      },
    }
    const result = await runWordPressDiagnostics(client, 'https://wordpress.example.com')
    expect(result.warnings).toEqual([
      'post type 정보를 확인하지 못했습니다.',
      'post status 정보를 확인하지 못했습니다.',
      '카테고리 목록을 확인하지 못했습니다.',
      '태그 목록을 확인하지 못했습니다.',
      '글 목록의 읽기 권한을 확인하지 못했습니다.',
    ])
  })
})
