import { describe, expect, it } from 'vitest'

import { calculateAllowed, createBaseline, evaluateBudgets, metricPolicy, validateBaseline, validateBudgetConfig } from './budget.mjs'
import { budgetConfig } from './fixtures.test.mjs'

function clone(value) { return structuredClone(value) }

function sampleMetrics(overrides = {}) {
  const value = (name, category, source = null, dimensions = {}) => ({ name, category, source, assets: [], raw: 100, gzip: 50, ...dimensions })
  const metrics = [
    value('entry', 'entry', 'src/main.tsx'),
    value('entry-static-closure', 'entry-closure'),
    value('route.login.closure', 'route-closure'),
    value('route.login.incremental', 'route-incremental'),
    value('route.dashboard.closure', 'route-closure'),
    value('route.dashboard.incremental', 'route-incremental'),
    value('feature.engine.standalone', 'feature-standalone'),
    value('feature.engine.incremental', 'feature-incremental'),
    value('largest-chunk', 'largest-chunk'),
    value('total-js', 'total-assets'),
    value('pwa-precache', 'pwa', 'dist/sw.js', { entries: 5 }),
  ]
  return metrics.map((metric) => metric.name === overrides.name ? { ...metric, ...overrides } : metric)
}

describe('bundle budget policy', () => {
  it('accepts the valid config', () => expect(validateBudgetConfig(budgetConfig())).toBeTruthy())
  it('rejects an unsupported version', () => { const value = clone(budgetConfig()); value.version = 2; expect(() => validateBudgetConfig(value)).toThrow('version 1') })
  it('rejects a non-byte unit', () => { const value = clone(budgetConfig()); value.units = 'KiB'; expect(() => validateBudgetConfig(value)).toThrow('bytes') })
  it('rejects missing manifest paths', () => { const value = clone(budgetConfig()); value.manifestPaths = []; expect(() => validateBudgetConfig(value)).toThrow('manifestPaths') })
  it('rejects duplicate route names', () => { const value = clone(budgetConfig()); value.routes[1].name = 'login'; expect(() => validateBudgetConfig(value)).toThrow('중복 route') })
  it('rejects duplicate route sources', () => { const value = clone(budgetConfig()); value.routes[1].source = value.routes[0].source; expect(() => validateBudgetConfig(value)).toThrow('중복 route') })
  it('requires login', () => { const value = clone(budgetConfig()); value.routes[0].name = 'other'; expect(() => validateBudgetConfig(value)).toThrow('login') })
  it('requires dashboard', () => { const value = clone(budgetConfig()); value.routes[1].name = 'other'; expect(() => validateBudgetConfig(value)).toThrow('dashboard') })
  it('rejects a missing feature route', () => { const value = clone(budgetConfig()); value.features[0].route = 'missing'; expect(() => validateBudgetConfig(value)).toThrow('route 연결') })
  it('rejects an unknown limit group', () => { const value = clone(budgetConfig()); value.limits.unknown = value.limits.entry; expect(() => validateBudgetConfig(value)).toThrow('알 수 없는 limit') })
  it('rejects a missing limit group', () => { const value = clone(budgetConfig()); delete value.limits.entry; expect(() => validateBudgetConfig(value)).toThrow('필수 limit') })
  it('rejects a negative absolute limit', () => { const value = clone(budgetConfig()); value.limits.entry.raw.absolute = -1; expect(() => validateBudgetConfig(value)).toThrow('0 이상의') })
  it('rejects NaN', () => { const value = clone(budgetConfig()); value.limits.entry.raw.absolute = Number.NaN; expect(() => validateBudgetConfig(value)).toThrow('유한한') })
  it('rejects percent headroom above 100%', () => { const value = clone(budgetConfig()); value.limits.entry.raw.percentHeadroom = 1.01; expect(() => validateBudgetConfig(value)).toThrow('1 이하') })
  it('uses minimum absolute headroom for small values', () => expect(calculateAllowed(10, { absolute: 100, percentHeadroom: 0.1, minimumHeadroom: 5 })).toBe(15))
  it('uses percent headroom for larger values', () => expect(calculateAllowed(100, { absolute: 200, percentHeadroom: 0.2, minimumHeadroom: 5 })).toBe(120))
  it('caps regression allowance at the absolute limit', () => expect(calculateAllowed(100, { absolute: 105, percentHeadroom: 0.2, minimumHeadroom: 5 })).toBe(105))
  it('handles a zero baseline', () => expect(calculateAllowed(0, { absolute: 100, percentHeadroom: 0.2, minimumHeadroom: 5 })).toBe(5))
  it('maps login closure to the special policy', () => expect(metricPolicy(budgetConfig(), sampleMetrics()[2])).toEqual(budgetConfig().limits.loginClosure))
  it('does not gate standalone feature information', () => expect(metricPolicy(budgetConfig(), sampleMetrics()[6])).toBeNull())
  it('creates only gated baseline metrics', () => expect(createBaseline(budgetConfig(), sampleMetrics()).metrics).not.toHaveProperty('feature.engine.standalone'))
  it('does not store hashed assets in the baseline', () => expect(JSON.stringify(createBaseline(budgetConfig(), sampleMetrics()))).not.toContain('assets/'))
  it('accepts a complete baseline', () => { const metrics = sampleMetrics(); const baseline = createBaseline(budgetConfig(), metrics); expect(validateBaseline(budgetConfig(), metrics, baseline)).toBe(baseline) })
  it('rejects a missing baseline metric', () => { const metrics = sampleMetrics(); const baseline = createBaseline(budgetConfig(), metrics); delete baseline.metrics.entry; expect(() => validateBaseline(budgetConfig(), metrics, baseline)).toThrow('baseline metric') })
  it('rejects an unknown baseline metric', () => { const metrics = sampleMetrics(); const baseline = createBaseline(budgetConfig(), metrics); baseline.metrics.unknown = { raw: 1 }; expect(() => validateBaseline(budgetConfig(), metrics, baseline)).toThrow('알 수 없는 baseline') })
  it('passes an exact baseline build', () => { const metrics = sampleMetrics(); const baseline = createBaseline(budgetConfig(), metrics); expect(evaluateBudgets(budgetConfig(), metrics, baseline).pass).toBe(true) })
  it('passes exactly at the effective limit', () => { const metrics = sampleMetrics({ name: 'entry', raw: 110 }); const baseline = createBaseline(budgetConfig(), sampleMetrics()); expect(evaluateBudgets(budgetConfig(), metrics, baseline).pass).toBe(true) })
  it('fails above regression allowance', () => { const metrics = sampleMetrics({ name: 'entry', raw: 111 }); const baseline = createBaseline(budgetConfig(), sampleMetrics()); expect(evaluateBudgets(budgetConfig(), metrics, baseline).pass).toBe(false) })
  it('records violation detail', () => { const metrics = sampleMetrics({ name: 'entry', raw: 111 }); const baseline = createBaseline(budgetConfig(), sampleMetrics()); expect(evaluateBudgets(budgetConfig(), metrics, baseline).violations[0]).toMatchObject({ metric: 'entry', dimension: 'raw', excess: 1 }) })
  it('fails gzip independently while raw passes', () => {
    const metrics = sampleMetrics({ name: 'largest-chunk', raw: 100, gzip: 61, dimensionAssets: { raw: 'assets/raw.js', gzip: 'assets/gzip.js' } })
    const baseline = createBaseline(budgetConfig(), sampleMetrics())
    expect(evaluateBudgets(budgetConfig(), metrics, baseline).violations).toEqual([
      expect.objectContaining({ metric: 'largest-chunk', dimension: 'gzip', source: 'assets/gzip.js' }),
    ])
  })
  it('fails raw independently while gzip passes', () => {
    const metrics = sampleMetrics({ name: 'largest-chunk', raw: 111, gzip: 50, dimensionAssets: { raw: 'assets/raw.js', gzip: 'assets/gzip.js' } })
    const baseline = createBaseline(budgetConfig(), sampleMetrics())
    expect(evaluateBudgets(budgetConfig(), metrics, baseline).violations).toEqual([
      expect.objectContaining({ metric: 'largest-chunk', dimension: 'raw', source: 'assets/raw.js' }),
    ])
  })
  it('does not store dimension asset names in the baseline', () => {
    const metrics = sampleMetrics({ name: 'largest-chunk', dimensionAssets: { raw: 'assets/raw-HASH.js', gzip: 'assets/gzip-HASH.js' } })
    expect(JSON.stringify(createBaseline(budgetConfig(), metrics))).not.toContain('HASH')
  })
  it('fails a chunk over 500 KiB independently', () => { const metrics = sampleMetrics(); const baseline = createBaseline(budgetConfig(), metrics); expect(evaluateBudgets(budgetConfig(), metrics, baseline, [{ file: 'huge.js', raw: 512001 }]).pass).toBe(false) })
})
