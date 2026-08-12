import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NonNewsContextPreview } from './NonNewsContextPreview'
import type { NonNewsContextBuildResult } from './nonNewsContexts.types'

const result: NonNewsContextBuildResult = {
  category: { id: 'ai-column', name: 'AI 칼럼', limit: 20 },
  actualCount: 1,
  maxCount: 20,
  text: '[비뉴스 중복 방지 컨텍스트]\n<img src=x onerror="alert(1)">',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NonNewsContextPreview', () => {
  it('renders generated markup-like content as inert textarea text', () => {
    const { container } = render(<NonNewsContextPreview result={result} />)
    expect(screen.getByLabelText('복사용 비뉴스 컨텍스트')).toHaveValue(result.text)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('shows accurate count semantics and an idle copy button', () => {
    render(<NonNewsContextPreview result={result} />)
    expect(screen.getByText('사용 항목 1개 / 최대 20개')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '컨텍스트 복사' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('copies exactly the generated context and shows the copied state', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<NonNewsContextPreview result={result} />)
    await user.click(screen.getByRole('button', { name: '컨텍스트 복사' }))
    expect(writeText).toHaveBeenCalledWith(result.text)
    expect(await screen.findByText('컨텍스트를 복사했습니다.')).toBeInTheDocument()
  })

  it('shows a user-visible copy failure', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<NonNewsContextPreview result={result} />)
    await user.click(screen.getByRole('button', { name: '컨텍스트 복사' }))
    expect(await screen.findByText('컨텍스트를 복사하지 못했습니다.')).toHaveClass('form-alert')
  })

  it('performs no network write while copying', async () => {
    const user = userEvent.setup()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    render(<NonNewsContextPreview result={result} />)
    await user.click(screen.getByRole('button', { name: '컨텍스트 복사' }))
    expect(fetch).not.toHaveBeenCalled()
  })
})
