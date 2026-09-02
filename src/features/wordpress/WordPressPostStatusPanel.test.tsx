import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WordPressPublicationAttempt } from './wordpressDraftCreate.schema'
import { WordPressPostStatusPanel } from './WordPressPostStatusPanel'

const attempt: WordPressPublicationAttempt = { id: '22222222-2222-4222-8222-222222222222', operation: 'create_draft', status: 'succeeded', started_at: null, completed_at: null, created_at: '2026-08-24T00:00:00Z', wordpress_post_id: 1, wordpress_post_status: 'draft', wordpress_post_slug: 'a', wordpress_post_link: 'https://example.com/a', error_code: null, actual_payload_fingerprint: null }
describe('WordPressPostStatusPanel', () => {
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
