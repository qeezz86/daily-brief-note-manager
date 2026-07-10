import type { Tables } from '../../shared/supabase/database.types'

export type Category = Pick<
  Tables<'categories'>,
  | 'id'
  | 'content_group'
  | 'name'
  | 'sort_order'
  | 'display_id_pattern'
  | 'slug_pattern'
  | 'wrapper_class'
>
