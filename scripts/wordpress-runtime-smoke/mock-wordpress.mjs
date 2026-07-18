import { timingSafeEqual } from 'node:crypto'
import http from 'node:http'

import { allowedWordPressQueries } from './helpers.mjs'

const responses = {
  '/wp-json/': {
    name: 'Daily Brief Note Runtime Smoke',
    url: 'http://host.docker.internal',
    namespaces: ['wp/v2'],
    authentication: {
      'application-passwords': {
        endpoints: { authorization: 'http://host.docker.internal/wp-admin/authorize-application.php' },
      },
    },
  },
  '/wp-json/wp/v2/users/me': {
    id: 17,
    name: 'Runtime Editor',
    email: 'wordpress-user-private@example.invalid',
    roles: ['administrator'],
    capabilities: {
      edit_posts: true,
      publish_posts: true,
      upload_files: true,
      manage_categories: true,
      edit_others_posts: true,
      delete_posts: true,
      private_capability_marker: true,
    },
  },
  '/wp-json/wp/v2/types': {
    post: { rest_base: 'posts', taxonomies: ['category', 'post_tag'], supports: { editor: true } },
  },
  '/wp-json/wp/v2/statuses': {
    draft: { name: 'Draft' },
    pending: { name: 'Pending' },
    publish: { name: 'Published' },
    future: { name: 'Scheduled' },
    private: { name: 'Private' },
  },
  '/wp-json/wp/v2/categories': [
    { id: 1, name: 'Economy', slug: 'economy', parent: 0, count: 3 },
    { id: 2, name: 'Markets', slug: 'markets', parent: 1, count: 1 },
  ],
  '/wp-json/wp/v2/tags': [
    { id: 11, name: 'AI', slug: 'ai', count: 2 },
    { id: 12, name: 'Energy', slug: 'energy', count: 1 },
  ],
  '/wp-json/wp/v2/posts': [
    {
      id: 101,
      slug: 'private-post-slug',
      status: 'draft',
      modified_gmt: '2026-07-18T00:00:00',
      content: { rendered: 'private-post-content-marker' },
      excerpt: { rendered: 'private-post-excerpt-marker' },
    },
  ],
}

const requiredQueries = new Map([
  ['/wp-json/', new Map()],
  ['/wp-json/wp/v2/users/me', new Map([['context', 'edit']])],
  ['/wp-json/wp/v2/types', new Map([['context', 'edit']])],
  ['/wp-json/wp/v2/statuses', new Map([['context', 'edit']])],
  ['/wp-json/wp/v2/categories', new Map([
    ['context', 'edit'], ['per_page', '100'], ['page', '1'], ['hide_empty', 'false'],
    ['_fields', 'id,name,slug,parent,count'],
  ])],
  ['/wp-json/wp/v2/tags', new Map([
    ['context', 'edit'], ['per_page', '100'], ['page', '1'], ['hide_empty', 'false'],
    ['_fields', 'id,name,slug,count'],
  ])],
  ['/wp-json/wp/v2/posts', new Map([
    ['context', 'edit'], ['per_page', '1'], ['page', '1'], ['_fields', 'id,slug,status,modified_gmt'],
  ])],
])

function equal(value, expected) {
  const valueBytes = Buffer.from(value)
  const expectedBytes = Buffer.from(expected)
  return valueBytes.length === expectedBytes.length && timingSafeEqual(valueBytes, expectedBytes)
}

function validQuery(url) {
  const allowed = allowedWordPressQueries.get(url.pathname)
  const required = requiredQueries.get(url.pathname)
  if (!allowed || !required) return false
  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => !allowed.has(key)) || keys.length !== required.size) return false
  return [...required].every(([key, value]) => url.searchParams.get(key) === value)
}

function sendJson(response, status, body, headers = {}) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...headers,
  })
  response.end(text)
}

export async function startMockWordPress({ username, applicationPassword }) {
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64')}`
  const audit = []
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock.invalid')
    const authorization = request.headers.authorization ?? ''
    const authorizationPresent = Boolean(authorization)
    const authorizationValid = authorizationPresent && equal(authorization, expectedAuthorization)
    let status = 200

    if (request.method !== 'GET') status = 405
    else if (!authorizationValid) status = 401
    else if (!validQuery(url)) status = 404

    audit.push({
      method: request.method ?? '',
      pathname: url.pathname,
      queryKeys: [...url.searchParams.keys()].sort(),
      authorizationPresent,
      authorizationValid,
      status,
    })

    if (status === 401) return sendJson(response, status, { code: 'mock_auth_required' })
    if (status === 405) return sendJson(response, status, { code: 'mock_method_not_allowed' }, { Allow: 'GET' })
    if (status === 404) return sendJson(response, status, { code: 'mock_path_not_found' })

    const paginationHeaders = ['/wp-json/wp/v2/categories', '/wp-json/wp/v2/tags', '/wp-json/wp/v2/posts'].includes(url.pathname)
      ? { 'X-WP-Total': String(responses[url.pathname].length), 'X-WP-TotalPages': '1' }
      : {}
    return sendJson(response, 200, responses[url.pathname], paginationHeaders)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '0.0.0.0', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('MOCK_SERVER_ADDRESS_UNAVAILABLE')

  let closed = false
  return {
    audit,
    port: address.port,
    async close() {
      if (closed) return
      closed = true
      const closing = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await closing
    },
  }
}
