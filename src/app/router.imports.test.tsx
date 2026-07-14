import { describe, expect, it } from 'vitest'
import { routes } from './router'

describe('Import route', () => {
  it.each(['/imports', '/imports/new', '/imports/history', '/imports/history/:jobId'])('%s를 인증 라우트 아래에 둔다', (path) => {
    const protectedRoute = routes[1]
    const layoutRoute = protectedRoute?.children?.find((route) => Array.isArray(route.children))
    expect(layoutRoute?.children?.some((route) => route.path === path)).toBe(true)
  })
})
