import { describe, expect, it } from 'vitest'
import { routes } from './router'

describe('briefing prompt route', () => {
  it('is nested under the authenticated route guard', () => {
    const authenticated = routes[1]
    const layout = authenticated.children?.[0]
    expect(layout?.children?.some((route) => route.path === '/briefing-prompts')).toBe(true)
  })
})
