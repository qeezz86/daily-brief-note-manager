import { z } from 'zod'
import type { Json } from '../../shared/supabase/database.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { mapKnownImportError } from './mapImportError'
import { mapNormalizedImportItemToPayload } from './mapNormalizedImportItemToPayload'
import type { ImportedPostResult, ImportExecutionCandidate, ImportExecutionItemResult, ImportExecutionResult, ImportProgressState } from './importExecution.types'

const importedPostSchema = z.object({
  postId: z.string().uuid(), title: z.string(), categoryId: z.string(), status: z.string(),
  slug: z.string(), displayId: z.string().nullable(), publishedOn: z.string().nullable(), wordpressUrl: z.string().nullable(),
}).strict()

export async function importContentPost(client: DatabaseClient, rawItem: unknown): Promise<ImportedPostResult> {
  const payload = mapNormalizedImportItemToPayload(rawItem)
  const { data, error } = await client.rpc('import_content_post', { p_item: payload as unknown as Json })
  if (error) throw mapKnownImportError(error)
  const parsed = importedPostSchema.safeParse(data)
  if (!parsed.success) throw mapKnownImportError({ code: 'PGRST202', message: 'import_content_post response mismatch' })
  return parsed.data
}

export async function executeSelectedImports(
  candidates: ImportExecutionCandidate[],
  importer: (rawItem: unknown) => Promise<ImportedPostResult>,
  onProgress?: (progress: ImportProgressState) => void,
  initialSkipped: ImportExecutionItemResult[] = [],
  orderedKeys: string[] = [...candidates.map((candidate) => candidate.clientKey), ...initialSkipped.map((item) => item.externalKey)],
): Promise<ImportExecutionResult> {
  const startedAt = new Date().toISOString()
  const items: ImportExecutionItemResult[] = [...initialSkipped]
  let imported = 0
  let failed = 0
  let stopped = false

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (stopped) {
      items.push({ externalKey: candidate.clientKey, title: candidate.title, categoryId: candidate.categoryId, status: 'skipped', errorCode: 'IMPORT_EXECUTION_STOPPED', message: '치명적 오류로 남은 항목을 실행하지 않았습니다.' })
      continue
    }
    onProgress?.({ completed: index, total: candidates.length, currentTitle: candidate.title, imported, failed, skipped: initialSkipped.length })
    try {
      const post = await importer(candidate.rawItem)
      imported += 1
      items.push({ externalKey: candidate.clientKey, title: candidate.title, categoryId: candidate.categoryId, status: 'imported', postId: post.postId, postPath: `/content/${post.postId}` })
    } catch (error) {
      const safe = mapKnownImportError(error)
      failed += 1
      items.push({ externalKey: candidate.clientKey, title: candidate.title, categoryId: candidate.categoryId, status: 'failed', errorCode: safe.errorCode, message: safe.message })
      stopped = safe.stopExecution
    }
  }

  const ordered = [...items].sort((left, right) => orderedKeys.indexOf(left.externalKey) - orderedKeys.indexOf(right.externalKey))
  const skipped = ordered.filter((item) => item.status === 'skipped').length
  onProgress?.({ completed: candidates.length, total: candidates.length, currentTitle: null, imported, failed, skipped })
  return { startedAt, completedAt: new Date().toISOString(), total: ordered.length, imported, failed, skipped, items: ordered }
}
