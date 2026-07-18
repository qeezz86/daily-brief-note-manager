export type MappingKind = 'category' | 'tag'
export type WordPressTaxonomy = 'category' | 'post_tag'

export interface TaxonomyMapping {
  id: string
  siteOrigin: string
  mappingKind: MappingKind
  localKey: string
  wordpressTaxonomy: WordPressTaxonomy
  wordpressTermId: number
  wordpressTermSlug: string
  wordpressTermName: string
  verifiedAt: string | null
}

export interface WordPressCategoryTerm {
  id: number
  name: string
  slug: string
  parent: number
  count: number
}

export interface WordPressTagTerm {
  id: number
  name: string
  slug: string
  count: number
}

export interface TaxonomyCatalog {
  categories: WordPressCategoryTerm[]
  tags: WordPressTagTerm[]
  categoryPages: number
  tagPages: number
}

export interface SourceContent {
  id: string
  categoryId: string
  categoryName: string
  contentGroup: 'news' | 'ai' | 'info_db' | 'chinese'
  wrapperClass: string
  slugPattern: string
  seriesNo: number | null
  briefingDate: string | null
  publishedOn: string | null
  contentStatus: 'draft' | 'ready' | 'published' | 'archived'
  updatedAt: string
  representativeTitle: string | null
  metaDescription: string
  htmlBody: string | null
  slug: string
  tags: Array<{ id: string; name: string; normalizedName: string }>
}

export interface ExistingPostMatch {
  id: number
  slug: string
  status: string
  modifiedGmt: string | null
  link: string | null
}

export interface PlanIssue {
  code: string
  message: string
  detail?: string
}

export interface PublicationPayload {
  title: string
  content: string
  status: 'draft'
  slug: string
  excerpt: string
  categories: number[]
  tags: number[]
}

export interface CallerDatabase {
  loadContent(contentId: string, siteOrigin: string): Promise<SourceContent | null>
  readContentUpdatedAt(contentId: string): Promise<string | null>
  loadMappings(siteOrigin: string): Promise<TaxonomyMapping[]>
}

export interface EnvironmentSource {
  get(name: string): string | undefined
}

export interface AuthenticatedCaller { id: string }
