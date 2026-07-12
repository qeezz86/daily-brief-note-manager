import type { Tables } from '../../shared/supabase/database.types'

export const newsUpdateTypes = ['new', 'follow_up', 'correction', 'closure_note'] as const
export type NewsUpdateType = (typeof newsUpdateTypes)[number]
export const newsUpdateTypeLabels: Record<NewsUpdateType, string> = { new: '신규', follow_up: '후속', correction: '정정', closure_note: '종료 메모' }

export type NewsUpdateRow = Pick<Tables<'news_updates'>, 'id' | 'post_id' | 'topic_id' | 'item_order' | 'update_type' | 'headline' | 'fact_summary' | 'importance_summary' | 'impact_summary' | 'change_summary' | 'previous_update_id' | 'created_at' | 'updated_at'>
export interface NewsUpdate extends NewsUpdateRow {
  post: { id: string; title: string; display_id: string | null; briefing_date: string | null }
  topic: { id: string; canonical_title: string; category_id: string; status: string }
  sources: Array<Pick<Tables<'sources'>, 'id' | 'source_name' | 'source_title' | 'source_url' | 'checked_point'>>
}
export type AssignableSource = Pick<Tables<'sources'>, 'id' | 'source_name' | 'source_title' | 'source_url' | 'news_update_id'>
export interface SaveNewsUpdateInput { headline: string; factSummary: string; importanceSummary: string | null; impactSummary: string | null; changeSummary: string | null; previousUpdateId: string | null; sourceIds: string[] }
export interface CreateNewsUpdateInput extends SaveNewsUpdateInput { postId: string; topicId: string; updateType: NewsUpdateType }

