import type { DatabaseClient } from '../../shared/supabase/client'
import type { CreateNewsTopicInput, NewsTopic, NewsTopicStatusHistory, TransitionNewsTopicStatusInput, UpdateNewsTopicInput } from './newsTopics.types'

const topicFields = 'id, category_id, topic_key, canonical_title, topic_summary, status, closed_reason, first_seen_at, last_seen_at, created_at, updated_at'

interface RepositoryError { code?: string; message?: string; details?: string }

function throwTopicError(error: RepositoryError): never {
  const detail = `${error.message ?? ''} ${error.details ?? ''}`
  if (error.code === '23505' && detail.includes('topic_key')) throw new Error('같은 카테고리에 동일한 주제 키가 이미 존재합니다.')
  if (error.code === '42501' || detail.includes('NOT_FOUND')) throw new Error('뉴스 주제를 찾을 수 없거나 접근 권한이 없습니다.')
  if (detail.includes('CLOSED_REASON_REQUIRED')) throw new Error('종료 사유를 입력해 주세요.')
  if (detail.includes('REOPEN_REASON_REQUIRED')) throw new Error('재개 사유를 입력해 주세요.')
  if (detail.includes('TRANSITION_INVALID') || detail.includes('STATUS_UNCHANGED')) throw new Error('허용되지 않은 상태 변경입니다.')
  throw new Error('뉴스 주제를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

export async function listNewsTopics(client: DatabaseClient): Promise<NewsTopic[]> {
  const { data, error } = await client.from('news_topics').select(topicFields).order('last_seen_at', { ascending: false }).order('updated_at', { ascending: false })
  if (error) throw new Error('뉴스 주제 목록을 불러오지 못했습니다.')
  return data
}

export async function getNewsTopicById(client: DatabaseClient, topicId: string): Promise<NewsTopic | null> {
  const { data, error } = await client.from('news_topics').select(topicFields).eq('id', topicId).maybeSingle()
  if (error) {
    if (error.code === '22P02' || error.code === 'PGRST116') return null
    throw new Error('뉴스 주제를 불러오지 못했습니다.')
  }
  return data
}

export async function createNewsTopic(client: DatabaseClient, input: CreateNewsTopicInput): Promise<NewsTopic> {
  const { data, error } = await client.from('news_topics').insert({
    owner_id: input.ownerId, category_id: input.categoryId, topic_key: input.topicKey.trim().toLowerCase(),
    canonical_title: input.canonicalTitle.trim(), topic_summary: input.topicSummary,
    status: input.initialStatus, closed_reason: null, first_seen_at: input.firstSeenAt, last_seen_at: input.lastSeenAt,
  }).select(topicFields).single()
  if (error) throwTopicError(error)
  return data
}

export async function updateNewsTopic(client: DatabaseClient, topicId: string, input: UpdateNewsTopicInput): Promise<NewsTopic> {
  const { data, error } = await client.from('news_topics').update({ canonical_title: input.canonicalTitle.trim(), topic_summary: input.topicSummary, last_seen_at: input.lastSeenAt }).eq('id', topicId).select(topicFields).maybeSingle()
  if (error) throwTopicError(error)
  if (!data) throw new Error('뉴스 주제를 찾을 수 없거나 접근 권한이 없습니다.')
  return data
}

export async function transitionNewsTopicStatus(client: DatabaseClient, topicId: string, input: TransitionNewsTopicStatusInput): Promise<NewsTopic> {
  const { data, error } = await client.rpc('transition_news_topic_status', { p_topic_id: topicId, p_target_status: input.targetStatus, p_reason: input.reason! })
  if (error) throwTopicError(error)
  if (!data) throw new Error('뉴스 주제를 찾을 수 없거나 접근 권한이 없습니다.')
  return data
}

export async function listNewsTopicStatusHistory(client: DatabaseClient, topicId: string): Promise<NewsTopicStatusHistory[]> {
  const { data, error } = await client.from('news_status_history').select('id, topic_id, from_status, to_status, reason, changed_at').eq('topic_id', topicId).order('changed_at', { ascending: false })
  if (error) throw new Error('상태 이력을 불러오지 못했습니다.')
  return data
}
