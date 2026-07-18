import { act, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useParams,
} from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { RouteErrorFallback } from './RouteErrorFallback'
import { RouteLoadingFallback } from './RouteLoadingFallback'
import { isChunkLoadError } from './routeErrors'
import { routes } from './router'
import routerSource from './router.tsx?raw'

const protectedRoute = routes[1]
const layoutRoute = protectedRoute?.children?.find((route) => Array.isArray(route.children))
const pageRoutes = layoutRoute?.children ?? []

function pageRoute(path: string) {
  return pageRoutes.find((route) => route.path === path)
}

const lazyPageExpectations = [
  ['/dashboard', 'DashboardPage'],
  ['/content', 'ContentPage'],
  ['/content/new', 'ContentCreatePage'],
  ['/content/:postId', 'ContentDetailPage'],
  ['/content/:postId/edit', 'ContentEditPage'],
  ['/news-topics', 'NewsTopicsPage'],
  ['/news-topics/new', 'NewsTopicCreatePage'],
  ['/news-topics/:topicId', 'NewsTopicDetailPage'],
  ['/news-topics/:topicId/edit', 'NewsTopicEditPage'],
  ['/content/:postId/news-updates/new', 'NewsUpdateCreatePage'],
  ['/news-updates/:updateId', 'NewsUpdateDetailPage'],
  ['/news-updates/:updateId/edit', 'NewsUpdateEditPage'],
  ['/news-followups', 'NewsFollowupsPage'],
  ['/news-topics/:topicId/followups/new', 'NewsFollowupCreatePage'],
  ['/news-followups/:followupId/edit', 'NewsFollowupEditPage'],
  ['/briefing-prompts', 'BriefingPromptsPage'],
  ['/briefing-prompts/history', 'BriefingPromptHistoryPage'],
  ['/briefing-prompts/history/:runId', 'BriefingPromptRunDetailPage'],
  ['/imports', 'ImportPage'],
  ['/imports/new', 'ImportPage'],
  ['/imports/history', 'ImportHistoryPage'],
  ['/imports/history/:jobId', 'ImportJobDetailPage'],
  ['/backups', 'BackupPage'],
  ['/backups/new', 'BackupPage'],
  ['/backups/restore', 'BackupRestorePage'],
  ['/backups/restore/new', 'BackupRestorePage'],
  ['/backups/restore/execute', 'BackupRestoreExecutePage'],
  ['/backups/restore/jobs', 'BackupRestoreJobsPage'],
  ['/backups/restore/jobs/:jobId', 'BackupRestoreJobDetailPage'],
  ['/settings/wordpress', 'WordPressSettingsPage'],
] as const

describe('route inventory and lazy modules', () => {
  it('keeps the public route, eager guards, eager layout, redirect, and NotFound contracts', () => {
    const loginRoute = routes[0]?.children?.[0]
    const rootRedirect = pageRoute('/')
    const notFound = pageRoute('*')

    expect(loginRoute).toMatchObject({ path: '/login' })
    expect(loginRoute?.lazy).toBeTypeOf('function')
    expect(routes[0]?.element).toBeDefined()
    expect(protectedRoute?.element).toBeDefined()
    expect(layoutRoute?.element).toBeDefined()
    expect(rootRedirect?.element).toBeDefined()
    expect(rootRedirect?.lazy).toBeUndefined()
    expect(notFound?.element).toBeDefined()
    expect(notFound?.lazy).toBeUndefined()
  })

  it.each(lazyPageExpectations)('%s resolves the direct lazy page module %s', async (path, componentName) => {
    const route = pageRoute(path)
    expect(route?.lazy).toBeTypeOf('function')
    if (typeof route?.lazy !== 'function') {
      throw new Error(`${path} must use a lazy route function.`)
    }

    const routeModule = await route.lazy()
    const Component = routeModule && 'Component' in routeModule
      ? routeModule.Component
      : undefined

    expect(route?.element).toBeUndefined()
    expect(route?.hydrateFallbackElement).toBeDefined()
    expect(route?.errorElement).toBeDefined()
    expect(Component).toBeTypeOf('function')
    expect((Component as { name: string }).name).toBe(componentName)
  })

  it('preserves nested params routes and does not introduce loaders or actions', () => {
    const parameterPaths = pageRoutes
      .map((route) => route.path)
      .filter((path) => path?.includes(':'))

    expect(parameterPaths).toEqual([
      '/imports/history/:jobId',
      '/backups/restore/jobs/:jobId',
      '/content/:postId',
      '/content/:postId/edit',
      '/content/:postId/wordpress-preview',
      '/news-topics/:topicId',
      '/news-topics/:topicId/edit',
      '/content/:postId/news-updates/new',
      '/news-updates/:updateId',
      '/news-updates/:updateId/edit',
      '/news-topics/:topicId/followups/new',
      '/news-followups/:followupId/edit',
      '/briefing-prompts/history/:runId',
    ])
    expect(pageRoutes.every((route) => !route.loader && !route.action)).toBe(true)
  })

  it('uses only static literal direct page imports and leaves shell modules eager', () => {
    const dynamicPageImports = [...routerSource.matchAll(/import\('\.\.\/pages\/([^']+)'\)/g)]
      .map((match) => match[1])

    expect(dynamicPageImports).toHaveLength(29)
    expect(new Set(dynamicPageImports)).toHaveLength(29)
    expect(routerSource).not.toMatch(/import\('\.\.\/pages'\)/)
    expect(routerSource).not.toMatch(/import\(`\.\.\/pages/)
    expect(routerSource).not.toMatch(/from '\.\.\/pages\/(?!NotFoundPage)/)
    expect(routerSource).toContain("from '../features/auth/AuthRouteGuards'")
    expect(routerSource).toContain("from '../layouts/AppLayout'")
  })
})

describe('route loading and error fallbacks', () => {
  it('announces an accessible loading state', () => {
    render(<RouteLoadingFallback />)

    expect(screen.getByRole('status')).toHaveTextContent('페이지를 불러오는 중입니다.')
  })

  it('keeps the eager shell visible until a lazy page resolves and then removes loading', async () => {
    let resolveLazy: ((routeModule: { Component: () => React.JSX.Element }) => void) | undefined
    const lazy = () => new Promise<{ Component: () => React.JSX.Element }>((resolve) => {
      resolveLazy = resolve
    })
    const router = createMemoryRouter([
      {
        element: <div><span>공통 셸</span><Outlet /></div>,
        children: [{
          path: '/lazy',
          lazy,
          hydrateFallbackElement: <RouteLoadingFallback />,
          errorElement: <RouteErrorFallback />,
        }],
      },
    ], { initialEntries: ['/lazy'] })

    render(<RouterProvider router={router} />)
    expect(screen.getByText('공통 셸')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      resolveLazy?.({ Component: () => <h1>Lazy 페이지</h1> })
    })

    expect(await screen.findByRole('heading', { name: 'Lazy 페이지' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a safe chunk error without exposing raw error details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const router = createMemoryRouter([{
      path: '/broken',
      lazy: () => Promise.reject(new Error('Failed to fetch dynamically imported module: /assets/private-chunk.js')),
      hydrateFallbackElement: <RouteLoadingFallback />,
      errorElement: <RouteErrorFallback />,
    }], { initialEntries: ['/broken'] })

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: '페이지 파일을 불러오지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '대시보드로 이동' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByText(/private-chunk/)).not.toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('distinguishes known chunk load failures from ordinary render errors', () => {
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 42 failed'))).toBe(true)
    expect(isChunkLoadError(new Error('ordinary render failure'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })
})

describe('lazy navigation behavior', () => {
  function LocationPage() {
    const { itemId } = useParams()
    const location = useLocation()
    return <h1>{itemId ? `${itemId}${location.search}` : '목록'}</h1>
  }

  it('preserves params, search params, and browser back navigation', async () => {
    const router = createMemoryRouter([
      { path: '/items', lazy: async () => ({ Component: LocationPage }) },
      { path: '/items/:itemId', lazy: async () => ({ Component: LocationPage }) },
    ], { initialEntries: ['/items'] })

    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: '목록' })).toBeInTheDocument()

    await act(async () => { await router.navigate('/items/post-1?mode=edit') })
    expect(screen.getByRole('heading', { name: 'post-1?mode=edit' })).toBeInTheDocument()

    await act(async () => { await router.navigate(-1) })
    expect(screen.getByRole('heading', { name: '목록' })).toBeInTheDocument()
  })

  it('does not show a stale slow page after a fast subsequent navigation', async () => {
    let resolveSlow: ((routeModule: { Component: () => React.JSX.Element }) => void) | undefined
    const router = createMemoryRouter([
      { path: '/start', element: <h1>시작</h1> },
      {
        path: '/slow',
        lazy: () => new Promise((resolve) => { resolveSlow = resolve }),
      },
      { path: '/fast', lazy: async () => ({ Component: () => <h1>빠른 페이지</h1> }) },
    ], { initialEntries: ['/start'] })

    render(<RouterProvider router={router} />)
    void router.navigate('/slow')
    await act(async () => { await router.navigate('/fast') })
    expect(screen.getByRole('heading', { name: '빠른 페이지' })).toBeInTheDocument()

    await act(async () => {
      resolveSlow?.({ Component: () => <h1>느린 페이지</h1> })
    })
    expect(screen.queryByRole('heading', { name: '느린 페이지' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '빠른 페이지' })).toBeInTheDocument()
  })
})
