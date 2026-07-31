export interface DashboardCounts {
  totalPosts: number
  readyPosts: number
  activeNewsTopics: number
  pendingNewsFollowups: number
}

export interface DashboardCategoryCount {
  categoryId: string
  categoryName: string
  postCount: number
}

export interface DashboardRecentPost {
  id: string
  title: string
  categoryId: string
  contentStatus: 'draft' | 'ready' | 'published' | 'archived'
  updatedAt: string
}

export interface DashboardRecentPromptRun {
  id: string
  categoryId: string
  referenceDate: string
  requestedPostCount: number
  actualPostCount: number
  generatedAt: string
}

export interface DashboardOverviewData {
  schemaVersion: 1
  counts: DashboardCounts
  categoryCounts: DashboardCategoryCount[]
  recentPosts: DashboardRecentPost[]
  recentPromptRuns: DashboardRecentPromptRun[]
}
