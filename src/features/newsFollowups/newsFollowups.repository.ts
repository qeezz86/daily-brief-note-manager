import type { DatabaseClient } from '../../shared/supabase/client'
import type { CreateNewsFollowupInput, NewsFollowup, NewsFollowupRow, ResolveNewsFollowupInput, SaveNewsFollowupInput } from './newsFollowups.types'

const followupFields = 'id, topic_id, check_text, status, due_date, priority, resolution_note, resolved_at, created_at, updated_at'
const detailFields = `${followupFields}, topic:news_topics!news_followups_topic_owner_fkey(id, canonical_title, status, category_id, category:categories!news_topics_category_id_fkey(id, name, content_group))`
interface RepositoryError { code?: string; message?: string; details?: string }
function throwFollowupError(error: RepositoryError): never {
  const detail = `${error.message ?? ''} ${error.details ?? ''}`
  if (detail.includes('CHECK_TEXT')) throw new Error('확인할 내용을 입력해 주세요.')
  if (detail.includes('PRIORITY')) throw new Error('올바른 우선순위를 선택해 주세요.')
  if (detail.includes('RESOLUTION_REQUIRED')) throw new Error('완료 또는 취소 사유를 입력해 주세요.')
  if (detail.includes('ALREADY_RESOLVED')) throw new Error('이미 처리된 후속 항목입니다.')
  if (detail.includes('CLOSED_TOPIC')) throw new Error('종료된 뉴스 주제에는 새 후속 항목을 추가하거나 수정할 수 없습니다.')
  if (error.code === '42501' || detail.includes('NOT_FOUND')) throw new Error('이 후속 항목을 수정할 수 없습니다.')
  throw new Error('후속 확인 항목 저장 중 오류가 발생했습니다.')
}
const asFollowup = (data: unknown) => data as NewsFollowup

export async function listNewsFollowups(client: DatabaseClient): Promise<NewsFollowup[]> {
  const { data, error } = await client.from('news_followups').select(detailFields)
  if (error) throw new Error('후속 확인 목록을 불러오지 못했습니다.')
  return data.map(asFollowup)
}
export async function listTopicNewsFollowups(client: DatabaseClient, topicId: string): Promise<NewsFollowup[]> {
  const { data, error } = await client.from('news_followups').select(detailFields).eq('topic_id', topicId)
  if (error) throw new Error('후속 확인 목록을 불러오지 못했습니다.')
  return data.map(asFollowup)
}
export async function getNewsFollowupById(client: DatabaseClient, id: string): Promise<NewsFollowup | null> {
  const { data, error } = await client.from('news_followups').select(detailFields).eq('id', id).maybeSingle()
  if (error) { if (error.code === '22P02' || error.code === 'PGRST116') return null; throw new Error('후속 확인 항목을 불러오지 못했습니다.') }
  return data ? asFollowup(data) : null
}
export async function createNewsFollowup(client: DatabaseClient, input: CreateNewsFollowupInput): Promise<NewsFollowupRow> {
  const { data, error } = await client.rpc('create_news_followup', { p_topic_id: input.topicId, p_check_text: input.checkText, p_due_date: input.dueDate!, p_priority: input.priority })
  if (error) throwFollowupError(error)
  return data as NewsFollowupRow
}
export async function updateNewsFollowup(client: DatabaseClient, id: string, input: SaveNewsFollowupInput): Promise<NewsFollowupRow> {
  const { data, error } = await client.rpc('update_news_followup', { p_followup_id: id, p_check_text: input.checkText, p_due_date: input.dueDate!, p_priority: input.priority })
  if (error) throwFollowupError(error)
  return data as NewsFollowupRow
}
export async function resolveNewsFollowup(client: DatabaseClient, id: string, input: ResolveNewsFollowupInput): Promise<NewsFollowupRow> {
  const { data, error } = await client.rpc('resolve_news_followup', { p_followup_id: id, p_target_status: input.targetStatus, p_resolution_note: input.resolutionNote })
  if (error) throwFollowupError(error)
  return data as NewsFollowupRow
}

