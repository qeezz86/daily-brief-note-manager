export type WordPressConnectionStatus = 'ready' | 'partial' | 'insufficient_permissions'
export type WordPressCapabilityStatus = 'capability-confirmed' | 'capability-missing'

export interface WordPressDiagnosticsResult {
  schemaVersion: 1
  checkedAt: string
  ok: true
  site: {
    name: string
    origin: string
    restApiReachable: true
    wpV2Available: true
    applicationPasswordsAdvertised: boolean
  }
  authentication: {
    authenticated: true
    userId: number
    displayName: string
    roles: string[]
  }
  capabilities: {
    editPosts: boolean
    publishPosts: boolean
    uploadFiles: boolean
    manageCategories: boolean
    editOthersPosts: boolean
    deletePosts: boolean
  }
  resources: {
    postTypeAvailable: boolean
    postRestBase: string | null
    postTaxonomies: string[]
    statuses: string[]
    categories: {
      total: number
      totalPages: number
      truncated: boolean
      items: Array<{ id: number; name: string; slug: string; parent: number; count: number }>
    } | null
    tags: {
      total: number
      totalPages: number
      truncated: boolean
      items: Array<{ id: number; name: string; slug: string; count: number }>
    } | null
    postsReadable: boolean
  }
  readiness: {
    connection: WordPressConnectionStatus
    draftPublishing: WordPressCapabilityStatus
    directPublishing: WordPressCapabilityStatus
    mediaUpload: WordPressCapabilityStatus
    taxonomyManagement: WordPressCapabilityStatus
  }
  warnings: string[]
}

export interface WordPressDiagnosticsErrorBody {
  schemaVersion: 1
  ok: false
  error: {
    code: string
    message: string
    retryable: boolean
  }
}
