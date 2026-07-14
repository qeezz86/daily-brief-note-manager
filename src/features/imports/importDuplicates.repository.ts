import type { DatabaseClient } from '../../shared/supabase/client'
import { normalizeSourceUrl } from '../posts/publicationFields'
import { IMPORT_DUPLICATE_QUERY_CHUNK_SIZE } from './importValidation.constants'
import type {
  ExistingChineseUrl,
  ExistingImportPost,
  ExistingNewsTopic,
  ImportCategory,
  ImportDuplicateCandidates,
  ImportDuplicateLookupResult,
} from './importValidation.types'

const postProjection = 'category_id, title, slug, display_id, series_no, briefing_date, published_on, wordpress_url'
const chineseProjection = 'original_url, posts!inner(title, category_id, published_on)'
const newsTopicProjection = 'category_id, topic_key, canonical_title, topic_summary, status, closed_reason'

interface ChunkQueryResponse<TRow> {
  data: TRow[] | null
  error: unknown
}

interface ChunkQueryResult<TRow> {
  rows: TRow[]
  successfulChunks: number
  failedChunks: number
}

interface PostRow {
  category_id: string
  title: string
  slug: string
  display_id: string | null
  series_no: number | null
  briefing_date: string | null
  published_on: string | null
  wordpress_url: string | null
}

interface ChineseRow {
  original_url: string | null
  posts: { title: string; category_id: string; published_on: string | null }
}

interface NewsTopicRow {
  category_id: string
  topic_key: string
  canonical_title: string
  topic_summary: string | null
  status: ExistingNewsTopic['status']
  closed_reason: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function uniqueTrimmedStrings(values: unknown[], normalize: (value: string) => string = (value) => value.trim()) {
  const unique = new Set<string>()
  values.forEach((value) => {
    if (typeof value !== 'string') return
    const normalized = normalize(value)
    if (normalized) unique.add(normalized)
  })
  return [...unique]
}

export function collectImportDuplicateCandidates(input: unknown): ImportDuplicateCandidates {
  const root = asRecord(input)
  const posts = Array.isArray(root?.posts) ? root.posts : []
  const records = posts.map(asRecord).filter((post): post is Record<string, unknown> => post !== null)
  const metadata = records.map((post) => asRecord(post.metadata))
  const newsTracking = records.map((post) => asRecord(post.newsTracking))

  return {
    slugs: uniqueTrimmedStrings(records.map((post) => post.slug)),
    wordpressUrls: uniqueTrimmedStrings(records.map((post) => post.wordpressUrl)),
    briefingDates: uniqueTrimmedStrings(records.map((post) => post.briefingDate)),
    seriesNumbers: [...new Set(records
      .map((post) => post.seriesNo)
      .filter((value): value is number => typeof value === 'number' && Number.isInteger(value)))],
    chineseOriginalUrls: uniqueTrimmedStrings(
      metadata.map((value) => value?.originalUrl),
      (value) => normalizeSourceUrl(value).toLocaleLowerCase('en-US'),
    ),
    newsTopicKeys: uniqueTrimmedStrings(
      newsTracking.flatMap((value) => Array.isArray(value?.topics)
        ? value.topics.map((topic) => asRecord(topic)?.topicKey)
        : []),
      (value) => value.trim().toLocaleLowerCase('en-US'),
    ),
  }
}

export async function queryImportCandidatesInChunks<TValue, TRow>(
  values: readonly TValue[],
  queryChunk: (chunk: TValue[]) => Promise<ChunkQueryResponse<TRow>>,
): Promise<ChunkQueryResult<TRow>> {
  const result: ChunkQueryResult<TRow> = { rows: [], successfulChunks: 0, failedChunks: 0 }
  for (let offset = 0; offset < values.length; offset += IMPORT_DUPLICATE_QUERY_CHUNK_SIZE) {
    const chunk = values.slice(offset, offset + IMPORT_DUPLICATE_QUERY_CHUNK_SIZE)
    try {
      const response = await queryChunk(chunk)
      if (response.error) {
        result.failedChunks += 1
      } else {
        result.successfulChunks += 1
        result.rows.push(...(response.data ?? []))
      }
    } catch {
      result.failedChunks += 1
    }
  }
  return result
}

function mergeRowsDeterministically<TRow>(rows: TRow[]) {
  const unique = new Map<string, TRow>()
  rows.forEach((row) => unique.set(JSON.stringify(row), row))
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row)
}

function databaseCheckStatus(successfulChunks: number, failedChunks: number): ImportDuplicateLookupResult['databaseCheck'] {
  if (failedChunks === 0) return 'complete'
  return successfulChunks > 0 ? 'partial' : 'unavailable'
}

export async function getImportCategories(
  client: DatabaseClient,
): Promise<ImportCategory[]> {
  const { data, error } = await client
    .from('categories')
    .select('id, content_group, name, code, wrapper_class, display_id_pattern, slug_pattern, enabled')
    .order('sort_order', { ascending: true })
  if (error) throw new Error('Import 카테고리 설정을 불러오지 못했습니다.')
  return data.map((category) => ({
    id: category.id,
    contentGroup: category.content_group as ImportCategory['contentGroup'],
    name: category.name,
    code: category.code,
    wrapperClass: category.wrapper_class,
    displayIdPattern: category.display_id_pattern,
    slugPattern: category.slug_pattern,
    enabled: category.enabled,
  }))
}

export async function getImportDuplicateReferenceData(
  client: DatabaseClient,
  candidates: ImportDuplicateCandidates,
): Promise<ImportDuplicateLookupResult> {
  const slugRows = await queryImportCandidatesInChunks(candidates.slugs, async (chunk) => {
    const result = await client.from('posts').select(postProjection).in('slug', chunk)
    return result as unknown as ChunkQueryResponse<PostRow>
  })
  const wordpressRows = await queryImportCandidatesInChunks(candidates.wordpressUrls, async (chunk) => {
    const result = await client.from('posts').select(postProjection).in('wordpress_url', chunk)
    return result as unknown as ChunkQueryResponse<PostRow>
  })
  const newsRows = await queryImportCandidatesInChunks(candidates.briefingDates, async (chunk) => {
    const result = await client.from('posts').select(postProjection).in('briefing_date', chunk)
    return result as unknown as ChunkQueryResponse<PostRow>
  })
  const seriesRows = await queryImportCandidatesInChunks(candidates.seriesNumbers, async (chunk) => {
    const result = await client.from('posts').select(postProjection).in('series_no', chunk)
    return result as unknown as ChunkQueryResponse<PostRow>
  })
  const chineseRows = await queryImportCandidatesInChunks(candidates.chineseOriginalUrls, async (chunk) => {
    const result = await client.from('chinese_metadata').select(chineseProjection).in('original_url', chunk)
    return result as unknown as ChunkQueryResponse<ChineseRow>
  })
  const topicRows = await queryImportCandidatesInChunks(candidates.newsTopicKeys, async (chunk) => {
    const result = await client.from('news_topics').select(newsTopicProjection).in('topic_key', chunk)
    return result as unknown as ChunkQueryResponse<NewsTopicRow>
  })

  const chunkResults = [slugRows, wordpressRows, newsRows, seriesRows, chineseRows, topicRows]
  const successfulChunks = chunkResults.reduce((total, result) => total + result.successfulChunks, 0)
  const failedChunks = chunkResults.reduce((total, result) => total + result.failedChunks, 0)
  const posts = mergeRowsDeterministically([
    ...slugRows.rows,
    ...wordpressRows.rows,
    ...newsRows.rows,
    ...seriesRows.rows,
  ]).map((post): ExistingImportPost => ({
    categoryId: post.category_id,
    title: post.title,
    slug: post.slug,
    displayId: post.display_id,
    seriesNo: post.series_no,
    briefingDate: post.briefing_date,
    publishedOn: post.published_on,
    wordpressUrl: post.wordpress_url,
  }))
  const chineseUrls = mergeRowsDeterministically(chineseRows.rows)
    .filter((row): row is ChineseRow & { original_url: string } => Boolean(row.original_url))
    .map((row): ExistingChineseUrl => ({
      originalUrl: row.original_url,
      post: {
        title: row.posts.title,
        categoryId: row.posts.category_id,
        publishedOn: row.posts.published_on,
      },
    }))
  const newsTopics = mergeRowsDeterministically(topicRows.rows)
    .map((topic): ExistingNewsTopic => ({
      categoryId: topic.category_id,
      topicKey: topic.topic_key,
      canonicalTitle: topic.canonical_title,
      topicSummary: topic.topic_summary,
      status: topic.status,
      closedReason: topic.closed_reason,
    }))

  return {
    databaseCheck: databaseCheckStatus(successfulChunks, failedChunks),
    referenceData: { posts, chineseUrls, newsTopics, existingTagKeys: [] },
  }
}
