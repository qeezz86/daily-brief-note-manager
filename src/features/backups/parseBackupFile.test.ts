import { describe, expect, it } from 'vitest'
import { BACKUP_RESTORE_MAX_BYTES } from './backupRestore.constants'
import { parseBackupFile, parseBackupText } from './parseBackupFile'

describe('backup restore input parsing', () => {
  it('JSON text를 parse한다', () => expect(parseBackupText('{"safe":true}').value).toEqual({ safe: true }))
  it('UTF-8 BOM을 안전하게 제거한다', () => expect(parseBackupText('\uFEFF{"safe":true}').issues).toEqual([]))
  it('빈 text를 차단한다', () => expect(parseBackupText('  ').issues[0].code).toBe('BACKUP_INPUT_EMPTY'))
  it('JSON 문법 오류를 분류한다', () => expect(parseBackupText('{').issues[0].code).toBe('BACKUP_JSON_PARSE_FAILED'))
  it('100 MiB 초과 text를 차단한다', () => {
    const result = parseBackupText('x'.repeat(BACKUP_RESTORE_MAX_BYTES + 1))
    expect(result.issues[0].code).toBe('BACKUP_FILE_TOO_LARGE')
  })
  it('정상 .json 파일을 읽는다', async () => expect((await parseBackupFile(new File(['{"safe":true}'], 'backup.json'))).value).toEqual({ safe: true }))
  it('대문자 .JSON 확장자를 허용한다', async () => expect((await parseBackupFile(new File(['{}'], 'BACKUP.JSON'))).issues).toEqual([]))
  it('json 이외 확장자를 차단한다', async () => expect((await parseBackupFile(new File(['{}'], 'backup.txt'))).issues[0].code).toBe('BACKUP_FILE_EXTENSION_INVALID'))
  it('빈 파일을 차단한다', async () => expect((await parseBackupFile(new File([], 'backup.json'))).issues[0].code).toBe('BACKUP_INPUT_EMPTY'))
  it('100 MiB 초과 파일을 text로 읽기 전에 차단한다', async () => {
    const file = { name: 'large.json', size: BACKUP_RESTORE_MAX_BYTES + 1, text: () => Promise.reject(new Error('must not read')) } as File
    expect((await parseBackupFile(file)).issues[0].code).toBe('BACKUP_FILE_TOO_LARGE')
  })
})
