import { describe, expect, it } from 'vitest'
import { routes } from './router'

describe('Backup route', () => {
  it.each(['/backups', '/backups/new', '/backups/restore', '/backups/restore/new'])('%s를 인증 라우트 아래에 둔다', (path) => {
    const layoutRoute = routes[1]?.children?.find((route) => Array.isArray(route.children))
    expect(layoutRoute?.children?.some((route) => route.path === path)).toBe(true)
  })
})
