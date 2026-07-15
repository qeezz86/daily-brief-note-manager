import type { Json } from '../../shared/supabase/database.types'
import { calculateBackupChecksum } from './calculateBackupChecksum'
import { buildRestoreCandidates } from './restorePlanCandidates'
import { restoreRecordKey } from './restorePolicies'
import type { ValidatedBackupBundle } from './backupRestore.types'
import type { RestorePlan, RestoreRecordPlan } from './restorePlan.types'
import type { PreparedRestoreRecord } from './restoreExecution.types'

export const RESTORE_APPEND_MAX_RECORDS = 100
export const RESTORE_APPEND_MAX_BYTES = 4 * 1024 * 1024
const OPERATIONAL = new Set(['importJobs', 'importJobItems', 'importJobItemAttempts'])
const WRITABLE = new Set(['create', 'preserve_id', 'remap_id'])

const fallbackStage: Record<string, string> = {
  tags: 'tags', posts: 'posts', seoData: 'metadata', aiMetadata: 'metadata', infoDbMetadata: 'metadata',
  chineseMetadata: 'metadata', postTags: 'postTags', seriesCounters: 'seriesCounters', newsTopics: 'newsTopics',
  newsStatusHistory: 'newsStatusHistory', newsUpdates: 'newsUpdates', sources: 'sources', newsFollowups: 'newsFollowups',
  generatedPrompts: 'generatedPrompts',
}

function asJson(value: unknown): Json { return value as Json }

function stageFor(plan: RestorePlan, action: RestoreRecordPlan) {
  const key = restoreRecordKey(action.section, action.sourceId)
  return plan.executionStages.find((stage) => stage.operation !== 'link' && stage.recordKeys.includes(key))
    ?? plan.executionStages.find((stage) => stage.name === fallbackStage[action.section])
}

export async function buildPreparedRestoreRecords(bundle: ValidatedBackupBundle, plan: RestorePlan): Promise<PreparedRestoreRecord[]> {
  const rows = new Map(buildRestoreCandidates(bundle).map((candidate) => [restoreRecordKey(candidate.section, candidate.sourceId), candidate.row]))
  const grouped = new Map<number, Array<{ action: RestoreRecordPlan; stageKey: string; payload: Record<string, unknown> }>>()
  for (const action of plan.recordActions) {
    if (OPERATIONAL.has(action.section)) continue
    if (action.action === 'block') throw new Error('RESTORE_PLAN_BLOCK_ACTION')
    const stage = stageFor(plan, action)
    const payload = rows.get(restoreRecordKey(action.section, action.sourceId))
    if (!stage || !payload) throw new Error('RESTORE_PLAN_STAGE_RECORD_MISSING')
    const list = grouped.get(stage.order) ?? []
    list.push({ action, stageKey: stage.name, payload })
    grouped.set(stage.order, list)
  }

  const linkStage = plan.executionStages.find((stage) => stage.name === 'newsUpdatePreviousLinks')
  if (linkStage) {
    const updates = new Map(bundle.data.newsUpdates.map((row) => [row.id, row]))
    for (const key of linkStage.recordKeys) {
      const sourceId = key.slice('newsUpdates:'.length)
      const action = plan.recordActions.find((item) => item.section === 'newsUpdates' && item.sourceId === sourceId)
      const update = updates.get(sourceId)
      if (!action || !update?.previousUpdateId || !WRITABLE.has(action.action)) continue
      const list = grouped.get(linkStage.order) ?? []
      list.push({
        action: { ...action, section: 'newsUpdatePreviousLinks', action: 'create', dependencies: [`newsUpdates:${sourceId}`, `newsUpdates:${update.previousUpdateId}`] },
        stageKey: linkStage.name,
        payload: { updateId: sourceId, previousUpdateId: update.previousUpdateId },
      })
      grouped.set(linkStage.order, list)
    }
  }

  const prepared: PreparedRestoreRecord[] = []
  for (const stageOrder of [...grouped.keys()].sort((a, b) => a - b)) {
    const items = grouped.get(stageOrder)!
    const plannedOrder = plan.executionStages.find((stage) => stage.order === stageOrder)?.recordKeys ?? []
    items.sort((left, right) => {
      const leftKey = restoreRecordKey(left.action.section === 'newsUpdatePreviousLinks' ? 'newsUpdates' : left.action.section, left.action.sourceId)
      const rightKey = restoreRecordKey(right.action.section === 'newsUpdatePreviousLinks' ? 'newsUpdates' : right.action.section, right.action.sourceId)
      const leftIndex = plannedOrder.indexOf(leftKey); const rightIndex = plannedOrder.indexOf(rightKey)
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        || leftKey.localeCompare(rightKey)
    })
    for (let sequenceNo = 0; sequenceNo < items.length; sequenceNo += 1) {
      const item = items[sequenceNo]
      prepared.push({
        section: item.action.section, sourceId: item.action.sourceId, targetId: item.action.targetId,
        action: item.action.action as PreparedRestoreRecord['action'], stageKey: item.stageKey, stageOrder, sequenceNo,
        payload: asJson(item.payload), payloadFingerprint: await calculateBackupChecksum(item.payload),
        dependencies: item.action.dependencies, safeDisplay: item.action.safeDisplay,
      })
    }
  }
  return prepared
}

export function chunkRestoreRecords(records: PreparedRestoreRecord[], maxRecords = RESTORE_APPEND_MAX_RECORDS, maxBytes = RESTORE_APPEND_MAX_BYTES) {
  const chunks: PreparedRestoreRecord[][] = []
  let current: PreparedRestoreRecord[] = []
  let bytes = 2
  for (const record of records) {
    const recordBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength + (current.length ? 1 : 0)
    if (recordBytes + 2 > maxBytes) throw new Error('RESTORE_RECORD_TOO_LARGE')
    if (current.length >= maxRecords || bytes + recordBytes > maxBytes) { chunks.push(current); current = []; bytes = 2 }
    current.push(record); bytes += recordBytes
  }
  if (current.length) chunks.push(current)
  return chunks
}
