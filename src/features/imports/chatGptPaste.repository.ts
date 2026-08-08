import { z } from 'zod'
import type { Database, Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  ChatGptPasteRepositoryError,
  type ChatGptPastePersistencePayload,
  type ChatGptPasteRepositoryErrorCategory,
  type SaveChatGptPastePostResult,
} from './chatGptPaste.types'

type SaveChatGptPastePostArgs = Database['public']['Functions']['save_chatgpt_paste_post']['Args']
type SaveChatGptPastePostReturn = Database['public']['Functions']['save_chatgpt_paste_post']['Returns']

const savedPostSchema = z.object({
  postId: z.string().uuid(),
  title: z.string(),
  categoryId: z.string(),
  status: z.string(),
  slug: z.string(),
  displayId: z.string().nullable(),
  publishedOn: z.string().nullable(),
  wordpressUrl: z.string().nullable(),
}).strict()

function errorRecord(value: unknown): { code: string; message: string } {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>
    return {
      code: typeof row.code === 'string' ? row.code : '',
      message: typeof row.message === 'string' ? row.message : '',
    }
  }
  return { code: '', message: '' }
}

const safeMessages: Record<ChatGptPasteRepositoryErrorCategory, string> = {
  unauthenticated: '로그인 세션을 확인한 뒤 다시 시도해 주세요.',
  'forbidden-cross-owner-reference': '현재 사용자에게 허용되지 않은 참조가 포함되어 있습니다.',
  'invalid-input': '저장 입력이 유효하지 않습니다. 미리보기를 다시 생성해 주세요.',
  'missing-required-field': '저장에 필요한 필드가 누락되었습니다. 입력을 확인해 주세요.',
  'unsupported-category-or-enum': '지원하지 않는 카테고리 또는 값이 포함되어 있습니다.',
  'duplicate-or-uniqueness-conflict': '이미 같은 식별자를 사용하는 콘텐츠가 있습니다.',
  'foreign-key-violation': '연결 대상이 없거나 현재 사용자에게 속하지 않습니다.',
  'aggregate-persistence-failure': '콘텐츠를 저장하지 못했습니다. 미리보기를 유지한 채 수동으로 다시 시도할 수 있습니다.',
}

export function mapChatGptPasteRepositoryError(value: unknown) {
  const row = errorRecord(value)
  const upperMessage = row.message.toLocaleUpperCase('en-US')
  let category: ChatGptPasteRepositoryErrorCategory = 'aggregate-persistence-failure'
  if (row.code === '42501' && upperMessage.includes('AUTH')) category = 'unauthenticated'
  else if (row.code === '42501') category = 'forbidden-cross-owner-reference'
  else if (row.code === '23505') category = 'duplicate-or-uniqueness-conflict'
  else if (row.code === '23503') category = 'foreign-key-violation'
  else if (upperMessage.includes('MISSING_REQUIRED')) category = 'missing-required-field'
  else if (upperMessage.includes('CATEGORY') || upperMessage.includes('ENUM') || upperMessage.includes('METADATA')) category = 'unsupported-category-or-enum'
  else if (row.code === '22023' || row.code === '22007' || row.code === '23514') category = 'invalid-input'
  return new ChatGptPasteRepositoryError(category, safeMessages[category])
}

export async function saveChatGptPastePost(
  client: DatabaseClient,
  payload: ChatGptPastePersistencePayload,
): Promise<SaveChatGptPastePostResult> {
  const args: SaveChatGptPastePostArgs = { p_item: payload as unknown as Json }
  const { data, error } = await client.rpc('save_chatgpt_paste_post', args)
  if (error) throw mapChatGptPasteRepositoryError(error)
  const returned: SaveChatGptPastePostReturn = data
  const parsed = savedPostSchema.safeParse(returned)
  if (!parsed.success) throw mapChatGptPasteRepositoryError({ code: 'PGRST202', message: 'response mismatch' })
  return parsed.data
}
