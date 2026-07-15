import { describe, expect, it, vi } from 'vitest'
import { createBackupFileName } from './createBackupFileName'
import { downloadBackupFile } from './downloadBackupFile'

describe('backup file', () => {
  it('core 파일명을 Seoul 시간으로 만든다', () => expect(createBackupFileName('core', new Date('2026-07-15T06:30:00Z'))).toBe('daily-brief-note-backup-core-2026-07-15-153000.json'))
  it('full 파일명을 만든다', () => expect(createBackupFileName('full', new Date('2026-07-15T06:30:00Z'))).toContain('backup-full-'))
  it('사용자 정보가 파일명에 들어가지 않는다', () => expect(createBackupFileName('core', new Date())).not.toMatch(/@|owner|user/))
  it('JSON MIME, UTF-8, object URL revoke를 적용한다', () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const blob = downloadBackupFile('{"safe":true}', 'backup.json', { createObjectURL, revokeObjectURL })
    expect(blob.type).toBe('application/json;charset=utf-8')
    expect(blob.size).toBe(new TextEncoder().encode('{"safe":true}').byteLength)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
