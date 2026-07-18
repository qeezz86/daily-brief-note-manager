import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.110.2'

import { PublicationError } from './errors.ts'
import type { CallerDatabase, SourceContent, TaxonomyMapping } from './schemas.ts'

type DbError = { message?: string } | null
type PostRow = {
  id: string; category_id: string; series_no: number | null; briefing_date: string | null; published_on: string | null
  content_status: SourceContent['contentStatus']; updated_at: string; html_body: string | null; slug: string
}
type CategoryRow = { id: string; name: string; content_group: SourceContent['contentGroup']; wrapper_class: string; slug_pattern: string }
type SeoRow = { representative_title: string | null; meta_description: string }
type MappingRow = {
  id: string; site_origin: string; mapping_kind: 'category' | 'tag'; local_key: string; wordpress_taxonomy: 'category' | 'post_tag'
  wordpress_term_id: number; wordpress_term_slug: string; wordpress_term_name: string; verified_at: string | null
}

function databaseFailure(error: DbError): never {
  void error
  throw new PublicationError('PREVIEW_INCOMPLETE', { httpStatus: 500, retryable: true })
}

export function createCallerDatabase(client: SupabaseClient): CallerDatabase {
  return {
    async loadContent(contentId, siteOrigin) {
      const postResult = await client.from('posts').select('id,category_id,series_no,briefing_date,published_on,content_status,updated_at,html_body,slug').eq('id', contentId).maybeSingle()
      if (postResult.error) databaseFailure(postResult.error)
      if (!postResult.data) return null
      const post = postResult.data as unknown as PostRow

      const [categoryResult, seoResult, tagResult] = await Promise.all([
        client.from('categories').select('id,name,content_group,wrapper_class,slug_pattern').eq('id', post.category_id).maybeSingle(),
        client.from('seo_data').select('representative_title,meta_description').eq('post_id', contentId).maybeSingle(),
        client.from('post_tags').select('tag_id,tags!inner(id,name,normalized_name)').eq('post_id', contentId).order('tag_id', { ascending: true }),
      ])
      if (categoryResult.error) databaseFailure(categoryResult.error)
      if (seoResult.error) databaseFailure(seoResult.error)
      if (tagResult.error) databaseFailure(tagResult.error)
      if (!categoryResult.data) throw new PublicationError('PREVIEW_INCOMPLETE', { httpStatus: 500 })
      const category = categoryResult.data as unknown as CategoryRow
      const seo = seoResult.data as unknown as SeoRow | null
      const tags = ((tagResult.data ?? []) as unknown as Array<{ tags: { id: string; name: string; normalized_name: string } | Array<{ id: string; name: string; normalized_name: string }> }>).flatMap((row) => {
        const nested = Array.isArray(row.tags) ? row.tags[0] : row.tags
        return nested ? [{ id: nested.id, name: nested.name, normalizedName: nested.normalized_name }] : []
      })
      void siteOrigin
      return {
        id: post.id, categoryId: category.id, categoryName: category.name, contentGroup: category.content_group,
        wrapperClass: category.wrapper_class, slugPattern: category.slug_pattern, seriesNo: post.series_no,
        briefingDate: post.briefing_date, publishedOn: post.published_on, contentStatus: post.content_status,
        updatedAt: post.updated_at, representativeTitle: seo?.representative_title ?? null,
        metaDescription: seo?.meta_description ?? '', htmlBody: post.html_body, slug: post.slug, tags,
      }
    },
    async readContentUpdatedAt(contentId) {
      const result = await client.from('posts').select('updated_at').eq('id', contentId).maybeSingle()
      if (result.error) databaseFailure(result.error)
      return result.data ? String((result.data as { updated_at: unknown }).updated_at) : null
    },
    async loadMappings(siteOrigin) {
      const result = await client.from('wordpress_taxonomy_mappings')
        .select('id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name,verified_at')
        .eq('site_origin', siteOrigin).order('mapping_kind', { ascending: true }).order('local_key', { ascending: true })
      if (result.error) databaseFailure(result.error)
      return ((result.data ?? []) as unknown as MappingRow[]).map((row): TaxonomyMapping => ({
        id: row.id, siteOrigin: row.site_origin, mappingKind: row.mapping_kind, localKey: row.local_key,
        wordpressTaxonomy: row.wordpress_taxonomy, wordpressTermId: Number(row.wordpress_term_id),
        wordpressTermSlug: row.wordpress_term_slug, wordpressTermName: row.wordpress_term_name, verifiedAt: row.verified_at,
      }))
    },
  }
}
