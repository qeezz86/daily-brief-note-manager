import type { DatabaseClient } from '../../shared/supabase/client'
import type { Json } from '../../shared/supabase/database.types'
import {
  parseBriefingPromptRun,
  parseNewsBriefingPromptContext,
  validateSaveBriefingPromptRunInput,
} from './briefingPrompts.schema'
import type {
  BriefingPromptRun,
  BriefingPromptSettings,
  NewsBriefingPromptContext,
  SaveBriefingPromptRunInput,
} from './briefingPrompts.types'

const promptRunFields = [
  'id',
  'category_id',
  'reference_date',
  'prompt_mode',
  'closed_lookback_days',
  'context_schema_version',
  'context_snapshot',
  'prompt_text',
  'is_pinned',
  'generated_at',
  'requested_post_count',
  'actual_post_count',
].join(', ')

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

export async function listPromptRuns(client: DatabaseClient): Promise<BriefingPromptRun[]> {
  const { data, error } = await client
    .from('generated_prompts')
    .select(promptRunFields)
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error('프롬프트 이력을 불러오지 못했습니다.')
  try {
    return data.map(parseBriefingPromptRun)
  } catch {
    throw new Error('저장된 프롬프트 이력 형식이 올바르지 않습니다.')
  }
}

export async function getPromptRunById(
  client: DatabaseClient,
  runId: string,
): Promise<BriefingPromptRun | null> {
  const { data, error } = await client
    .from('generated_prompts')
    .select(promptRunFields)
    .eq('id', runId)
    .maybeSingle()
  if (error) throw new Error('프롬프트 이력을 불러오지 못했습니다.')
  if (!data) return null
  try {
    return parseBriefingPromptRun(data)
  } catch {
    throw new Error('저장된 프롬프트 이력 형식이 올바르지 않습니다.')
  }
}

export async function savePromptRun(
  client: DatabaseClient,
  input: SaveBriefingPromptRunInput,
): Promise<BriefingPromptRun> {
  let valid: SaveBriefingPromptRunInput
  try {
    valid = validateSaveBriefingPromptRunInput(input)
  } catch {
    throw new Error('현재 설정과 프롬프트 결과를 다시 확인해 주세요.')
  }
  const { data, error } = await client.rpc('save_news_briefing_prompt_run', {
    p_category_id: valid.settings.categoryId,
    p_reference_date: valid.settings.referenceDate,
    p_prompt_mode: valid.settings.mode,
    p_closed_lookback_days: valid.settings.closedLookbackDays,
    p_context_schema_version: valid.context.schemaVersion,
    p_context_snapshot: valid.context as unknown as Json,
    p_prompt_text: valid.promptText,
  })
  if (error || !data) throw new Error('프롬프트 이력을 저장하지 못했습니다.')
  try {
    return parseBriefingPromptRun(data)
  } catch {
    throw new Error('저장된 프롬프트 이력 형식이 올바르지 않습니다.')
  }
}

export async function setPromptRunPinned(
  client: DatabaseClient,
  runId: string,
  isPinned: boolean,
): Promise<BriefingPromptRun | null> {
  const { data, error } = await client.rpc('set_news_briefing_prompt_run_pinned', {
    p_prompt_run_id: runId,
    p_is_pinned: isPinned,
  })
  if (error) throw new Error('프롬프트 고정 상태를 변경하지 못했습니다.')
  if (!data) return null
  try {
    return parseBriefingPromptRun(data)
  } catch {
    throw new Error('저장된 프롬프트 이력 형식이 올바르지 않습니다.')
  }
}
