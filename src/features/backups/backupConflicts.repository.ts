import type { DatabaseClient } from '../../shared/supabase/client'
import { canonicalizeJson } from '../../shared/json/canonicalizeJson'
import { queryImportCandidatesInChunks } from '../imports/importDuplicates.repository'
import { normalizeSourceUrl } from '../posts/publicationFields'
import type {
  BackupCategoryManifestEntry,
  BackupConflictLookupResult,
  ExistingRestoreRecord,
  ValidatedBackupBundle,
} from './backupRestore.types'

type QueryResponse<T> = { data: T[] | null; error: unknown }
type ChunkResult<T> = { rows: T[]; successfulChunks: number; failedChunks: number }

function unique<T extends string | number>(values: T[]) {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)))
}

function signature(value: unknown) {
  return canonicalizeJson(value)
}

async function chunks<TValue, TRow>(values: TValue[], query: (values: TValue[]) => PromiseLike<unknown>) {
  return queryImportCandidatesInChunks(values, async (part) => await query(part) as QueryResponse<TRow>)
}

function status(results: Array<ChunkResult<unknown>>): BackupConflictLookupResult['databaseCheck'] {
  const succeeded = results.reduce((sum, result) => sum + result.successfulChunks, 0)
  const failed = results.reduce((sum, result) => sum + result.failedChunks, 0)
  return failed === 0 ? 'complete' : succeeded > 0 ? 'partial' : 'unavailable'
}

export async function getBackupRestoreCategories(client: DatabaseClient): Promise<BackupCategoryManifestEntry[]> {
  const { data, error } = await client.from('categories')
    .select('id, content_group, name, code, wrapper_class, display_id_pattern, slug_pattern, sort_order, enabled')
    .order('sort_order', { ascending: true })
  if (error) throw new Error('현재 카테고리 설정을 불러오지 못했습니다.')
  return data.map((row) => ({ id: row.id, contentGroup: row.content_group, name: row.name, code: row.code, wrapperClass: row.wrapper_class, displayIdPattern: row.display_id_pattern, slugPattern: row.slug_pattern, sortOrder: row.sort_order, enabled: row.enabled }))
}

interface PostRow { id: string; category_id: string; title: string; slug: string; wordpress_url: string | null; series_no: number | null; briefing_date: string | null; published_on: string | null; display_id: string | null }
interface TagRow { id: string; name: string; normalized_name: string }
interface TopicRow { id: string; category_id: string; topic_key: string; canonical_title: string; topic_summary: string | null; status: string }
interface PromptRow { id: string; category_id: string; requested_post_count: number; actual_post_count: number; prompt_mode: string; reference_date: string; closed_lookback_days: number; context_schema_version: number; context_snapshot: unknown; prompt_text: string; generated_at: string }
interface SourceRow { id: string; post_id: string; news_update_id: string | null; source_url: string; sort_order: number }
interface UpdateRow { id: string; post_id: string; topic_id: string; item_order: number; update_type: string; headline: string }
interface FollowupRow { id: string; topic_id: string; check_text: string; status: string }
interface JobRow { id: string; source_fingerprint: string; status: string }
interface ItemRow { id: string; job_id: string; item_index: number; payload_fingerprint: string }
interface AttemptRow { id: string; job_item_id: string; stage: string; attempt_no: number; status: string }
interface PostTagRow { post_id: string; tag_id: string }
interface SeoRow { post_id: string; representative_title: string | null; meta_description: string; focus_keyword: string | null }
interface AiRow { post_id: string; field_name: string | null; difficulty: string | null; estimated_read_min: number | null }
interface InfoRow extends AiRow { reference_date: string | null }
interface ChineseRow { post_id: string; original_url: string | null; original_title: string | null; learning_topic: string | null }
interface CounterRow { category_id: string; last_issued_no: number }
interface HistoryRow { id: string; topic_id: string; to_status: string; changed_at: string }

export async function getBackupConflictReferenceData(client: DatabaseClient, bundle: ValidatedBackupBundle): Promise<BackupConflictLookupResult> {
  const data = bundle.data
  const posts = data.posts
  const postProjection = 'id, category_id, title, slug, wordpress_url, series_no, briefing_date, published_on, display_id'
  const postQueries = await Promise.all([
    chunks<string, PostRow>(unique(posts.map((row) => row.id)), (part) => client.from('posts').select(postProjection).in('id', part)),
    chunks<string, PostRow>(unique(posts.map((row) => String(row.slug)).filter(Boolean)), (part) => client.from('posts').select(postProjection).in('slug', part)),
    chunks<string, PostRow>(unique(posts.map((row) => row.wordpressUrl).filter((value): value is string => Boolean(value))), (part) => client.from('posts').select(postProjection).in('wordpress_url', part)),
    chunks<string, PostRow>(unique(posts.map((row) => row.briefingDate).filter((value): value is string => Boolean(value))), (part) => client.from('posts').select(postProjection).in('briefing_date', part)),
    chunks<number, PostRow>(unique(posts.map((row) => row.seriesNo).filter((value): value is number => typeof value === 'number')), (part) => client.from('posts').select(postProjection).in('series_no', part)),
  ])
  const tagQueries = await Promise.all([
    chunks<string, TagRow>(unique(data.tags.map((row) => row.id)), (part) => client.from('tags').select('id, name, normalized_name').in('id', part)),
    chunks<string, TagRow>(unique(data.tags.map((row) => String(row.normalizedName))), (part) => client.from('tags').select('id, name, normalized_name').in('normalized_name', part)),
  ])
  const topicQueries = await Promise.all([
    chunks<string, TopicRow>(unique(data.newsTopics.map((row) => row.id)), (part) => client.from('news_topics').select('id, category_id, topic_key, canonical_title, topic_summary, status').in('id', part)),
    chunks<string, TopicRow>(unique(data.newsTopics.map((row) => String(row.topicKey))), (part) => client.from('news_topics').select('id, category_id, topic_key, canonical_title, topic_summary, status').in('topic_key', part)),
  ])
  const sourceQuery = await chunks<string, SourceRow>(unique(data.sources.map((row) => row.id)), (part) => client.from('sources').select('id, post_id, news_update_id, source_url, sort_order').in('id', part))
  const updateQuery = await chunks<string, UpdateRow>(unique(data.newsUpdates.map((row) => row.id)), (part) => client.from('news_updates').select('id, post_id, topic_id, item_order, update_type, headline').in('id', part))
  const followupQuery = await chunks<string, FollowupRow>(unique(data.newsFollowups.map((row) => row.id)), (part) => client.from('news_followups').select('id, topic_id, check_text, status').in('id', part))
  const promptQuery = await chunks<string, PromptRow>(unique(data.generatedPrompts.map((row) => row.id)), (part) => client.from('generated_prompts').select('id, category_id, requested_post_count, actual_post_count, prompt_mode, reference_date, closed_lookback_days, context_schema_version, context_snapshot, prompt_text, generated_at').in('id', part))
  const postTagQuery = await chunks<string, PostTagRow>(unique(data.postTags.map((row) => row.postId)), (part) => client.from('post_tags').select('post_id, tag_id').in('post_id', part))
  const seoQuery = await chunks<string, SeoRow>(unique(data.seoData.map((row) => row.postId)), (part) => client.from('seo_data').select('post_id, representative_title, meta_description, focus_keyword').in('post_id', part))
  const aiQuery = await chunks<string, AiRow>(unique(data.aiMetadata.map((row) => row.postId)), (part) => client.from('ai_metadata').select('post_id, field_name, difficulty, estimated_read_min').in('post_id', part))
  const infoQuery = await chunks<string, InfoRow>(unique(data.infoDbMetadata.map((row) => row.postId)), (part) => client.from('info_db_metadata').select('post_id, field_name, difficulty, estimated_read_min, reference_date').in('post_id', part))
  const chineseQuery = await chunks<string, ChineseRow>(unique(data.chineseMetadata.flatMap((row) => [row.postId, ...(row.originalUrl ? [row.originalUrl] : [])])), async (part) => {
    const ids = part.filter((value) => /^[0-9a-f]{8}-/i.test(value))
    const urls = part.filter((value) => !/^[0-9a-f]{8}-/i.test(value))
    const byPost = ids.length ? await client.from('chinese_metadata').select('post_id, original_url, original_title, learning_topic').in('post_id', ids) : { data: [], error: null }
    if (byPost.error) return byPost
    const byUrl = urls.length ? await client.from('chinese_metadata').select('post_id, original_url, original_title, learning_topic').in('original_url', urls) : { data: [], error: null }
    return { data: [...(byPost.data ?? []), ...(byUrl.data ?? [])], error: byUrl.error }
  })
  const counterQuery = await chunks<string, CounterRow>(unique(data.seriesCounters.map((row) => row.categoryId)), (part) => client.from('series_counters').select('category_id, last_issued_no').in('category_id', part))
  const historyQuery = await chunks<string, HistoryRow>(unique(data.newsStatusHistory.map((row) => row.id)), (part) => client.from('news_status_history').select('id, topic_id, to_status, changed_at').in('id', part))
  const jobQuery = await chunks<string, JobRow>(unique((data.importJobs ?? []).flatMap((row) => [row.id, String(row.sourceFingerprint)])), async (part) => {
    const ids = part.filter((value) => value.includes('-'))
    const fingerprints = part.filter((value) => !value.includes('-'))
    const byId = ids.length ? await client.from('import_jobs').select('id, source_fingerprint, status').in('id', ids) : { data: [], error: null }
    if (byId.error) return byId
    const byFingerprint = fingerprints.length ? await client.from('import_jobs').select('id, source_fingerprint, status').in('source_fingerprint', fingerprints) : { data: [], error: null }
    return { data: [...(byId.data ?? []), ...(byFingerprint.data ?? [])], error: byFingerprint.error }
  })
  const itemQuery = await chunks<string, ItemRow>(unique((data.importJobItems ?? []).map((row) => row.id)), (part) => client.from('import_job_items').select('id, job_id, item_index, payload_fingerprint').in('id', part))
  const attemptQuery = await chunks<string, AttemptRow>(unique((data.importJobItemAttempts ?? []).map((row) => row.id)), (part) => client.from('import_job_item_attempts').select('id, job_item_id, stage, attempt_no, status').in('id', part))

  const records: ExistingRestoreRecord[] = []
  const seenPosts = new Map<string, PostRow>()
  postQueries.flatMap((result) => result.rows).forEach((row) => seenPosts.set(row.id, row))
  seenPosts.forEach((row) => {
    const base = { categoryId: row.category_id, title: row.title, slug: row.slug, wordpressUrl: row.wordpress_url, seriesNo: row.series_no, briefingDate: row.briefing_date, publishedOn: row.published_on, displayId: row.display_id }
    const keys = [`slug:${row.slug}`]
    if (row.wordpress_url) keys.push(`wordpressUrl:${row.wordpress_url}`)
    if (row.briefing_date) keys.push(`briefing:${row.category_id}|${row.briefing_date}`)
    if (row.series_no !== null) keys.push(`series:${row.category_id}|${row.series_no}`)
    keys.forEach((key) => records.push({ section: 'posts', id: row.id, key, categoryId: row.category_id, signature: signature(base) }))
  })
  const seenTags = new Map<string, TagRow>()
  tagQueries.flatMap((result) => result.rows).forEach((row) => seenTags.set(row.id, row))
  seenTags.forEach((row) => records.push({ section: 'tags', id: row.id, key: `normalizedName:${row.normalized_name}`, signature: signature({ name: row.name, normalizedName: row.normalized_name }) }))
  const seenTopics = new Map<string, TopicRow>()
  topicQueries.flatMap((result) => result.rows).forEach((row) => seenTopics.set(row.id, row))
  seenTopics.forEach((row) => records.push({ section: 'newsTopics', id: row.id, key: `topic:${row.category_id}|${row.topic_key}`, categoryId: row.category_id, signature: signature({ categoryId: row.category_id, topicKey: row.topic_key, canonicalTitle: row.canonical_title, topicSummary: row.topic_summary, status: row.status }) }))
  sourceQuery.rows.forEach((row) => records.push({ section: 'sources', id: row.id, signature: signature({ postId: row.post_id, newsUpdateId: row.news_update_id, sourceUrl: row.source_url, sortOrder: row.sort_order }) }))
  updateQuery.rows.forEach((row) => records.push({ section: 'newsUpdates', id: row.id, signature: signature({ postId: row.post_id, topicId: row.topic_id, itemOrder: row.item_order, updateType: row.update_type, headline: row.headline }) }))
  followupQuery.rows.forEach((row) => records.push({ section: 'newsFollowups', id: row.id, signature: signature({ topicId: row.topic_id, checkText: row.check_text, status: row.status }) }))
  promptQuery.rows.forEach((row) => records.push({ section: 'generatedPrompts', id: row.id, signature: signature({ categoryId: row.category_id, requestedPostCount: row.requested_post_count, actualPostCount: row.actual_post_count, promptMode: row.prompt_mode, referenceDate: row.reference_date, closedLookbackDays: row.closed_lookback_days, contextSchemaVersion: row.context_schema_version, contextSnapshot: row.context_snapshot, promptText: row.prompt_text, generatedAt: row.generated_at }) }))
  postTagQuery.rows.forEach((row) => records.push({ section: 'postTags', key: `${row.post_id}|${row.tag_id}`, signature: '' }))
  seoQuery.rows.forEach((row) => records.push({ section: 'seoData', key: row.post_id, signature: signature({ postId: row.post_id, representativeTitle: row.representative_title, metaDescription: row.meta_description, focusKeyword: row.focus_keyword }) }))
  aiQuery.rows.forEach((row) => records.push({ section: 'aiMetadata', key: row.post_id, signature: signature({ postId: row.post_id, fieldName: row.field_name, difficulty: row.difficulty, estimatedReadMin: row.estimated_read_min }) }))
  infoQuery.rows.forEach((row) => records.push({ section: 'infoDbMetadata', key: row.post_id, signature: signature({ postId: row.post_id, fieldName: row.field_name, difficulty: row.difficulty, estimatedReadMin: row.estimated_read_min, referenceDate: row.reference_date }) }))
  chineseQuery.rows.forEach((row) => records.push({ section: 'chineseMetadata', key: row.original_url ? `originalUrl:${normalizeSourceUrl(row.original_url).toLocaleLowerCase('en-US')}` : row.post_id, signature: signature({ postId: row.post_id, originalUrl: row.original_url, originalTitle: row.original_title, learningTopic: row.learning_topic }) }))
  counterQuery.rows.forEach((row) => records.push({ section: 'seriesCounters', key: row.category_id, categoryId: row.category_id, signature: signature({ categoryId: row.category_id, lastIssuedNo: row.last_issued_no }), currentValue: row.last_issued_no }))
  historyQuery.rows.forEach((row) => records.push({ section: 'newsStatusHistory', id: row.id, signature: signature({ topicId: row.topic_id, toStatus: row.to_status, changedAt: row.changed_at }) }))
  jobQuery.rows.forEach((row) => records.push({ section: 'importJobs', id: row.id, key: `fingerprint:${row.source_fingerprint}`, signature: signature({ sourceFingerprint: row.source_fingerprint, status: row.status }) }))
  itemQuery.rows.forEach((row) => records.push({ section: 'importJobItems', id: row.id, signature: signature({ jobId: row.job_id, itemIndex: row.item_index, payloadFingerprint: row.payload_fingerprint }) }))
  attemptQuery.rows.forEach((row) => records.push({ section: 'importJobItemAttempts', id: row.id, signature: signature({ jobItemId: row.job_item_id, stage: row.stage, attemptNo: row.attempt_no, status: row.status }) }))

  const allResults: Array<ChunkResult<unknown>> = [...postQueries, ...tagQueries, ...topicQueries, sourceQuery, updateQuery, followupQuery, promptQuery, postTagQuery, seoQuery, aiQuery, infoQuery, chineseQuery, counterQuery, historyQuery, jobQuery, itemQuery, attemptQuery]
  const deduped = new Map(records.map((record) => [`${record.section}|${record.id ?? ''}|${record.key ?? ''}`, record]))
  return { databaseCheck: status(allResults), records: [...deduped.values()].sort((left, right) => `${left.section}|${left.id ?? ''}|${left.key ?? ''}`.localeCompare(`${right.section}|${right.id ?? ''}|${right.key ?? ''}`)) }
}

export async function getBackupRestoreTargetCollisions(
  client: DatabaseClient,
  targets: Array<{ section: string; id: string }>,
) {
  const values = (section: string) => unique(targets.filter((target) => target.section === section).map((target) => target.id))
  const queries = await Promise.all([
    chunks<string, { id: string }>(values('posts'), (part) => client.from('posts').select('id').in('id', part)),
    chunks<string, { id: string }>(values('tags'), (part) => client.from('tags').select('id').in('id', part)),
    chunks<string, { id: string }>(values('sources'), (part) => client.from('sources').select('id').in('id', part)),
    chunks<string, { id: string }>(values('newsTopics'), (part) => client.from('news_topics').select('id').in('id', part)),
    chunks<string, { id: string }>(values('newsStatusHistory'), (part) => client.from('news_status_history').select('id').in('id', part)),
    chunks<string, { id: string }>(values('newsUpdates'), (part) => client.from('news_updates').select('id').in('id', part)),
    chunks<string, { id: string }>(values('newsFollowups'), (part) => client.from('news_followups').select('id').in('id', part)),
    chunks<string, { id: string }>(values('generatedPrompts'), (part) => client.from('generated_prompts').select('id').in('id', part)),
    chunks<string, { id: string }>(values('importJobs'), (part) => client.from('import_jobs').select('id').in('id', part)),
    chunks<string, { id: string }>(values('importJobItems'), (part) => client.from('import_job_items').select('id').in('id', part)),
    chunks<string, { id: string }>(values('importJobItemAttempts'), (part) => client.from('import_job_item_attempts').select('id').in('id', part)),
  ])
  const sections = ['posts', 'tags', 'sources', 'newsTopics', 'newsStatusHistory', 'newsUpdates', 'newsFollowups', 'generatedPrompts', 'importJobs', 'importJobItems', 'importJobItemAttempts']
  return {
    databaseCheck: status(queries),
    collisions: queries.flatMap((query, index) => query.rows.map((row) => ({ section: sections[index], id: row.id }))),
  }
}
