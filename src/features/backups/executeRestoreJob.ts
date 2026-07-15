import type { DatabaseClient } from '../../shared/supabase/client'
import { runRestoreJobRecord } from './restoreExecution.repository'
import type { RestoreJobRecord } from './restoreExecution.types'

export async function executeRestoreRecords(client: DatabaseClient, records: RestoreJobRecord[], mode: 'pending' | 'failed', options: { onProgress?: (value: { completed: number; total: number; current: string | null }) => void; shouldStop?: () => boolean } = {}) {
  const eligible = [...records].sort((a, b) => a.stageOrder - b.stageOrder || a.sequenceNo - b.sequenceNo).filter((record) => mode === 'pending' ? record.status === 'pending' : record.status === 'failed' && record.retryable)
  const stageOrder = eligible[0]?.stageOrder
  const candidates = eligible.filter((record) => record.stageOrder === stageOrder)
  let processed = 0
  for (let index = 0; index < candidates.length; index += 1) {
    if (options.shouldStop?.()) break
    const record = candidates[index]
    options.onProgress?.({ completed: processed, total: candidates.length, current: record.safeDisplay })
    await runRestoreJobRecord(client, record.id)
    processed += 1
  }
  options.onProgress?.({ completed: processed, total: candidates.length, current: null })
  return { processed }
}
