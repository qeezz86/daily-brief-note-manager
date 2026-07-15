import type { BackupSnapshot, BackupValidationIssue } from './backup.types'
import { calculateBackupChecksum } from './calculateBackupChecksum'

const forbiddenKeys = new Set([
  'ownerid', 'email', 'accesstoken', 'refreshtoken', 'servicerole', 'jwt', 'password',
  'secret', 'authorization', 'cookie', 'rawsql', 'constraint', 'stacktrace',
  'rawpostgresterror', 'proto', 'constructor', 'prototype',
])
const unsafeError = /(bearer\s+[a-z0-9._-]+|sqlstate|constraint|stack[\s_-]*trace|authorization|cookie|password|secret|service[\s_-]*role|access[\s_-]*token|refresh[\s_-]*token|raw[\s_-]*postgrest|\bselect\b.+\bfrom\b|\binsert\b.+\binto\b|\bupdate\b.+\bset\b|\bdelete\b.+\bfrom\b)/i

function issue(code: string, section: string, message: string): BackupValidationIssue {
  return { code, section, message }
}

function inspectValue(value: unknown, depth = 0): boolean {
  if (depth > 30) return false
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength <= 5 * 1024 * 1024
  if (Array.isArray(value)) return value.every((child) => inspectValue(child, depth + 1))
  if (value && typeof value === 'object') {
    return Object.entries(value).every(([key, child]) => {
      const normalized = key.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '')
      return key !== '__proto__' && !forbiddenKeys.has(normalized) && inspectValue(child, depth + 1)
    })
  }
  return true
}

function validDateOrder(start: string | null, end: string | null) {
  return !start || !end || new Date(start).getTime() <= new Date(end).getTime()
}

export async function validateImportHistory(snapshot: BackupSnapshot, cryptoApi?: Crypto): Promise<BackupValidationIssue[]> {
  if (snapshot.profile !== 'full') return []
  const jobs = snapshot.data.importJobs ?? []
  const items = snapshot.data.importJobItems ?? []
  const attempts = snapshot.data.importJobItemAttempts ?? []
  const issues: BackupValidationIssue[] = []
  const categoryGroups = new Map(snapshot.categoryManifest.map((category) => [category.id, category.contentGroup]))
  const itemsByJob = new Map<string, typeof items>()
  const attemptsByItem = new Map<string, typeof attempts>()
  const itemKeys = new Set<string>()
  const attemptKeys = new Set<string>()

  for (const item of items) {
    itemsByJob.set(item.jobId, [...(itemsByJob.get(item.jobId) ?? []), item])
    for (const key of [`${item.jobId}|index|${item.itemIndex}`, `${item.jobId}|external|${item.externalKey}`]) {
      if (itemKeys.has(key)) issues.push(issue('IMPORT_ITEM_KEY_DUPLICATE', 'importJobItems', 'Import item index 또는 external key가 중복됩니다.'))
      itemKeys.add(key)
    }
    const payload = item.normalizedPayload as Record<string, unknown>
    const content = payload?.content as Record<string, unknown> | undefined
    if (!inspectValue(payload) || payload?.schemaVersion !== 1 || payload?.externalKey !== item.externalKey
      || payload?.contentGroup !== categoryGroups.get(item.categoryId) || content?.category_id !== item.categoryId
      || !Object.prototype.hasOwnProperty.call(payload ?? {}, 'tracking')) {
      issues.push(issue('IMPORT_NORMALIZED_PAYLOAD_INVALID', 'importJobItems', 'normalized payload 구조 또는 금지 key 검증에 실패했습니다.'))
    } else if (await calculateBackupChecksum(payload, cryptoApi) !== item.payloadFingerprint) {
      issues.push(issue('IMPORT_PAYLOAD_FINGERPRINT_MISMATCH', 'importJobItems', 'normalized payload fingerprint가 일치하지 않습니다.'))
    }
    if ([item.contentErrorMessage, item.trackingErrorMessage].some((value) => value && unsafeError.test(value))) {
      issues.push(issue('IMPORT_UNSAFE_ERROR', 'importJobItems', 'Import item 오류에 raw DB 또는 민감정보 패턴이 있습니다.'))
    }
    if (item.contentStatus === 'imported' && !item.postId) issues.push(issue('IMPORT_CONTENT_POST_MISSING', 'importJobItems', 'imported 콘텐츠 항목에 post 참조가 없습니다.'))
    if (item.postId && item.contentStatus === 'pending') issues.push(issue('IMPORT_PENDING_POST_CONFLICT', 'importJobItems', 'pending 콘텐츠 항목에 post 참조가 있습니다.'))
    if (item.trackingStatus === 'imported' && item.contentStatus !== 'imported') issues.push(issue('IMPORT_TRACKING_CONTENT_INVALID', 'importJobItems', 'tracking imported 상태에는 content imported가 필요합니다.'))
    if (!validDateOrder(item.contentStartedAt, item.contentCompletedAt) || !validDateOrder(item.trackingStartedAt, item.trackingCompletedAt)) {
      issues.push(issue('IMPORT_ITEM_TIMESTAMP_INVALID', 'importJobItems', 'Import item 완료 시각이 시작 시각보다 빠릅니다.'))
    }
    const group = categoryGroups.get(item.categoryId)
    if (item.trackingStatus === 'not_applicable' && group === 'news') issues.push(issue('IMPORT_TRACKING_NOT_APPLICABLE_INVALID', 'importJobItems', '뉴스 category는 tracking not_applicable을 사용할 수 없습니다.'))
    if (item.trackingStatus === 'not_present' && (group !== 'news' || payload?.tracking !== null)) issues.push(issue('IMPORT_TRACKING_NOT_PRESENT_INVALID', 'importJobItems', 'tracking not_present 상태가 snapshot과 일치하지 않습니다.'))
  }

  for (const attempt of attempts) {
    attemptsByItem.set(attempt.jobItemId, [...(attemptsByItem.get(attempt.jobItemId) ?? []), attempt])
    const key = `${attempt.jobItemId}|${attempt.stage}|${attempt.attemptNo}`
    if (attemptKeys.has(key)) issues.push(issue('IMPORT_ATTEMPT_DUPLICATE', 'importJobItemAttempts', 'Import attempt stage와 번호가 중복됩니다.'))
    attemptKeys.add(key)
    if (attempt.safeErrorMessage && unsafeError.test(attempt.safeErrorMessage)) issues.push(issue('IMPORT_UNSAFE_ERROR', 'importJobItemAttempts', 'Import attempt 오류에 raw DB 또는 민감정보 패턴이 있습니다.'))
    if (!validDateOrder(attempt.startedAt, attempt.completedAt)) issues.push(issue('IMPORT_ATTEMPT_TIMESTAMP_INVALID', 'importJobItemAttempts', 'Import attempt 완료 시각이 시작 시각보다 빠릅니다.'))
  }

  for (const item of items) {
    const rows = attemptsByItem.get(item.id) ?? []
    const content = rows.filter((attempt) => attempt.stage === 'content').sort((a, b) => a.attemptNo - b.attemptNo)
    const tracking = rows.filter((attempt) => attempt.stage === 'tracking').sort((a, b) => a.attemptNo - b.attemptNo)
    if (content.length !== item.contentAttemptCount || tracking.length !== item.trackingAttemptCount
      || content.some((attempt, index) => attempt.attemptNo !== index + 1)
      || tracking.some((attempt, index) => attempt.attemptNo !== index + 1)) {
      issues.push(issue('IMPORT_ATTEMPT_COUNT_MISMATCH', 'importJobItemAttempts', 'item attempt count와 실제 attempt 이력이 일치하지 않습니다.'))
    }
  }

  for (const job of jobs) {
    const jobItems = itemsByJob.get(job.id) ?? []
    if (jobItems.length !== job.totalCount) issues.push(issue('IMPORT_JOB_ITEM_COUNT_MISMATCH', 'importJobs', 'Import job total count와 item 수가 일치하지 않습니다.'))
    if (job.status === 'completed' && jobItems.some((item) => ['pending', 'running', 'failed'].includes(item.contentStatus) || ['pending', 'running', 'failed'].includes(item.trackingStatus))) {
      issues.push(issue('IMPORT_COMPLETED_STATUS_INVALID', 'importJobs', 'completed job에 미완료 또는 실패 item이 있습니다.'))
    }
    if (job.status === 'completed_with_errors' && !jobItems.some((item) => item.contentStatus === 'failed' || item.trackingStatus === 'failed')) {
      issues.push(issue('IMPORT_COMPLETED_WITH_ERRORS_INVALID', 'importJobs', 'completed_with_errors job에는 실패 item이 필요합니다.'))
    }
    if (!validDateOrder(job.startedAt, job.completedAt)) issues.push(issue('IMPORT_JOB_TIMESTAMP_INVALID', 'importJobs', 'Import job 완료 시각이 시작 시각보다 빠릅니다.'))
  }
  return issues
}
