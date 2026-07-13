import type { DatabaseClient } from '../../shared/supabase/client'
import { parseNewsBriefingPromptContext } from './briefingPrompts.schema'
import type { BriefingPromptSettings, NewsBriefingPromptContext } from './briefingPrompts.types'

export async function getNewsBriefingPromptContext(
  client: DatabaseClient,
  settings: BriefingPromptSettings,
): Promise<NewsBriefingPromptContext> {
  const { data, error } = await client.rpc('get_news_briefing_prompt_context', {
    p_category_id: settings.categoryId,
    p_reference_date: settings.referenceDate,
    p_recent_post_limit: 5,
    p_closed_lookback_days: settings.closedLookbackDays,
    p_closed_limit: 20,
  })
  if (error) throw new Error('브리핑 프롬프트 데이터를 불러오지 못했습니다.')
  try {
    return parseNewsBriefingPromptContext(data)
  } catch {
    throw new Error('브리핑 프롬프트 데이터 형식이 올바르지 않습니다.')
  }
}
