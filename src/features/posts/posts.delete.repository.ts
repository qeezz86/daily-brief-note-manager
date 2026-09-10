import type { DatabaseClient } from '../../shared/supabase/client'

export type PostDeleteEligibility =
  | 'CHECKING'
  | 'DELETABLE'
  | 'BLOCKED_IMPORT_HISTORY'
  | 'BLOCKED_WORDPRESS_HISTORY'
  | 'BLOCKED_MULTIPLE_HISTORY'
  | 'CHECK_FAILED'

export async function inspectPostDeleteEligibility(
  client: DatabaseClient,
  userId: string,
  postId: string,
): Promise<Exclude<PostDeleteEligibility, 'CHECKING'>> {
  if (!userId.trim() || !postId.trim()) return 'CHECK_FAILED'
  try {
    const [imports, wordpress] = await Promise.all([
      client.from('import_job_items').select('id')
        .eq('owner_id', userId).eq('post_id', postId).limit(1),
      client.from('wordpress_publication_attempts').select('id')
        .eq('owner_id', userId).eq('content_id', postId).limit(1),
    ])
    if (imports.error || wordpress.error || !Array.isArray(imports.data) || !Array.isArray(wordpress.data)) {
      return 'CHECK_FAILED'
    }
    if (imports.data.length && wordpress.data.length) return 'BLOCKED_MULTIPLE_HISTORY'
    if (imports.data.length) return 'BLOCKED_IMPORT_HISTORY'
    if (wordpress.data.length) return 'BLOCKED_WORDPRESS_HISTORY'
    return 'DELETABLE'
  } catch {
    return 'CHECK_FAILED'
  }
}

export async function deletePost(client: DatabaseClient, userId: string, postId: string): Promise<void> {
  // Recheck at submission; FK RESTRICT still arbitrates references added after this read.
  const eligibility = await inspectPostDeleteEligibility(client, userId, postId)
  if (eligibility === 'CHECK_FAILED') throw new Error('삭제 가능 여부를 확인하지 못해 콘텐츠를 삭제하지 않았습니다.')
  if (eligibility !== 'DELETABLE') throw new Error('Import 또는 WordPress 발행 시도 이력 보존을 위해 콘텐츠를 삭제할 수 없습니다.')

  const { data, error } = await client.from('posts').delete()
    .eq('id', postId).eq('owner_id', userId).select('id')
  if (error) {
    const detail = `${error.message ?? ''} ${error.details ?? ''}`
    if (error.code === '23503' && (
      detail.includes('import_job_items_post_id_owner_id_fkey') ||
      detail.includes('wordpress_publication_attempts_post_owner_fkey')
    )) {
      throw new Error('Import 또는 WordPress 발행 시도 이력 보존을 위해 콘텐츠를 삭제할 수 없습니다.')
    }
    throw new Error('콘텐츠를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (!data || data.length !== 1 || data[0].id !== postId) {
    throw new Error('콘텐츠 삭제 결과를 확인하지 못했습니다. 콘텐츠가 없거나 접근 권한이 없습니다.')
  }
}
