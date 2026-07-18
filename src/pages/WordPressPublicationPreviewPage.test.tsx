import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WordPressPublicationPreviewPage } from './WordPressPublicationPreviewPage'

const mocks = vi.hoisted(() => ({
  post: { isLoading: false, isError: false, data: { title: '콘텐츠', updated_at: '2026-07-18T00:00:00Z' } } as Record<string, unknown>,
  preview: { isIdle: true, isPending: false, isError: false, data: undefined, error: undefined, mutate: vi.fn() } as Record<string, unknown>,
}))
vi.mock('../features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner-1' } }) }))
vi.mock('../features/posts/posts.queries', () => ({ usePostQuery: () => mocks.post }))
vi.mock('../features/wordpress/wordpressPublicationPreview.queries', () => ({ usePublicationPlanMutation: () => mocks.preview }))
vi.mock('../shared/supabase/client', () => ({ supabase: {} }))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/content/10000000-0000-4000-8000-000000000001/wordpress-preview']}><Routes><Route path="/content/:postId/wordpress-preview" element={<WordPressPublicationPreviewPage />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('WordPressPublicationPreviewPage', () => {
  beforeEach(() => {
    Object.assign(mocks.post, { isLoading: false, isError: false, data: { title: '콘텐츠', updated_at: '2026-07-18T00:00:00Z' } })
    Object.assign(mocks.preview, { isIdle: true, isPending: false, isError: false, data: undefined, error: undefined })
    ;(mocks.preview.mutate as ReturnType<typeof vi.fn>).mockReset()
  })

  it('idle 상태에서 명시적 Dry Run만 제공한다', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('아직 Dry Run을 실행하지 않았습니다.')
    await userEvent.click(screen.getByRole('button', { name: 'Dry Run 실행' }))
    expect(mocks.preview.mutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /게시|발행|초안 생성/ })).not.toBeInTheDocument()
  })

  it('source loading 상태를 표시한다', () => {
    Object.assign(mocks.post, { isLoading: true, data: undefined })
    renderPage()
    expect(screen.getByRole('heading', { name: '콘텐츠를 불러오는 중입니다' })).toBeInTheDocument()
  })

  it('안전한 오류와 재시도를 표시한다', async () => {
    Object.assign(mocks.preview, { isIdle: false, isError: true, error: new Error('안전한 요청 오류') })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('안전한 요청 오류')
    await userEvent.click(screen.getByRole('button', { name: '재시도' }))
    expect(mocks.preview.mutate).toHaveBeenCalledTimes(1)
  })
})
