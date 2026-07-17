import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext } from '../features/auth/auth-context'
import { AppLayout } from './AppLayout'

describe('AppLayout WordPress navigation', () => {
  it('links to the protected lazy WordPress settings route', () => {
    render(
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
        <MemoryRouter><AppLayout /></MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('link', { name: 'WordPress 연결' })).toHaveAttribute('href', '/settings/wordpress')
  })
})
