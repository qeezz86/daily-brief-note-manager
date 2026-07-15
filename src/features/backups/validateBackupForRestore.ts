import { BACKUP_FORMAT, BACKUP_SCHEMA_VERSION, BACKUP_SECTIONS_BY_PROFILE } from './backup.constants'
import { backupBundleSchema } from './backup.schema'
import type { BackupSnapshot } from './backup.types'
import { analyzeBackupConflicts } from './analyzeBackupConflicts'
import { buildRestoreAnalysis } from './buildRestoreAnalysis'
import { verifyBackupChecksum, BackupChecksumUnavailableError } from './calculateBackupChecksum'
import { compareCategoryManifest } from './compareCategoryManifest'
import { scanBackupForSecrets } from './scanBackupForSecrets'
import { validateBackupRelationships } from './validateBackupRelationships'
import { backupCategoryRestoreSchema, backupRestoreDataSchema, backupRestoreSectionSchemas, type BackupRestoreSectionName } from './backupRestore.schema'
import type {
  BackupCategoryManifestEntry,
  BackupConflictLookupResult,
  BackupRestoreIssue,
  BackupRestoreResult,
  BackupRestoreValidationOutput,
  RestoreDatabaseCheck,
  ValidatedBackupBundle,
} from './backupRestore.types'

type ObjectValue = Record<string, unknown>

function asObject(value: unknown): ObjectValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null
}

function addIssue(issues: BackupRestoreIssue[], code: string, severity: BackupRestoreIssue['severity'], message: string, path = '$', section = 'backup', detail?: string) {
  issues.push({ code, severity, message, path, section, detail })
}

function emptyResult(issues: BackupRestoreIssue[], checksumStatus: BackupRestoreResult['checksumStatus'] = 'invalid'): BackupRestoreResult {
  return {
    validationVersion: 1, status: 'not_restorable', checksumStatus, databaseCheck: 'not_run',
    compatibility: { schema: 'incompatible', categories: 'incompatible', profile: null },
    summary: { totalRecords: 0, validSections: 0, warningCount: issues.filter((item) => item.severity === 'warning').length, errorCount: issues.filter((item) => item.severity === 'error').length, exactConflicts: 0, idRemapCandidates: 0 },
    issues, sections: [], categoryDifferences: [], conflicts: [], restoreAnalysis: null,
  }
}

function expectedSectionNames(profile: 'core' | 'full') {
  return [...BACKUP_SECTIONS_BY_PROFILE[profile]]
}

function sameStringArray(left: unknown, right: string[]) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index])
}

function referencedCategoryIds(bundle: ValidatedBackupBundle) {
  return new Set([
    ...bundle.data.posts.map((row) => row.categoryId),
    ...bundle.data.seriesCounters.map((row) => row.categoryId),
    ...bundle.data.newsTopics.map((row) => row.categoryId),
    ...bundle.data.generatedPrompts.map((row) => row.categoryId),
    ...(bundle.data.importJobItems ?? []).map((row) => row.categoryId),
  ])
}

export async function validateBackupForRestore(
  input: unknown,
  options: {
    currentCategories: BackupCategoryManifestEntry[]
    lookup?: BackupConflictLookupResult
    cryptoApi?: Crypto
    currentAppVersion?: string | null
    now?: Date
  },
): Promise<BackupRestoreValidationOutput> {
  const issues: BackupRestoreIssue[] = []
  const root = asObject(input)
  if (!root) {
    addIssue(issues, 'BACKUP_DATA_INVALID', 'error', '백업 최상위 값은 object여야 합니다.')
    return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }
  }
  if (root.format === 'daily-brief-note-content-import') {
    addIssue(issues, 'IMPORT_BUNDLE_NOT_SUPPORTED', 'error', '콘텐츠 Import bundle은 백업 복원 검사에서 사용할 수 없습니다.', '$.format', 'format')
    return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }
  }
  if (root.format === undefined) addIssue(issues, 'BACKUP_FORMAT_MISSING', 'error', '백업 format이 없습니다.', '$.format', 'format')
  else if (root.format !== BACKUP_FORMAT) addIssue(issues, 'BACKUP_FORMAT_UNSUPPORTED', 'error', '지원하지 않는 백업 format입니다.', '$.format', 'format')
  if (root.schemaVersion !== BACKUP_SCHEMA_VERSION) addIssue(issues, 'BACKUP_SCHEMA_VERSION_UNSUPPORTED', 'error', '지원하지 않는 백업 schema version입니다.', '$.schemaVersion', 'format')
  if (root.profile !== 'core' && root.profile !== 'full') addIssue(issues, 'BACKUP_PROFILE_INVALID', 'error', '백업 profile은 core 또는 full이어야 합니다.', '$.profile', 'format')
  const checksum = asObject(root.checksum)
  if (!checksum || checksum.algorithm !== 'SHA-256' || typeof checksum.value !== 'string' || !/^[0-9a-f]{64}$/.test(checksum.value)) {
    addIssue(issues, 'BACKUP_CHECKSUM_INVALID', 'error', 'checksum 구조, algorithm 또는 값 형식이 올바르지 않습니다.', '$.checksum', 'checksum')
    return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }
  }
  if (issues.some((item) => item.severity === 'error')) return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }

  let checksumValid: boolean
  try {
    checksumValid = await verifyBackupChecksum(root as { checksum: { value: string }; [key: string]: unknown }, options.cryptoApi)
  } catch (error) {
    if (error instanceof BackupChecksumUnavailableError) {
      addIssue(issues, 'BACKUP_CHECKSUM_UNAVAILABLE', 'error', '이 브라우저에서는 SHA-256 checksum을 검증할 수 없습니다.', '$.checksum', 'checksum')
      return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues, 'unavailable') }
    }
    addIssue(issues, 'BACKUP_CHECKSUM_INVALID', 'error', 'checksum을 재계산하지 못했습니다.', '$.checksum', 'checksum')
    return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }
  }
  if (!checksumValid) {
    addIssue(issues, 'BACKUP_CHECKSUM_MISMATCH', 'error', '백업 내용이 checksum과 일치하지 않습니다.', '$.checksum.value', 'checksum')
    return { bundle: null, data: null, canQueryDatabase: false, result: emptyResult(issues) }
  }

  const secretIssues = scanBackupForSecrets(root)
  secretIssues.forEach((problem) => addIssue(issues, 'BACKUP_SENSITIVE_DATA_FOUND', 'error', problem.message, problem.path, 'security'))

  const profile = root.profile as 'core' | 'full'
  const dataObject = asObject(root.data)
  const manifest = asObject(root.manifest)
  if (!manifest) addIssue(issues, 'BACKUP_MANIFEST_INVALID', 'error', 'manifest가 object가 아닙니다.', '$.manifest', 'manifest')
  if (!dataObject) addIssue(issues, 'BACKUP_DATA_INVALID', 'error', 'data가 object가 아닙니다.', '$.data', 'data')
  const sectionResults: BackupRestoreResult['sections'] = []
  if (dataObject) {
    const expected = expectedSectionNames(profile)
    const actual = Object.keys(dataObject)
    if (!sameStringArray(actual, expected)) addIssue(issues, 'BACKUP_SECTION_SET_MISMATCH', 'error', 'profile과 data section 구성이 일치하지 않습니다.', '$.data', 'data')
    expected.forEach((section) => {
      const parsed = backupRestoreSectionSchemas[section as BackupRestoreSectionName].safeParse(dataObject[section])
      if (parsed.success) sectionResults.push({ section, count: parsed.data.length, status: 'valid', issueCount: 0 })
      else {
        parsed.error.issues.slice(0, 20).forEach((problem) => addIssue(issues, 'BACKUP_SECTION_SCHEMA_INVALID', 'error', `${section} record schema가 올바르지 않습니다.`, `$.data.${section}.${problem.path.join('.')}`, section, problem.message))
        sectionResults.push({ section, count: Array.isArray(dataObject[section]) ? dataObject[section].length : 0, status: 'invalid', issueCount: parsed.error.issues.length })
      }
    })
  }

  if (manifest && dataObject) {
    const expected = expectedSectionNames(profile)
    if (manifest.profile !== profile) addIssue(issues, 'BACKUP_MANIFEST_PROFILE_MISMATCH', 'error', 'manifest profile이 최상위 profile과 다릅니다.', '$.manifest.profile', 'manifest')
    if (!sameStringArray(manifest.sectionNames, expected)) addIssue(issues, 'BACKUP_MANIFEST_SECTION_MISMATCH', 'error', 'manifest section 목록 또는 순서가 profile과 다릅니다.', '$.manifest.sectionNames', 'manifest')
    const counts = asObject(manifest.sectionCounts)
    let total = 0
    expected.forEach((section) => {
      const actual = Array.isArray(dataObject[section]) ? dataObject[section].length : -1
      const declared = counts?.[section]
      if (declared !== actual) addIssue(issues, 'BACKUP_MANIFEST_COUNT_MISMATCH', 'error', `${section} 개수가 manifest와 다릅니다.`, `$.manifest.sectionCounts.${section}`, section)
      if (actual >= 0) total += actual
    })
    if (!counts || Object.keys(counts).length !== expected.length) addIssue(issues, 'BACKUP_MANIFEST_SECTION_COUNT_SET_INVALID', 'error', 'sectionCounts key 구성이 profile과 다릅니다.', '$.manifest.sectionCounts', 'manifest')
    if (manifest.totalRecords !== total) addIssue(issues, 'BACKUP_MANIFEST_TOTAL_MISMATCH', 'error', 'totalRecords가 실제 section 합계와 다릅니다.', '$.manifest.totalRecords', 'manifest')
    if (manifest.generatedPromptCount !== (Array.isArray(dataObject.generatedPrompts) ? dataObject.generatedPrompts.length : -1)) addIssue(issues, 'BACKUP_MANIFEST_PROMPT_COUNT_MISMATCH', 'error', 'generatedPromptCount가 실제 개수와 다릅니다.', '$.manifest.generatedPromptCount', 'manifest')
    if (manifest.includesOperationalHistory !== (profile === 'full')) addIssue(issues, 'BACKUP_MANIFEST_OPERATIONAL_FLAG_INVALID', 'error', 'operational history flag가 profile과 다릅니다.', '$.manifest.includesOperationalHistory', 'manifest')
    if (manifest.snapshotSchemaVersion !== 1) addIssue(issues, 'BACKUP_SNAPSHOT_VERSION_UNSUPPORTED', 'error', '지원하지 않는 snapshot schema version입니다.', '$.manifest.snapshotSchemaVersion', 'manifest')
    if (manifest.relationshipCheck !== 'passed') addIssue(issues, 'BACKUP_RELATIONSHIP_CHECK_INVALID', 'error', '백업 생성 시 관계 검사를 통과하지 못했습니다.', '$.manifest.relationshipCheck', 'manifest')
    const categoryManifest = Array.isArray(manifest.categoryManifest) ? manifest.categoryManifest : []
    if (manifest.categoryManifestCount !== categoryManifest.length) addIssue(issues, 'BACKUP_CATEGORY_MANIFEST_COUNT_MISMATCH', 'error', 'category manifest 개수가 다릅니다.', '$.manifest.categoryManifestCount', 'manifest')
    categoryManifest.forEach((category, index) => {
      const parsed = backupCategoryRestoreSchema.safeParse(category)
      if (!parsed.success) addIssue(issues, 'BACKUP_CATEGORY_MANIFEST_INVALID', 'error', 'category manifest schema가 올바르지 않습니다.', `$.manifest.categoryManifest[${index}]`, 'categoryManifest')
    })
  }

  const topParsed = backupBundleSchema.safeParse(root)
  const dataParsed = dataObject ? backupRestoreDataSchema.safeParse(dataObject) : null
  if (!topParsed.success) addIssue(issues, 'BACKUP_TOP_LEVEL_SCHEMA_INVALID', 'error', '백업 최상위 schema가 version 1 계약과 다릅니다.', '$', 'format')
  if (!dataParsed?.success) {
    if (!issues.some((item) => item.code === 'BACKUP_SECTION_SCHEMA_INVALID')) addIssue(issues, 'BACKUP_DATA_INVALID', 'error', '백업 data schema가 올바르지 않습니다.', '$.data', 'data')
  }
  if (!topParsed.success || !dataParsed?.success || !manifest) {
    const result = emptyResult(issues, 'valid')
    result.sections = sectionResults
    result.compatibility.profile = profile
    return { bundle: null, data: null, canQueryDatabase: false, result }
  }

  const bundle = { ...topParsed.data, data: dataParsed.data } as ValidatedBackupBundle
  const snapshot: BackupSnapshot = {
    profile: bundle.profile, snapshotSchemaVersion: 1,
    categoryManifest: bundle.manifest.categoryManifest,
    sectionCounts: bundle.manifest.sectionCounts, totalRecords: bundle.manifest.totalRecords,
    includesOperationalHistory: bundle.manifest.includesOperationalHistory,
    relationshipCheck: bundle.manifest.relationshipCheck, data: bundle.data,
  }
  const relationships = validateBackupRelationships(snapshot)
  relationships.issues.forEach((problem) => addIssue(issues, problem.code, 'error', problem.message, `$.data.${problem.section}`, problem.section))
  const differences = compareCategoryManifest(bundle.manifest.categoryManifest as BackupCategoryManifestEntry[], options.currentCategories, referencedCategoryIds(bundle))
  differences.forEach((difference) => addIssue(issues, difference.severity === 'error' ? 'BACKUP_CATEGORY_INCOMPATIBLE' : 'BACKUP_CATEGORY_DIFFERENCE', difference.severity, difference.message, `$.manifest.categoryManifest.${difference.categoryId}.${difference.field}`, 'categoryManifest'))
  if (bundle.profile === 'full') addIssue(issues, 'BACKUP_FULL_OPERATIONAL_HISTORY', 'warning', 'full profile에는 Import operational history가 포함되어 복원 정책 확인이 필요합니다.', '$.profile', 'profile')
  if (bundle.appVersion && options.currentAppVersion && bundle.appVersion !== options.currentAppVersion) addIssue(issues, 'BACKUP_APP_VERSION_DIFFERENT', 'warning', '백업과 현재 앱 version이 다릅니다.', '$.appVersion', 'format')
  const now = options.now ?? new Date()
  if (now.getTime() - new Date(bundle.exportedAt).getTime() > 365 * 24 * 60 * 60 * 1000) addIssue(issues, 'BACKUP_TIMESTAMP_OLD', 'warning', '백업 생성 시점이 1년보다 오래되었습니다.', '$.exportedAt', 'format')

  let conflicts: BackupRestoreResult['conflicts'] = []
  let analysis: ReturnType<typeof analyzeBackupConflicts> = { conflicts: [], idPolicyCandidates: { preserve: 0, remapRequired: 0, reuseCandidate: 0, conflict: 0 }, sections: {} }
  const databaseCheck: RestoreDatabaseCheck = options.lookup?.databaseCheck ?? 'not_run'
  if (options.lookup) {
    analysis = analyzeBackupConflicts(bundle, options.lookup)
    conflicts = analysis.conflicts
    if (databaseCheck !== 'complete') addIssue(issues, 'BACKUP_DATABASE_LOOKUP_INCOMPLETE', 'warning', '현재 DB 충돌 조회가 완전하지 않아 다음 단계의 계획 확정을 차단해야 합니다.', '$', 'database')
    conflicts.filter((conflict) => !['safe_new', 'exact_same'].includes(conflict.type)).forEach((conflict) => addIssue(issues, `BACKUP_${conflict.type.toUpperCase()}`, 'warning', conflict.message, `$.data.${conflict.section}`, conflict.section, conflict.reference))
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length
  const warningCount = issues.filter((item) => item.severity === 'warning').length
  const status: BackupRestoreResult['status'] = errorCount ? 'not_restorable' : warningCount ? 'warning' : 'restorable'
  const result: BackupRestoreResult = {
    validationVersion: 1, status, checksumStatus: 'valid', databaseCheck,
    compatibility: { schema: errorCount && issues.some((item) => item.section !== 'categoryManifest' && item.section !== 'database') ? 'incompatible' : 'compatible', categories: differences.some((item) => item.severity === 'error') ? 'incompatible' : differences.length ? 'warning' : 'compatible', profile },
    summary: { totalRecords: bundle.manifest.totalRecords, validSections: sectionResults.filter((section) => section.status === 'valid').length, warningCount, errorCount, exactConflicts: conflicts.filter((conflict) => conflict.type === 'exact_same').length, idRemapCandidates: analysis.idPolicyCandidates.remapRequired },
    issues: issues.sort((left, right) => `${left.severity}|${left.code}|${left.path}`.localeCompare(`${right.severity}|${right.code}|${right.path}`)),
    sections: sectionResults, categoryDifferences: differences, conflicts,
    restoreAnalysis: null,
  }
  if (options.lookup) result.restoreAnalysis = buildRestoreAnalysis({ bundle, differences, lookup: options.lookup, conflicts, idPolicyCandidates: analysis.idPolicyCandidates, sections: analysis.sections, relationshipValid: relationships.valid, secretsValid: secretIssues.length === 0, hasErrors: errorCount > 0, hasWarnings: warningCount > 0 })
  return { bundle, data: bundle.data, canQueryDatabase: errorCount === 0, result }
}
