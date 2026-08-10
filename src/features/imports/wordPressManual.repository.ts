import { z } from 'zod'
import type { Database, Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { mapNormalizedImportItemToPayload } from './mapNormalizedImportItemToPayload'
import type { ImportPost } from './importValidation.types'

type Args = Database['public']['Functions']['save_wordpress_manual_post']['Args']
type Return = Database['public']['Functions']['save_wordpress_manual_post']['Returns']

const savedPostSchema = z.object({
  postId: z.string().uuid(), title: z.string(), categoryId: z.string(), status: z.string(), slug: z.string(),
  displayId: z.string().nullable(), publishedOn: z.string().nullable(), wordpressUrl: z.string().nullable(),
}).strict()

export type SaveWordPressManualPostResult = z.infer<typeof savedPostSchema>

export class WordPressManualRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordPressManualRepositoryError'
  }
}

function safeError(value: unknown) {
  const row = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const code = typeof row.code === 'string' ? row.code : ''
  if (code === '42501') return '로그인 세션과 콘텐츠 소유 권한을 확인해 주세요.'
  if (code === '23505') return '같은 식별자를 사용하는 콘텐츠가 이미 있습니다. 중복 검사를 다시 실행해 주세요.'
  if (code === '23503') return '연결 대상이 없거나 현재 사용자에게 속하지 않습니다.'
  if (code === '22023' || code === '22007' || code === '23514') return '저장 입력이 유효하지 않습니다. 미리보기와 검증 결과를 다시 확인해 주세요.'
  return '콘텐츠를 저장하지 못했습니다. 미리보기를 유지한 채 수동으로 다시 시도해 주세요.'
}

export async function saveWordPressManualPost(
  client: DatabaseClient,
  post: ImportPost,
): Promise<SaveWordPressManualPostResult> {
  const payload = mapNormalizedImportItemToPayload(post, 'legacy')
  const args: Args = { p_item: payload as unknown as Json }
  const { data, error } = await client.rpc('save_wordpress_manual_post', args)
  if (error) throw new WordPressManualRepositoryError(safeError(error))
  const returned: Return = data
  const parsed = savedPostSchema.safeParse(returned)
  if (!parsed.success) throw new WordPressManualRepositoryError('저장 결과를 확인하지 못했습니다. 자동 재시도하지 말고 콘텐츠 목록을 확인해 주세요.')
  return parsed.data
}
