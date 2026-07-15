import { RESTORE_EXECUTION_STAGE_ORDER } from './restorePlan.constants'
import { restoreRecordKey } from './restorePolicies'
import type { RestoreExecutionStage, RestorePlanIssue, RestoreRecordPlan } from './restorePlan.types'
import type { ValidatedBackupBundle } from './backupRestore.types'

const active = new Set(['create', 'preserve_id', 'remap_id'])
const staged = new Set(['create', 'preserve_id', 'remap_id', 'reuse_existing', 'skip'])

export function topologicalNewsUpdateIds(bundle: ValidatedBackupBundle): { ids: string[]; issues: RestorePlanIssue[] } {
  const rows = bundle.data.newsUpdates
  const ids = new Set(rows.map((row) => row.id))
  const incoming = new Map(rows.map((row) => [row.id, 0]))
  const children = new Map<string, string[]>()
  const issues: RestorePlanIssue[] = []
  rows.forEach((row) => {
    if (!row.previousUpdateId) return
    if (row.previousUpdateId === row.id) issues.push({ code: 'RESTORE_UPDATE_SELF_CYCLE', severity: 'error', message: '뉴스 update가 자기 자신을 previous로 참조합니다.', section: 'newsUpdates', recordKey: restoreRecordKey('newsUpdates', row.id) })
    else if (!ids.has(row.previousUpdateId)) issues.push({ code: 'RESTORE_UPDATE_PREVIOUS_MISSING', severity: 'error', message: 'previous update가 백업에 없습니다.', section: 'newsUpdates', recordKey: restoreRecordKey('newsUpdates', row.id) })
    else {
      incoming.set(row.id, (incoming.get(row.id) ?? 0) + 1)
      children.set(row.previousUpdateId, [...(children.get(row.previousUpdateId) ?? []), row.id].sort())
    }
  })
  const ready = [...incoming].filter(([, count]) => count === 0).map(([id]) => id).sort()
  const ordered: string[] = []
  while (ready.length) {
    const id = ready.shift()!; ordered.push(id)
    for (const child of children.get(id) ?? []) {
      const next = (incoming.get(child) ?? 0) - 1; incoming.set(child, next)
      if (next === 0) { ready.push(child); ready.sort() }
    }
  }
  if (ordered.length !== rows.length && !issues.some((issue) => issue.code === 'RESTORE_UPDATE_SELF_CYCLE')) {
    issues.push({ code: 'RESTORE_UPDATE_CYCLE', severity: 'error', message: '뉴스 previous update graph에 순환 참조가 있습니다.', section: 'newsUpdates' })
  }
  return { ids: ordered, issues }
}

export function buildRestoreExecutionGraph(bundle: ValidatedBackupBundle, actions: RestoreRecordPlan[]) {
  const topology = topologicalNewsUpdateIds(bundle)
  const bySection = new Map<string, RestoreRecordPlan[]>()
  actions.filter((action) => staged.has(action.action)).forEach((action) => bySection.set(action.section, [...(bySection.get(action.section) ?? []), action]))
  const metadata = ['seoData', 'aiMetadata', 'infoDbMetadata', 'chineseMetadata']
  const stageSections: Record<string, string[]> = {
    tags: ['tags'], posts: ['posts'], metadata, postTags: ['postTags'], seriesCounters: ['seriesCounters'], newsTopics: ['newsTopics'],
    newsStatusHistory: ['newsStatusHistory'], newsUpdates: ['newsUpdates'], newsUpdatePreviousLinks: [], sources: ['sources'], newsFollowups: ['newsFollowups'],
    generatedPrompts: ['generatedPrompts'], importJobs: ['importJobs'], importJobItems: ['importJobItems'], importJobItemAttempts: ['importJobItemAttempts'],
  }
  const dependencies: Record<string, string[]> = {
    tags: [], posts: [], metadata: ['posts'], postTags: ['tags', 'posts'], seriesCounters: [], newsTopics: [], newsStatusHistory: ['newsTopics'],
    newsUpdates: ['posts', 'newsTopics'], newsUpdatePreviousLinks: ['newsUpdates'], sources: ['posts', 'newsUpdates'], newsFollowups: ['newsTopics'],
    generatedPrompts: [], importJobs: [], importJobItems: ['importJobs', 'posts'], importJobItemAttempts: ['importJobItems'],
  }
  const updatePosition = new Map(topology.ids.map((id, index) => [id, index]))
  const stages: RestoreExecutionStage[] = RESTORE_EXECUTION_STAGE_ORDER.map((name, index) => {
    let recordKeys = stageSections[name].flatMap((section) => bySection.get(section) ?? []).map((action) => restoreRecordKey(action.section, action.sourceId))
    if (name === 'newsUpdates') recordKeys.sort((left, right) => (updatePosition.get(left.slice('newsUpdates:'.length)) ?? Number.MAX_SAFE_INTEGER) - (updatePosition.get(right.slice('newsUpdates:'.length)) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right))
    else recordKeys.sort()
    if (name === 'newsUpdatePreviousLinks') recordKeys = bundle.data.newsUpdates.filter((row) => row.previousUpdateId && active.has(actions.find((action) => action.section === 'newsUpdates' && action.sourceId === row.id)?.action ?? 'block')).map((row) => restoreRecordKey('newsUpdates', row.id)).sort((left, right) => (updatePosition.get(left.slice('newsUpdates:'.length)) ?? 0) - (updatePosition.get(right.slice('newsUpdates:'.length)) ?? 0))
    return { order: index + 1, name, operation: name === 'newsUpdatePreviousLinks' ? 'link' : name === 'newsUpdates' ? 'insert_without_previous' : name === 'seriesCounters' ? 'counter_max' : 'insert', recordKeys, dependsOn: dependencies[name] }
  })
  return { stages, issues: topology.issues }
}
