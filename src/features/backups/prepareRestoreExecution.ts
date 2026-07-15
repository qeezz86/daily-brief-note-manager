import type { DatabaseClient } from '../../shared/supabase/client'
import { appendRestoreJobRecords, createOrGetRestoreJob, finalizeRestoreJob } from './restoreExecution.repository'
import { buildPreparedRestoreRecords, chunkRestoreRecords } from './prepareRestoreJob'
import type { BackupCategoryManifestEntry, ValidatedBackupBundle } from './backupRestore.types'
import type { RestorePlan } from './restorePlan.types'

export async function prepareRestoreExecution(client: DatabaseClient, input: { bundle: ValidatedBackupBundle; plan: RestorePlan; categories: BackupCategoryManifestEntry[]; sourceName: string | null; onProgress?: (message: string) => void }) {
  const records = await buildPreparedRestoreRecords(input.bundle, input.plan)
  input.onProgress?.(`${records.length}개 불변 record snapshot을 준비했습니다.`)
  const created = await createOrGetRestoreJob(client, { bundle: input.bundle, plan: input.plan, currentCategories: input.categories, records, sourceName: input.sourceName })
  if (created.status !== 'preparing') return created
  const chunks = chunkRestoreRecords(records)
  for (let index = 0; index < chunks.length; index += 1) {
    input.onProgress?.(`snapshot chunk ${index + 1}/${chunks.length} 등록 중`)
    await appendRestoreJobRecords(client, created.jobId, chunks[index])
  }
  input.onProgress?.('DB preflight와 dependency를 최종 검증 중')
  const finalized = await finalizeRestoreJob(client, created.jobId)
  return { ...created, status: finalized.status }
}
