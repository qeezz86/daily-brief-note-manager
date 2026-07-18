import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { readyWordPressDiagnostics } from '../features/wordpress/wordpressDiagnostics.fixtures'
import { WordPressSettingsPage } from './WordPressSettingsPage'

const invoke = vi.fn()
vi.mock('../features/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('../features/categories/categories.queries', () => ({ useActiveCategoriesQuery: () => ({ data: [], isLoading: false, isError: false }) }))
vi.mock('../shared/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><WordPressSettingsPage /></QueryClientProvider>)
}

describe('WordPressSettingsPage', () => {
  it('starts idle with no credential form and an accessible status region', () => {
    invoke.mockReset()
    const { container } = renderPage()
    expect(screen.getByRole('heading', { name: 'WordPress 연결' })).toBeInTheDocument()
    expect(screen.getByText('아직 연결 진단을 실행하지 않았습니다.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: '연결 진단' })).toBeEnabled()
    expect(container.querySelector('input')).toBeNull()
  })

  it('disables duplicate execution while loading and renders a ready result', async () => {
    invoke.mockReset()
    let resolveInvoke: ((value: { data: unknown; error: null }) => void) | undefined
    invoke.mockImplementation(() => new Promise((resolve) => { resolveInvoke = resolve }))
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '연결 진단' }))
    expect(screen.getByRole('button', { name: '진단 중' })).toBeDisabled()
    expect(screen.getByText(/안전하게 확인하고 있습니다/)).toHaveAttribute('role', 'status')
    resolveInvoke?.({ data: readyWordPressDiagnostics, error: null })
    expect(await screen.findByRole('heading', { name: '연결 준비됨' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 진단' })).toBeEnabled()
  })

  it('shows a safe alert and retries after failure', async () => {
    invoke.mockReset()
    invoke.mockResolvedValueOnce({ data: null, error: new Error('private raw error') }).mockResolvedValueOnce({ data: readyWordPressDiagnostics, error: null })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '연결 진단' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('WordPress 진단 요청을 완료하지 못했습니다')
    expect(screen.getByRole('alert')).not.toHaveTextContent('private raw error')
    await user.click(screen.getByRole('button', { name: '재시도' }))
    expect(await screen.findByRole('heading', { name: '연결 준비됨' })).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
