import { describe, expect, it, vi } from 'vitest'
import { createBackupFileName } from './createBackupFileName'
import { downloadBackupFile } from './downloadBackupFile'

describe('backup file', () => {
  it('core 파일명을 Seoul 시간으로 만든다', () => expect(createBackupFileName('core', new Date('2026-07-15T06:30:00Z'))).toBe('daily-brief-note-backup-core-2026-07-15-153000.json'))
  it('full 파일명을 만든다', () => expect(createBackupFileName('full', new Date('2026-07-15T06:30:00Z'))).toContain('backup-full-'))
  it('사용자 정보가 파일명에 들어가지 않는다', () => expect(createBackupFileName('core', new Date())).not.toMatch(/@|owner|user/))
  it('JSON MIME, UTF-8, deferred object URL cleanup을 적용한다', () => {
    vi.useFakeTimers()
    const anchor = document.createElement('a')
    const blobConstructor = vi.spyOn(globalThis, 'Blob')
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined)
    const remove = vi.spyOn(anchor, 'remove')

    try {
      const blob = downloadBackupFile('{"safe":true}', 'backup.json', { createObjectURL, revokeObjectURL })

      expect(blobConstructor).toHaveBeenCalledOnce()
      const [blobParts, blobOptions] = blobConstructor.mock.calls[0] ?? []
      expect(blobParts).toHaveLength(1)
      expect(blobParts?.[0]).toBe('{"safe":true}')
      expect(blobOptions).toEqual({ type: 'application/json;charset=utf-8' })
      expect(createObjectURL).toHaveBeenCalledOnce()
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(createElement).toHaveBeenCalledOnce()
      expect(createElement).toHaveBeenCalledWith('a')
      expect(anchor.download).toBe('backup.json')
      expect(click).toHaveBeenCalledOnce()
      expect(remove).not.toHaveBeenCalled()
      expect(document.body.querySelectorAll('a[download="backup.json"]')).toHaveLength(1)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(1)

      vi.runOnlyPendingTimers()

      expect(revokeObjectURL).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
      expect(remove).toHaveBeenCalledOnce()
      expect(document.body.querySelectorAll('a[download="backup.json"]')).toHaveLength(0)
      expect(blobConstructor).toHaveBeenCalledOnce()
      expect(createObjectURL).toHaveBeenCalledOnce()
      expect(click).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.clearAllTimers()
      click.mockRestore()
      remove.mockRestore()
      createElement.mockRestore()
      blobConstructor.mockRestore()
      anchor.remove()
      vi.useRealTimers()
    }
  })
})
