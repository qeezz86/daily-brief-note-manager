import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatabaseClient } from '../../shared/supabase/client'
import { fetchTaxonomyCatalog, prepareWordPressPublication } from './wordpressPublicationPreview.service'
import { getLocalWordPressTags, getTaxonomyMappings, removeTaxonomyMapping, saveTaxonomyMapping, type SaveTaxonomyMappingInput } from './wordpressTaxonomy.repository'

const keys = { catalog: ['wordpress', 'taxonomy-catalog'] as const, mappings: (userId: string, origin: string) => ['wordpress', 'mappings', userId, origin] as const, tags: (userId: string) => ['wordpress', 'local-tags', userId] as const, plan: (postId: string) => ['wordpress', 'publication-plan', postId] as const }
function requireClient(client: DatabaseClient | null) { if (!client) throw new Error('Supabase 연결이 설정되지 않았습니다.'); return client }

export function useTaxonomyCatalogMutation(client: DatabaseClient | null) { return useMutation({ mutationKey: keys.catalog, mutationFn: () => fetchTaxonomyCatalog(client) }) }
export function usePublicationPlanMutation(client: DatabaseClient | null, contentId: string) { return useMutation({ mutationKey: keys.plan(contentId), mutationFn: () => prepareWordPressPublication(client, contentId) }) }
export function useTaxonomyMappingsQuery(client: DatabaseClient | null, userId: string, origin: string) { return useQuery({ queryKey: keys.mappings(userId, origin), queryFn: () => getTaxonomyMappings(requireClient(client), origin), enabled: Boolean(client && userId && origin), retry: false }) }
export function useLocalWordPressTagsQuery(client: DatabaseClient | null, userId: string) { return useQuery({ queryKey: keys.tags(userId), queryFn: () => getLocalWordPressTags(requireClient(client)), enabled: Boolean(client && userId), retry: false }) }
export function useSaveTaxonomyMappingMutation(client: DatabaseClient | null, userId: string, origin: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (input: Omit<SaveTaxonomyMappingInput, 'ownerId' | 'siteOrigin'>) => saveTaxonomyMapping(requireClient(client), { ...input, ownerId: userId, siteOrigin: origin }), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.mappings(userId, origin) }) }) }
export function useRemoveTaxonomyMappingMutation(client: DatabaseClient | null, userId: string, origin: string) { const queryClient = useQueryClient(); return useMutation({ mutationFn: (mappingId: string) => removeTaxonomyMapping(requireClient(client), mappingId), onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.mappings(userId, origin) }) }) }
