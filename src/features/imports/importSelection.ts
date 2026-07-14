import type { ImportDatabaseCheckStatus, ImportItemValidationResult } from './importValidation.types'

export function importItemClientKey(item: ImportItemValidationResult): string {
  if (item.externalKey) return `external:${item.externalKey}`
  const preview = item.normalizedPreview
  return `content:${preview.categoryId}|${preview.slug}|${preview.htmlBody.checksum ?? 'no-html'}`
}

export function defaultImportSelection(items: ImportItemValidationResult[]): Set<string> {
  return new Set(items.filter((item) => item.status === 'ready').map(importItemClientKey))
}

export function isImportItemAllowed(item: ImportItemValidationResult, approvedWarnings: Set<string>) {
  const key = importItemClientKey(item)
  return item.status === 'ready' || (item.status === 'warning' && approvedWarnings.has(key))
}

export function databaseCheckLabel(status: ImportDatabaseCheckStatus) {
  return status === 'complete' ? '완료' : status === 'partial' ? '일부 실패' : '사용 불가'
}
