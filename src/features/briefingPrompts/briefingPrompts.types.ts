export const briefingPromptModes = ['simple', 'standard', 'detailed'] as const
export type BriefingPromptMode = (typeof briefingPromptModes)[number]

export const briefingPromptModeLabels: Record<BriefingPromptMode, string> = {
  simple: '간단',
  standard: '표준',
  detailed: '상세',
}

export interface BriefingPromptCategory {
  id: string
  name: string
  code: string
  wrapperClass: string
  displayIdPattern: string | null
  slugPattern: string
}

export interface BriefingPromptUpdate {
  id: string
  itemOrder: number
  updateType: 'new' | 'follow_up' | 'correction' | 'closure_note'
  headline: string
  factSummary: string
  importanceSummary: string | null
  impactSummary: string | null
  changeSummary: string | null
  topicId: string
  topicKey: string
  topicTitle: string
  previousUpdateId: string | null
}

export interface BriefingPromptPost {
  id: string
  publishedOn: string
  displayId: string | null
  title: string
  summary: string
  updates: BriefingPromptUpdate[]
}

export interface BriefingPromptLatestUpdate {
  id: string
  headline: string
  updateType: BriefingPromptUpdate['updateType']
  factSummary: string
  changeSummary: string | null
  publishedOn: string | null
}

export interface BriefingPromptOpenTopic {
  id: string
  topicKey: string
  canonicalTitle: string
  topicSummary: string | null
  status: 'active' | 'monitoring' | 'reopened'
  firstSeenAt: string
  lastSeenAt: string
  lastClosedReason: string | null
  latestUpdate: BriefingPromptLatestUpdate | null
}

export interface BriefingPromptFollowup {
  id: string
  checkText: string
  priority: 'high' | 'normal' | 'low'
  dueDate: string | null
  overdue: boolean
  topicId: string
  topicKey: string
  topicTitle: string
}

export interface BriefingPromptClosedTopic {
  id: string
  topicKey: string
  canonicalTitle: string
  topicSummary: string | null
  closedReason: string | null
  closedAt: string
  closureNote: {
    headline: string
    factSummary: string
    changeSummary: string | null
  } | null
}

export interface BriefingPromptCounts {
  recentPosts: number
  recentUpdates: number
  openTopics: number
  pendingFollowups: number
  overdueFollowups: number
  recentClosedTopics: number
}

export interface NewsBriefingPromptContext {
  schemaVersion: 1
  referenceDate: string
  category: BriefingPromptCategory
  recentPosts: BriefingPromptPost[]
  openTopics: BriefingPromptOpenTopic[]
  pendingFollowups: BriefingPromptFollowup[]
  recentClosedTopics: BriefingPromptClosedTopic[]
  counts: BriefingPromptCounts
}

export interface BriefingPromptSettings {
  categoryId: string
  referenceDate: string
  mode: BriefingPromptMode
  closedLookbackDays: number
}

export interface SaveBriefingPromptRunInput {
  settings: BriefingPromptSettings
  context: NewsBriefingPromptContext
  promptText: string
}

export interface BriefingPromptRun {
  id: string
  categoryId: string
  referenceDate: string
  promptMode: BriefingPromptMode
  closedLookbackDays: number
  contextSchemaVersion: 1
  contextSnapshot: NewsBriefingPromptContext
  promptText: string
  isPinned: boolean
  generatedAt: string
  requestedPostCount: number
  actualPostCount: number
}

export interface BriefingPromptRunFilters {
  categoryId: string
  promptMode: BriefingPromptMode | ''
  pin: 'all' | 'pinned' | 'unpinned'
}
