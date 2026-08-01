import type { BackupBundle, BuiltBackup } from './backup.types'

const POSTS_CSV_COLUMNS = [
  'id', 'categoryId', 'seriesNo', 'briefingDate', 'publishedOn', 'displayId',
  'title', 'summary', 'htmlBody', 'slug', 'wordpressUrl', 'contentStatus',
  'publishedAt', 'sourceImportType', 'imagePrompt', 'imageAlt',
  'imagePromptVersion', 'imagePromptUpdatedAt', 'createdAt', 'updatedAt',
] as const

const NEWS_TOPICS_CSV_COLUMNS = [
  'id', 'categoryId', 'topicKey', 'canonicalTitle', 'topicSummary', 'status',
  'closedReason', 'firstSeenAt', 'lastSeenAt', 'createdAt', 'updatedAt',
] as const

const FOLLOW_UPS_CSV_COLUMNS = [
  'id', 'topicId', 'checkText', 'status', 'dueDate', 'priority',
  'resolutionNote', 'resolvedAt', 'createdAt', 'updatedAt',
] as const

const SOURCES_CSV_COLUMNS = [
  'id', 'postId', 'newsUpdateId', 'sourceName', 'sourceTitle', 'sourceUrl',
  'sourcePublishedAt', 'checkedAt', 'checkedPoint', 'sortOrder', 'createdAt',
  'updatedAt',
] as const

export const BACKUP_CSV_DATASETS = [
  { id: 'posts', fileNameId: 'posts', collection: 'posts', columns: POSTS_CSV_COLUMNS },
  { id: 'news_topics', fileNameId: 'news-topics', collection: 'newsTopics', columns: NEWS_TOPICS_CSV_COLUMNS },
  { id: 'follow_ups', fileNameId: 'follow-ups', collection: 'newsFollowups', columns: FOLLOW_UPS_CSV_COLUMNS },
  { id: 'sources', fileNameId: 'sources', collection: 'sources', columns: SOURCES_CSV_COLUMNS },
] as const

export type BackupCsvDatasetId = typeof BACKUP_CSV_DATASETS[number]['id']

type CsvDataset = typeof BACKUP_CSV_DATASETS[number]
type CsvRow = Readonly<Record<string, unknown>>

const UTF8_BOM = '\uFEFF'
const RECORD_SEPARATOR = '\r\n'
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

function getBackupCsvDataset(datasetId: BackupCsvDatasetId): CsvDataset {
  const descriptor = BACKUP_CSV_DATASETS.find((item) => item.id === datasetId)
  if (!descriptor) throw new Error('지원하지 않는 CSV dataset입니다.')
  return descriptor
}

function rowsForDataset(bundle: BackupBundle, datasetId: BackupCsvDatasetId): readonly CsvRow[] {
  switch (datasetId) {
    case 'posts': return bundle.data.posts
    case 'news_topics': return bundle.data.newsTopics
    case 'follow_ups': return bundle.data.newsFollowups
    case 'sources': return bundle.data.sources
  }
}

function assertJsonCompatible(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CSV에 지원되지 않는 값이 있습니다.')
    return
  }
  if (typeof value !== 'object') throw new Error('CSV에 지원되지 않는 값이 있습니다.')
  if (seen.has(value)) throw new Error('CSV에 지원되지 않는 값이 있습니다.')

  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error('CSV에 지원되지 않는 값이 있습니다.')
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    throw new Error('CSV에 지원되지 않는 값이 있습니다.')
  }

  seen.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  children.forEach((child) => assertJsonCompatible(child, seen))
  seen.delete(value)
}

function protectFormulaText(value: string): string {
  const firstEffectiveCharacter = value.trimStart().charAt(0)
  if (/^[\t\r\n]/u.test(value) || /^[=+\-@]/u.test(firstEffectiveCharacter)) {
    return `'${value}`
  }
  return value
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return protectFormulaText(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CSV에 지원되지 않는 값이 있습니다.')
    return String(value)
  }
  assertJsonCompatible(value, new Set())
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('CSV에 지원되지 않는 값이 있습니다.')
  return protectFormulaText(serialized)
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

export function serializeBackupCsv(backup: BuiltBackup, datasetId: BackupCsvDatasetId): string {
  const descriptor = getBackupCsvDataset(datasetId)
  const records = [descriptor.columns.join(',')]

  for (const row of rowsForDataset(backup.bundle, datasetId)) {
    records.push(descriptor.columns.map((column) => escapeCsvField(normalizeCell(row[column]))).join(','))
  }

  return `${UTF8_BOM}${records.join(RECORD_SEPARATOR)}${RECORD_SEPARATOR}`
}

export function createBackupCsvFileName(backup: BuiltBackup, datasetId: BackupCsvDatasetId): string {
  const descriptor = getBackupCsvDataset(datasetId)
  const exportedAt = new Date(backup.bundle.exportedAt)
  if (!Number.isFinite(exportedAt.getTime())) throw new Error('CSV 파일 날짜를 확인할 수 없습니다.')
  const seoulTimestamp = new Date(exportedAt.getTime() + SEOUL_OFFSET_MS).toISOString()
  const date = seoulTimestamp.slice(0, 10)
  const time = seoulTimestamp.slice(11, 19).replace(/:/gu, '')
  return `daily-brief-note-${descriptor.fileNameId}-${date}-${time}.csv`
}
