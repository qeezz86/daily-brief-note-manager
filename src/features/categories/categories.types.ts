import type { Tables } from '../../shared/supabase/database.types'

export type Category = Pick<
  Tables<'categories'>,
  'id' | 'content_group' | 'name' | 'sort_order'
>
