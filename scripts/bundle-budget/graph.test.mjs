import { describe, expect, it } from 'vitest'

import { differenceAssets, routeClosure, staticDependencyClosure, unionAssets } from './graph.mjs'
import { syntheticManifest } from './fixtures.test.mjs'

describe('bundle static graph', () => {
  it('calculates one module closure', () => expect(staticDependencyClosure(syntheticManifest(), ['_shared.js'])).toEqual(['assets/shared.js']))
  it('follows recursive static imports', () => expect(staticDependencyClosure(syntheticManifest(), ['src/pages/LoginPage.tsx'])).toEqual(['assets/login.js', 'assets/shared.js']))
  it('deduplicates a shared asset', () => expect(staticDependencyClosure(syntheticManifest(), ['src/pages/LoginPage.tsx', '_shared.js'])).toHaveLength(2))
  it('does not follow dynamic imports', () => expect(staticDependencyClosure(syntheticManifest(), ['src/pages/LoginPage.tsx'])).not.toContain('assets/engine.js'))
  it('unions entry and route closures', () => expect(routeClosure(syntheticManifest(), 'src/main.tsx', 'src/pages/LoginPage.tsx')).toEqual(['assets/entry.js', 'assets/login.js', 'assets/shared.js']))
  it('calculates incremental difference', () => expect(differenceAssets(['a.js', 'b.js'], ['a.js'])).toEqual(['b.js']))
  it('sorts incremental assets', () => expect(differenceAssets(['z.js', 'a.js'], [])).toEqual(['a.js', 'z.js']))
  it('deduplicates incremental assets', () => expect(differenceAssets(['a.js', 'a.js'], [])).toEqual(['a.js']))
  it('unions multiple roots', () => expect(unionAssets(['b.js'], ['a.js'], ['b.js'])).toEqual(['a.js', 'b.js']))
  it('handles an empty difference', () => expect(differenceAssets([], [])).toEqual([]))
  it('handles all assets excluded', () => expect(differenceAssets(['a.js'], ['a.js'])).toEqual([]))
  it('ignores non-JS module output in closure', () => expect(staticDependencyClosure({ source: { file: 'assets/style.css', imports: [] } }, ['source'])).toEqual([]))
  it('terminates a cycle', () => expect(staticDependencyClosure({ a: { file: 'a.js', imports: ['b'] }, b: { file: 'b.js', imports: ['a'] } }, ['a'])).toEqual(['a.js', 'b.js']))
  it('supports several roots', () => expect(staticDependencyClosure(syntheticManifest(), ['src/pages/LoginPage.tsx', 'src/pages/DashboardPage.tsx'])).toEqual(['assets/dashboard.js', 'assets/login.js', 'assets/shared.js']))
  it('keeps stable asset ordering', () => expect(staticDependencyClosure(syntheticManifest(), ['src/pages/DashboardPage.tsx', 'src/pages/LoginPage.tsx'])).toEqual(['assets/dashboard.js', 'assets/login.js', 'assets/shared.js']))
  it('resolves the source entry alias', () => expect(staticDependencyClosure(syntheticManifest(), ['src/main.tsx'])).toContain('assets/entry.js'))
  it('rejects a missing root', () => expect(() => staticDependencyClosure(syntheticManifest(), ['missing'])).toThrow('manifest에 없습니다'))
  it('preserves route-only assets after entry subtraction', () => {
    const closure = routeClosure(syntheticManifest(), 'src/main.tsx', 'src/pages/DashboardPage.tsx')
    expect(differenceAssets(closure, staticDependencyClosure(syntheticManifest(), ['src/main.tsx']))).toEqual(['assets/dashboard.js'])
  })
})
