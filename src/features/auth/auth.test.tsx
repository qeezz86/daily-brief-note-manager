import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { routes } from '../../app/router'
import { AuthProvider } from './AuthProvider'

const user: User = {
  id: '00000000-0000-0000-0000-0000000000a1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-07-10T00:00:00.000Z',
}

const session: Session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: 1_783_641_600,
  token_type: 'bearer',
  user,
}

interface MockClientOptions {
  initialSession?: Session | null
  sessionPromise?: Promise<{
    data: { session: Session | null }
    error: null
  }>
}

function createMockClient({
  initialSession = null,
  sessionPromise,
}: MockClientOptions = {}) {
  const unsubscribe = vi.fn()
  const auth = {
    getSession: vi.fn(() =>
      sessionPromise
        ? sessionPromise
        : Promise.resolve({
            data: { session: initialSession },
            error: null,
          }),
    ),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe } },
    })),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }

  return {
    auth,
    client: { auth } as unknown as SupabaseClient,
  }
}

function renderApp(
  client: SupabaseClient | null,
  initialEntry = '/dashboard',
) {
  const router = createMemoryRouter(routes, {
    initialEntries: [initialEntry],
  })

  return render(
    <AuthProvider client={client}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
}

describe('authentication foundation', () => {
  it('shows an explicit error when Supabase is not configured', () => {
    renderApp(null, '/content')

    expect(
      screen.getByRole('heading', {
        name: 'Supabase 연결을 설정해 주세요',
      }),
    ).toBeInTheDocument()
  })

  it('shows the authentication loading state while restoring a session', () => {
    const sessionPromise = new Promise<{
      data: { session: Session | null }
      error: null
    }>(() => undefined)
    const { client } = createMockClient({ sessionPromise })

    renderApp(client)

    expect(
      screen.getByText('세션을 확인하고 있습니다.'),
    ).toBeInTheDocument()
  })

  it('redirects an unauthenticated user from a protected route', async () => {
    const { client } = createMockClient()

    renderApp(client, '/content')

    expect(
      await screen.findByRole('heading', { name: '관리자 로그인' }),
    ).toBeInTheDocument()
  })

  it('protects the news topic route for unauthenticated users', async () => {
    const { client } = createMockClient()
    renderApp(client, '/news-topics')
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  })

  it('shows the configuration error on the news topic route without Supabase', () => {
    renderApp(null, '/news-topics')
    expect(screen.getByRole('heading', { name: 'Supabase 연결을 설정해 주세요' })).toBeInTheDocument()
  })

  it('allows an authenticated user to open the dashboard', async () => {
    const { client } = createMockClient({ initialSession: session })

    renderApp(client)

    expect(
      await screen.findByRole('heading', { name: '콘텐츠 관리' }),
    ).toBeInTheDocument()
  })

  it('redirects an authenticated user away from the login route', async () => {
    const { client } = createMockClient({ initialSession: session })

    renderApp(client, '/login')

    expect(
      await screen.findByRole('heading', { name: '콘텐츠 관리' }),
    ).toBeInTheDocument()
  })

  it('validates the login form before calling Supabase', async () => {
    const browserUser = userEvent.setup()
    const { auth, client } = createMockClient()
    renderApp(client, '/login')
    await screen.findByRole('heading', { name: '관리자 로그인' })

    await browserUser.click(
      screen.getByRole('button', { name: '로그인하기' }),
    )

    expect(
      await screen.findByText('올바른 이메일 주소를 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('비밀번호는 8자 이상 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows a friendly error when email sign-in fails', async () => {
    const browserUser = userEvent.setup()
    const { auth, client } = createMockClient()
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })
    renderApp(client, '/login')
    await screen.findByRole('heading', { name: '관리자 로그인' })

    await browserUser.type(
      screen.getByLabelText('이메일'),
      'owner@example.test',
    )
    await browserUser.type(
      screen.getByLabelText('비밀번호'),
      'password123',
    )
    await browserUser.click(
      screen.getByRole('button', { name: '로그인하기' }),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('이메일 또는 비밀번호를 확인해 주세요.')
  })

  it('signs out and returns to the login page', async () => {
    const browserUser = userEvent.setup()
    const { auth, client } = createMockClient({ initialSession: session })
    renderApp(client)
    await screen.findByRole('heading', { name: '콘텐츠 관리' })

    await browserUser.click(
      screen.getByRole('button', { name: '로그아웃' }),
    )

    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: '관리자 로그인' }),
    ).toBeInTheDocument()
  })
})
