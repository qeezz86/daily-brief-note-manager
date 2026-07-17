import type { Json } from '../../shared/supabase/database.types'
import type { ImportContentPostPayload } from './importExecution.types'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown) { return typeof value === 'string' ? value : '' }
function nullableText(value: unknown) { return typeof value === 'string' && value.trim() ? value : null }
function nullableNumber(value: unknown) { return typeof value === 'number' && Number.isInteger(value) ? value : null }

function mapMetadata(value: unknown): Json {
  const source = record(value)
  const mapped: Record<string, Json | undefined> = {}
  const mappings = {
    fieldName: 'field_name', difficulty: 'difficulty', estimatedReadMin: 'estimated_read_min',
    referenceDate: 'reference_date', learningTopic: 'learning_topic', programName: 'program_name',
    originalTitle: 'original_title', originalUrl: 'original_url', originalPublishedAt: 'original_published_at',
    episodeListIncluded: 'episode_list_included', verifiedCoreFact: 'verified_core_fact', learningPoints: 'learning_points',
  } as const
  Object.entries(mappings).forEach(([inputKey, outputKey]) => {
    if (Object.hasOwn(source, inputKey)) mapped[outputKey] = source[inputKey] as Json
  })
  return Object.keys(mapped).length ? mapped : null
}

export function mapNormalizedImportItemToPayload(
  value: unknown,
  validationMode: 'strict' | 'legacy' = 'strict',
): ImportContentPostPayload {
  const item = record(value)
  const seo = record(item.seo)
  const image = record(item.image)
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const sources = Array.isArray(item.sources) ? item.sources.map((source, sortOrder) => {
    const row = record(source)
    return {
      source_name: text(row.sourceName).trim(),
      source_title: text(row.sourceTitle).trim(),
      source_url: text(row.sourceUrl).trim(),
      source_published_at: nullableText(row.sourcePublishedAt),
      checked_point: text(row.checkedPoint).trim(),
      sort_order: sortOrder,
    } satisfies Record<string, Json>
  }) : []

  return {
    validation_mode: validationMode,
    category_id: text(item.categoryId).trim(),
    title: text(item.title).trim(),
    summary: text(item.summary).trim(),
    slug: text(item.slug).trim(),
    status: text(item.status),
    briefing_date: nullableText(item.briefingDate),
    published_on: nullableText(item.publishedOn),
    published_at: nullableText(item.publishedAt),
    display_id: nullableText(item.displayId),
    series_no: nullableNumber(item.seriesNo),
    wordpress_url: nullableText(item.wordpressUrl),
    html_body: nullableText(item.htmlBody),
    seo: {
      representative_title: text(seo.representativeTitle),
      alternative_titles: Array.isArray(seo.alternativeTitles)
        ? seo.alternativeTitles.filter((title): title is string => typeof title === 'string')
        : [],
      meta_description: text(seo.metaDescription),
      focus_keyword: text(seo.focusKeyword),
    },
    image: { prompt: text(image.prompt), alt: text(image.alt) },
    tags,
    sources,
    metadata: mapMetadata(item.metadata),
  }
}
