import type { DatabaseClient } from '../../shared/supabase/client'
import {
  getNonNewsCategoryDefinition,
} from './nonNewsContexts.constants'
import type {
  NonNewsContextItem,
  SupportedNonNewsCategoryId,
} from './nonNewsContexts.types'

const commonProjection = [
  'id',
  'updated_at',
  'title',
  'slug',
  'summary',
  'published_on',
  'categories!inner(id, name)',
].join(', ')

const projectionByCategory: Readonly<Record<SupportedNonNewsCategoryId, string>> =
  Object.freeze({
    'ai-column': `${commonProjection}, display_id, seo_data(focus_keyword), post_tags(tags(name)), ai_metadata(field_name)`,
    'info-db': `${commonProjection}, display_id, seo_data(focus_keyword), info_db_metadata(field_name)`,
    'chinese-study': `${commonProjection}, series_no, chinese_metadata(program_name, original_title, original_url, learning_topic, learning_points)`,
  })

type Relation<T> = T | readonly T[] | null

interface NonNewsContextRow {
  id: string
  updated_at: string
  display_id?: string | null
  series_no?: number | null
  title: string
  slug: string
  summary: string | null
  published_on: string | null
  categories: Relation<{ id: string; name: string }>
  seo_data?: Relation<{ focus_keyword: string | null }>
  post_tags?: Relation<{ tags: Relation<{ name: string }> }>
  ai_metadata?: Relation<{ field_name: string | null }>
  info_db_metadata?: Relation<{ field_name: string | null }>
  chinese_metadata?: Relation<{
    program_name: string | null
    original_title: string | null
    original_url: string | null
    learning_topic: string | null
    learning_points: string | null
  }>
}

function relationItems<T>(relation: Relation<T> | undefined): readonly T[] {
  if (!relation) return []
  if (Array.isArray(relation)) return relation as readonly T[]
  return [relation as T]
}

function firstRelation<T>(relation: Relation<T> | undefined): T | null {
  return relationItems(relation)[0] ?? null
}

function mapRow(
  row: NonNewsContextRow,
  categoryId: SupportedNonNewsCategoryId,
): NonNewsContextItem {
  const category = firstRelation(row.categories)
  if (!category || category.id !== categoryId || !category.name.trim()) {
    throw new Error('비뉴스 컨텍스트 데이터 형식이 올바르지 않습니다.')
  }

  const seo = firstRelation(row.seo_data)
  const aiMetadata = firstRelation(row.ai_metadata)
  const infoDbMetadata = firstRelation(row.info_db_metadata)
  const chineseMetadata = firstRelation(row.chinese_metadata)
  const tags = relationItems(row.post_tags)
    .flatMap((postTag) => relationItems(postTag.tags))
    .map((tag) => tag.name)

  return {
    displayId: row.display_id ?? null,
    seriesNo: row.series_no ?? null,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    publishedOn: row.published_on,
    focusKeyword: seo?.focus_keyword ?? null,
    tags,
    fieldName: categoryId === 'ai-column'
      ? aiMetadata?.field_name ?? null
      : categoryId === 'info-db'
        ? infoDbMetadata?.field_name ?? null
        : null,
    chineseMetadata: categoryId === 'chinese-study' && chineseMetadata
      ? {
        programName: chineseMetadata.program_name,
        originalTitle: chineseMetadata.original_title,
        originalUrl: chineseMetadata.original_url,
        learningTopic: chineseMetadata.learning_topic,
        learningPoints: chineseMetadata.learning_points,
      }
      : null,
  }
}

export async function listNonNewsContextItems(
  client: DatabaseClient,
  categoryId: SupportedNonNewsCategoryId,
): Promise<NonNewsContextItem[]> {
  const category = getNonNewsCategoryDefinition(categoryId)
  const { data, error } = await client
    .from('posts')
    .select(projectionByCategory[categoryId])
    .eq('categories.id', categoryId)
    .in('content_status', ['ready', 'published'])
    .order('published_on', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(category.limit)

  if (error) {
    throw new Error('비뉴스 중복 방지 컨텍스트를 불러오지 못했습니다.')
  }

  const rows = data as unknown as readonly NonNewsContextRow[]
  return rows.map((row) => mapRow(row, categoryId))
}
