import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext } from '../features/auth/auth-context'
import { AppLayout } from './AppLayout'

function renderLayout(initialEntry = '/') {
  return render(
    <AuthContext.Provider value={{
      session: null,
      user: { id: 'user-id', email: 'owner@example.com' } as never,
      isLoading: false,
      isConfigured: true,
      sessionError: null,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    }}>
      <MemoryRouter initialEntries={[initialEntry]}><AppLayout /></MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('AppLayout navigation', () => {
  it('links to the protected lazy WordPress settings route', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: 'WordPress 연결' })).toHaveAttribute('href', '/settings/wordpress')
  })

  it('links to and marks the exact non-news context route as current', () => {
    renderLayout('/non-news-contexts')
    const link = screen.getByRole('link', { name: '비뉴스 컨텍스트' })
    expect(link).toHaveAttribute('href', '/non-news-contexts')
    expect(link).toHaveAttribute('aria-current', 'page')
  })
})
