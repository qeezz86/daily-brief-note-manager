import { BACKUP_RESTORE_MAX_BYTES } from './backupRestore.constants'
import type { BackupRestoreIssue, BackupRestoreParseResult } from './backupRestore.types'

function issue(code: string, message: string): BackupRestoreIssue {
  return { code, severity: 'error', message, path: '$', section: 'input' }
}

export function parseBackupText(text: string): BackupRestoreParseResult {
  const normalized = text.replace(/^\uFEFF/, '')
  const byteSize = new TextEncoder().encode(normalized).byteLength
  if (!normalized.trim()) return { value: null, byteSize, issues: [issue('BACKUP_INPUT_EMPTY', '백업 JSON을 입력해 주세요.')] }
  if (byteSize > BACKUP_RESTORE_MAX_BYTES) return { value: null, byteSize, issues: [issue('BACKUP_FILE_TOO_LARGE', '백업 입력은 100 MiB 이하여야 합니다.')] }
  try {
    return { value: JSON.parse(normalized) as unknown, byteSize, issues: [] }
  } catch {
    return { value: null, byteSize, issues: [issue('BACKUP_JSON_PARSE_FAILED', 'JSON 문법을 확인할 수 없습니다.')] }
  }
}

export async function parseBackupFile(file: File): Promise<BackupRestoreParseResult> {
  if (!file.name.toLocaleLowerCase('en-US').endsWith('.json')) {
    return { value: null, byteSize: file.size, issues: [issue('BACKUP_FILE_EXTENSION_INVALID', '.json 파일만 검사할 수 있습니다.')] }
  }
  if (file.size === 0) return { value: null, byteSize: 0, issues: [issue('BACKUP_INPUT_EMPTY', '빈 백업 파일은 검사할 수 없습니다.')] }
  if (file.size > BACKUP_RESTORE_MAX_BYTES) return { value: null, byteSize: file.size, issues: [issue('BACKUP_FILE_TOO_LARGE', '백업 파일은 100 MiB 이하여야 합니다.')] }
  try {
    return parseBackupText(await file.text())
  } catch {
    return { value: null, byteSize: file.size, issues: [issue('BACKUP_FILE_READ_FAILED', '백업 파일을 읽지 못했습니다.')] }
  }
}
