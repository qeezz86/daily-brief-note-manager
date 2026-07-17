export type ConnectionStatus = 'ready' | 'partial' | 'insufficient_permissions'
export type CapabilityStatus = 'capability-confirmed' | 'capability-missing'

export interface WordPressCategory {
  id: number
  name: string
  slug: string
  parent: number
  count: number
}

export interface WordPressTag {
  id: number
  name: string
  slug: string
  count: number
}

export interface PagedResource<T> {
  total: number
  totalPages: number
  truncated: boolean
  items: T[]
}

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
    categories: PagedResource<WordPressCategory> | null
    tags: PagedResource<WordPressTag> | null
    postsReadable: boolean
  }
  readiness: {
    connection: ConnectionStatus
    draftPublishing: CapabilityStatus
    directPublishing: CapabilityStatus
    mediaUpload: CapabilityStatus
    taxonomyManagement: CapabilityStatus
  }
  warnings: string[]
}

export interface EnvironmentSource {
  get(name: string): string | undefined
}

export interface WordPressConfig {
  siteUrl: URL
  username: string
  applicationPassword: string
  allowedUserId: string
  allowedOrigins: ReadonlySet<string>
  localMode: boolean
}

export interface AuthenticatedCaller {
  id: string
}

export type CallerVerifier = (accessToken: string) => Promise<AuthenticatedCaller>
