import type { WordPressDiagnosticsResult } from './wordpressDiagnostics.types'

export const readyWordPressDiagnostics: WordPressDiagnosticsResult = {
  schemaVersion: 1,
  checkedAt: '2026-07-17T00:00:00.000Z',
  ok: true,
  site: {
    name: 'Daily Brief Note',
    origin: 'https://wordpress.example.com',
    restApiReachable: true,
    wpV2Available: true,
    applicationPasswordsAdvertised: true,
  },
  authentication: { authenticated: true, userId: 7, displayName: 'Editor', roles: ['administrator'] },
  capabilities: { editPosts: true, publishPosts: true, uploadFiles: true, manageCategories: true, editOthersPosts: true, deletePosts: true },
  resources: {
    postTypeAvailable: true,
    postRestBase: 'posts',
    postTaxonomies: ['category', 'post_tag'],
    statuses: ['draft', 'publish'],
    categories: { total: 12, totalPages: 1, truncated: false, items: [{ id: 1, name: '경제', slug: 'economy', parent: 0, count: 3 }] },
    tags: { total: 24, totalPages: 1, truncated: false, items: [{ id: 2, name: 'AI', slug: 'ai', count: 2 }] },
    postsReadable: true,
  },
  readiness: {
    connection: 'ready',
    draftPublishing: 'capability-confirmed',
    directPublishing: 'capability-confirmed',
    mediaUpload: 'capability-confirmed',
    taxonomyManagement: 'capability-confirmed',
  },
  warnings: [],
}
