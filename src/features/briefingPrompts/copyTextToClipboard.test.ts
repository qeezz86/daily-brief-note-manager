import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './copyTextToClipboard'

afterEach(() => vi.restoreAllMocks())
describe('copyTextToClipboard', () => {
  it('uses the plain-text clipboard API', async () => { const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); await copyTextToClipboard('plain text'); expect(writeText).toHaveBeenCalledWith('plain text') })
  it('propagates clipboard permission failures', async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }); await expect(copyTextToClipboard('text')).rejects.toThrow('denied') })
  it('falls back to document copy', async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); const execCommand = vi.fn().mockReturnValue(true); Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand }); await expect(copyTextToClipboard('fallback')).resolves.toBeUndefined(); expect(execCommand).toHaveBeenCalledWith('copy') })
})
