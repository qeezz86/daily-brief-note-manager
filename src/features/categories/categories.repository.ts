import type { DatabaseClient } from '../../shared/supabase/client'
import type { Category } from './categories.types'

const categoryListFields = 'id, content_group, name, sort_order'

export async function getActiveCategories(
  client: DatabaseClient,
): Promise<Category[]> {
  const { data, error } = await client
    .from('categories')
    .select(categoryListFields)
    .eq('enabled', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error('카테고리를 불러오지 못했습니다.')
  }

  return data
}
