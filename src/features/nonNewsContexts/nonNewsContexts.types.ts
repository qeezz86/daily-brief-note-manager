export type SupportedNonNewsCategoryId =
  | 'ai-column'
  | 'info-db'
  | 'chinese-study'

export interface NonNewsCategoryDefinition {
  id: SupportedNonNewsCategoryId
  name: string
  limit: number
}

export interface ChineseContextMetadata {
  programName: string | null
  originalTitle: string | null
  originalUrl: string | null
  learningTopic: string | null
  learningPoints: string | null
}

export interface NonNewsContextItem {
  displayId: string | null
  seriesNo: number | null
  title: string
  slug: string
  summary: string | null
  publishedOn: string | null
  focusKeyword: string | null
  tags: readonly string[]
  fieldName: string | null
  chineseMetadata: ChineseContextMetadata | null
}

export interface NonNewsContextBuildResult {
  category: NonNewsCategoryDefinition
  actualCount: number
  maxCount: number
  text: string
}
