import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { WordPressPublicationAttempt } from './wordpressDraftCreate.schema'
import { WordPressPostStatusPanel } from './WordPressPostStatusPanel'

const attempt: WordPressPublicationAttempt = { id: '22222222-2222-4222-8222-222222222222', operation: 'create_draft', status: 'succeeded', started_at: null, completed_at: null, created_at: '2026-08-24T00:00:00Z', wordpress_post_id: 1, wordpress_post_status: 'draft', wordpress_post_slug: 'a', wordpress_post_link: 'https://example.com/a', error_code: null, actual_payload_fingerprint: null }
const contentId = '11111111-1111-4111-8111-111111111111'
const success = {
  schemaVersion: 1, ok: true, checkedAt: '2026-08-24T00:00:00.000Z',
  source: { contentId, attemptId: attempt.id },
  stored: { wordpressPostId: 1, status: 'draft', slug: 'a', link: 'https://example.com/a' },
  wordpress: null, reconciliation: { primary: 'REMOTE_NOT_FOUND', deltas: [] },
}
describe('WordPressPostStatusPanel', () => {
  it('does not start a deferred request after unmount', async () => {
    const invoke = vi.fn()
    const { unmount } = render(
      <StrictMode><QueryClientProvider client={new QueryClient()}>
        <WordPressPostStatusPanel client={{ functions: { invoke } } as never} contentId={contentId} attempts={[attempt]} autoStart />
      </QueryClientProvider></StrictMode>,
    )
    unmount()
    await act(async () => { await Promise.resolve() })
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['success', 'error'] as const)('settles the deferred %s after StrictMode effect replay with one request', async (outcome) => {
    let resolveRequest!: (result: { data: unknown; error: unknown }) => void
    const invoke = vi.fn(() => new Promise<{ data: unknown; error: unknown }>((resolve) => { resolveRequest = resolve }))
    render(
      <StrictMode><QueryClientProvider client={new QueryClient()}>
        <WordPressPostStatusPanel client={{ functions: { invoke } } as never} contentId={contentId} attempts={[attempt]} autoStart />
      </QueryClientProvider></StrictMode>,
    )
    await waitFor(() => { expect(invoke).toHaveBeenCalledTimes(1) })
    expect(screen.getByRole('status')).toHaveTextContent('WordPress 상태를 확인하고 있습니다.')
    expect(screen.getByRole('button', { name: 'WordPress 상태 확인 중' })).toBeDisabled()
    await act(async () => {
      resolveRequest(outcome === 'success' ? { data: success, error: null } : { data: null, error: {} })
    })
    if (outcome === 'success') {
      expect(await screen.findByText('WordPress에서 게시물을 찾지 못했습니다. 수동 확인이 필요합니다.')).toBeInTheDocument()
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent('WordPress 상태 확인 응답을 안전하게 확인하지 못했습니다.')
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'WordPress 상태 확인' })).toBeEnabled()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not invoke before the explicit click', async () => {
    const invoke = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><WordPressPostStatusPanel client={{ functions: { invoke } } as never} contentId="11111111-1111-4111-8111-111111111111" attempts={[attempt]} /></QueryClientProvider>)
    expect(screen.getByRole('button', { name: 'WordPress 상태 확인' })).toHaveClass('primary-button')
    expect(invoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'WordPress 상태 확인' }))
    await waitFor(() => { expect(invoke).toHaveBeenCalledTimes(1) })
  })

  it('executes exactly once when reached through the deferred boundary', async () => {
    const invoke = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><WordPressPostStatusPanel client={{ functions: { invoke } } as never} contentId="11111111-1111-4111-8111-111111111111" attempts={[attempt]} autoStart /></QueryClientProvider>)
    await waitFor(() => { expect(invoke).toHaveBeenCalledTimes(1) })
  })
})
