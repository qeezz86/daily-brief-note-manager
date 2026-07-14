import type { ImportNewsTracking, ImportTrackingGraphIssue } from './importTracking.types'

export function validateImportTrackingGraph(tracking: ImportNewsTracking): ImportTrackingGraphIssue[] {
  const issues: ImportTrackingGraphIssue[] = []
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message })
  const topicByExternalKey = new Map<string, ImportNewsTracking['topics'][number]>()
  tracking.topics.forEach((topic, index) => {
    if (topicByExternalKey.has(topic.topicExternalKey)) add('IMPORT_TRACKING_DUPLICATE_TOPIC_KEY', `topics[${index}].topicExternalKey`, 'topicExternalKey가 중복되었습니다.')
    else topicByExternalKey.set(topic.topicExternalKey, topic)
  })

  const updateByExternalKey = new Map<string, ImportNewsTracking['updates'][number]>()
  const itemOrders = new Set<number>()
  const sourceOrders = new Set<number>()
  tracking.updates.forEach((update, index) => {
    if (updateByExternalKey.has(update.updateExternalKey)) add('IMPORT_TRACKING_DUPLICATE_UPDATE_KEY', `updates[${index}].updateExternalKey`, 'updateExternalKey가 중복되었습니다.')
    else updateByExternalKey.set(update.updateExternalKey, update)
    if (!topicByExternalKey.has(update.topicExternalKey)) add('IMPORT_TRACKING_TOPIC_CONFLICT', `updates[${index}].topicExternalKey`, 'update가 존재하지 않는 topic을 참조합니다.')
    if (itemOrders.has(update.itemOrder)) add('IMPORT_TRACKING_INVALID_ITEM_ORDER', `updates[${index}].itemOrder`, 'itemOrder가 중복되었습니다.')
    itemOrders.add(update.itemOrder)
    update.sourceOrders.forEach((sourceOrder) => {
      if (sourceOrders.has(sourceOrder)) add('IMPORT_TRACKING_SOURCE_CONFLICT', `updates[${index}].sourceOrders`, '한 source를 여러 update에 연결할 수 없습니다.')
      sourceOrders.add(sourceOrder)
    })
  })

  for (let expected = 1; expected <= tracking.updates.length; expected += 1) {
    if (!itemOrders.has(expected)) add('IMPORT_TRACKING_INVALID_ITEM_ORDER', 'updates', 'itemOrder는 1부터 빈 구간 없이 이어져야 합니다.')
  }

  tracking.updates.forEach((update, index) => {
    const previousKey = update.previousUpdateExternalKey
    if (!previousKey) return
    if (previousKey === update.updateExternalKey) {
      add('IMPORT_TRACKING_PREVIOUS_CYCLE', `updates[${index}].previousUpdateExternalKey`, 'update가 자기 자신을 참조할 수 없습니다.')
      return
    }
    const previous = updateByExternalKey.get(previousKey)
    if (!previous) add('IMPORT_TRACKING_MISSING_PREVIOUS', `updates[${index}].previousUpdateExternalKey`, '같은 payload에서 previous update를 찾을 수 없습니다.')
    else if (previous.topicExternalKey !== update.topicExternalKey) add('IMPORT_TRACKING_TOPIC_CONFLICT', `updates[${index}].previousUpdateExternalKey`, 'previous update는 같은 topic이어야 합니다.')
  })

  const visitState = new Map<string, 0 | 1 | 2>()
  const visit = (key: string): boolean => {
    const state = visitState.get(key) ?? 0
    if (state === 1) return true
    if (state === 2) return false
    visitState.set(key, 1)
    const previous = updateByExternalKey.get(key)?.previousUpdateExternalKey
    const cyclic = previous && updateByExternalKey.has(previous) ? visit(previous) : false
    visitState.set(key, 2)
    return Boolean(cyclic)
  }
  if ([...updateByExternalKey.keys()].some(visit)) add('IMPORT_TRACKING_PREVIOUS_CYCLE', 'updates', 'previous update 관계에 순환 참조가 있습니다.')

  const followupKeys = new Set<string>()
  tracking.followups.forEach((followup, index) => {
    if (followupKeys.has(followup.followupExternalKey)) add('IMPORT_TRACKING_INVALID_FOLLOWUP', `followups[${index}].followupExternalKey`, 'followupExternalKey가 중복되었습니다.')
    followupKeys.add(followup.followupExternalKey)
    const topic = topicByExternalKey.get(followup.topicExternalKey)
    if (!topic) add('IMPORT_TRACKING_INVALID_FOLLOWUP', `followups[${index}].topicExternalKey`, 'followup이 존재하지 않는 topic을 참조합니다.')
    else if (topic.status === 'closed' && followup.status === 'pending') add('IMPORT_TRACKING_INVALID_FOLLOWUP', `followups[${index}].status`, 'closed topic에는 pending followup을 만들 수 없습니다.')
  })

  tracking.updates.forEach((update, index) => {
    if (update.updateType === 'closure_note' && topicByExternalKey.get(update.topicExternalKey)?.status !== 'closed') add('IMPORT_TRACKING_INVALID_CLOSURE', `updates[${index}].updateType`, 'closure_note는 closed topic에만 연결할 수 있습니다.')
  })
  return issues
}
