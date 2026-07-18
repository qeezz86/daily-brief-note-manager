import type { Tables } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'

export type LocalWordPressTag = Pick<Tables<'tags'>, 'id' | 'name' | 'normalized_name'>

export interface SaveTaxonomyMappingInput {
  ownerId: string
  siteOrigin: string
  mappingKind: 'category' | 'tag'
  localKey: string
  wordpressTermId: number
  wordpressTermSlug: string
  wordpressTermName: string
}

export function taxonomyMappingLocalKey(value: string) { return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() }

export async function getTaxonomyMappings(client: DatabaseClient, siteOrigin: string) {
  const { data, error } = await client.from('wordpress_taxonomy_mappings').select('id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name,verified_at,created_at,updated_at').eq('site_origin', siteOrigin).order('mapping_kind').order('local_key')
  if (error) throw new Error('WordPress taxonomy 매핑을 불러오지 못했습니다.')
  return data
}

export async function getLocalWordPressTags(client: DatabaseClient): Promise<LocalWordPressTag[]> {
  const { data, error } = await client.from('tags').select('id,name,normalized_name').order('normalized_name')
  if (error) throw new Error('로컬 태그를 불러오지 못했습니다.')
  return data
}

export async function saveTaxonomyMapping(client: DatabaseClient, input: SaveTaxonomyMappingInput) {
  const { data, error } = await client.from('wordpress_taxonomy_mappings').upsert({ owner_id: input.ownerId, site_origin: input.siteOrigin, mapping_kind: input.mappingKind, local_key: input.localKey, wordpress_taxonomy: input.mappingKind === 'category' ? 'category' : 'post_tag', wordpress_term_id: input.wordpressTermId, wordpress_term_slug: input.wordpressTermSlug, wordpress_term_name: input.wordpressTermName, verified_at: new Date().toISOString() }, { onConflict: 'owner_id,site_origin,mapping_kind,local_key' }).select('id,site_origin,mapping_kind,local_key,wordpress_taxonomy,wordpress_term_id,wordpress_term_slug,wordpress_term_name,verified_at,created_at,updated_at').single()
  if (error) throw new Error('WordPress taxonomy 매핑을 저장하지 못했습니다.')
  return data
}

export async function removeTaxonomyMapping(client: DatabaseClient, mappingId: string) {
  const { error } = await client.from('wordpress_taxonomy_mappings').delete().eq('id', mappingId)
  if (error) throw new Error('WordPress taxonomy 매핑을 제거하지 못했습니다.')
}
