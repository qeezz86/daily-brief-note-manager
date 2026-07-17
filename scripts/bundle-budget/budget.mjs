import { BundleBudgetError } from './errors.mjs'

const LIMIT_KEYS = new Set([
  'entry',
  'largestChunk',
  'loginClosure',
  'routeClosure',
  'routeIncremental',
  'featureIncremental',
  'totalJs',
  'pwaPrecache',
])

function assertFiniteNonNegative(value, label, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new BundleBudgetError(`${label}은 유한한 0 이상의 ${integer ? '정수' : '숫자'}여야 합니다.`, 'BUDGET_VALUE_INVALID')
  }
}

function validateDimensionPolicy(policy, label, dimension) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new BundleBudgetError(`${label} 정책이 없습니다.`, 'BUDGET_POLICY_MISSING')
  }
  assertFiniteNonNegative(policy.absolute, `${label}.absolute`, { integer: true })
  if (policy.absolute > 10 * 1024 * 1024 * 1024) {
    throw new BundleBudgetError(`${label}.absolute가 검수 가능한 상한을 초과합니다.`, 'BUDGET_VALUE_INVALID')
  }
  if (policy.minimumHeadroom !== undefined) assertFiniteNonNegative(policy.minimumHeadroom, `${label}.minimumHeadroom`, { integer: true })
  if (policy.percentHeadroom !== undefined) {
    assertFiniteNonNegative(policy.percentHeadroom, `${label}.percentHeadroom`)
    if (policy.percentHeadroom > 1) throw new BundleBudgetError(`${label}.percentHeadroom은 1 이하여야 합니다.`, 'BUDGET_VALUE_INVALID')
  }
  if (dimension === 'entries' && policy.percentHeadroom !== undefined) {
    throw new BundleBudgetError(`${label} count 정책에는 percentHeadroom을 사용할 수 없습니다.`, 'BUDGET_VALUE_INVALID')
  }
}

export function validateBudgetConfig(config) {
  if (!config || config.version !== 1 || config.units !== 'bytes') {
    throw new BundleBudgetError('bundle budget config version 1과 bytes 단위가 필요합니다.', 'BUDGET_CONFIG_INVALID')
  }
  if (typeof config.entryRoot !== 'string' || !config.entryRoot) throw new BundleBudgetError('entryRoot가 필요합니다.', 'BUDGET_CONFIG_INVALID')
  if (!Array.isArray(config.manifestPaths) || config.manifestPaths.length === 0) throw new BundleBudgetError('manifestPaths가 필요합니다.', 'BUDGET_CONFIG_INVALID')
  if (!Array.isArray(config.routes) || config.routes.length === 0) throw new BundleBudgetError('route budget 설정이 필요합니다.', 'BUDGET_CONFIG_INVALID')
  if (!Array.isArray(config.features) || config.features.length === 0) throw new BundleBudgetError('feature budget 설정이 필요합니다.', 'BUDGET_CONFIG_INVALID')

  const routeNames = new Set()
  const routeSources = new Set()
  for (const route of config.routes) {
    if (!route || typeof route.name !== 'string' || typeof route.source !== 'string') throw new BundleBudgetError('route name과 source가 필요합니다.', 'BUDGET_CONFIG_INVALID')
    if (routeNames.has(route.name) || routeSources.has(route.source)) throw new BundleBudgetError(`중복 route metric이 있습니다: ${route.name}`, 'BUDGET_CONFIG_INVALID')
    routeNames.add(route.name)
    routeSources.add(route.source)
  }
  if (!routeNames.has('login') || !routeNames.has('dashboard')) throw new BundleBudgetError('login과 dashboard route metric은 필수입니다.', 'BUDGET_CONFIG_INVALID')

  const featureNames = new Set()
  for (const feature of config.features) {
    if (!feature || typeof feature.name !== 'string' || typeof feature.source !== 'string' || !routeNames.has(feature.route)) {
      throw new BundleBudgetError(`feature 설정 또는 route 연결이 올바르지 않습니다: ${feature?.name ?? 'unknown'}`, 'BUDGET_CONFIG_INVALID')
    }
    if (featureNames.has(feature.name)) throw new BundleBudgetError(`중복 feature metric이 있습니다: ${feature.name}`, 'BUDGET_CONFIG_INVALID')
    featureNames.add(feature.name)
  }

  const limitKeys = Object.keys(config.limits ?? {})
  for (const key of limitKeys) if (!LIMIT_KEYS.has(key)) throw new BundleBudgetError(`알 수 없는 limit 설정입니다: ${key}`, 'BUDGET_CONFIG_INVALID')
  for (const key of LIMIT_KEYS) if (!config.limits?.[key]) throw new BundleBudgetError(`필수 limit 설정이 없습니다: ${key}`, 'BUDGET_CONFIG_INVALID')

  for (const [key, policy] of Object.entries(config.limits)) {
    for (const dimension of Object.keys(policy)) {
      if (!['raw', 'gzip', 'entries'].includes(dimension)) throw new BundleBudgetError(`알 수 없는 budget dimension입니다: ${key}.${dimension}`, 'BUDGET_CONFIG_INVALID')
      validateDimensionPolicy(policy[dimension], `${key}.${dimension}`, dimension)
    }
  }
  return config
}

export function metricPolicy(config, metric) {
  if (metric.name === 'entry') return config.limits.entry
  if (metric.name === 'largest-chunk') return config.limits.largestChunk
  if (metric.name === 'total-js') return config.limits.totalJs
  if (metric.name === 'pwa-precache') return config.limits.pwaPrecache
  if (metric.name === 'route.login.closure') return config.limits.loginClosure
  if (metric.category === 'route-closure') return config.limits.routeClosure
  if (metric.category === 'route-incremental') return config.limits.routeIncremental
  if (metric.category === 'feature-incremental') return config.limits.featureIncremental
  return null
}

export function calculateAllowed(baseline, policy) {
  assertFiniteNonNegative(baseline, 'baseline metric', { integer: true })
  validateDimensionPolicy(policy, 'budget', 'raw')
  const minimumCandidate = baseline + (policy.minimumHeadroom ?? 0)
  const percentCandidate = baseline + Math.ceil(baseline * (policy.percentHeadroom ?? 0))
  return Math.min(policy.absolute, Math.max(minimumCandidate, percentCandidate))
}

export function createBaseline(config, metrics) {
  const baselineMetrics = {}
  for (const metric of metrics) {
    const policy = metricPolicy(config, metric)
    if (!policy) continue
    baselineMetrics[metric.name] = Object.fromEntries(
      Object.keys(policy).sort().map((dimension) => [dimension, metric[dimension]]),
    )
  }
  return { version: 1, units: 'bytes', metrics: baselineMetrics }
}

export function validateBaseline(config, metrics, baseline) {
  if (!baseline || baseline.version !== 1 || baseline.units !== 'bytes' || !baseline.metrics || typeof baseline.metrics !== 'object') {
    throw new BundleBudgetError('bundle baseline version 1과 bytes 단위가 필요합니다.', 'BASELINE_CONFIG_INVALID')
  }
  const expected = new Set(metrics.filter((metric) => metricPolicy(config, metric)).map((metric) => metric.name))
  for (const name of expected) if (!baseline.metrics[name]) throw new BundleBudgetError(`baseline metric이 없습니다: ${name}`, 'BASELINE_METRIC_MISSING')
  for (const name of Object.keys(baseline.metrics)) if (!expected.has(name)) throw new BundleBudgetError(`알 수 없는 baseline metric입니다: ${name}`, 'BASELINE_METRIC_UNKNOWN')
  for (const metric of metrics) {
    const policy = metricPolicy(config, metric)
    if (!policy) continue
    for (const dimension of Object.keys(policy)) {
      assertFiniteNonNegative(baseline.metrics[metric.name][dimension], `baseline.${metric.name}.${dimension}`, { integer: true })
    }
  }
  return baseline
}

export function evaluateBudgets(config, metrics, baseline, chunks = []) {
  validateBaseline(config, metrics, baseline)
  const results = []
  const violations = []
  const warnings = []

  for (const metric of metrics) {
    const policy = metricPolicy(config, metric)
    if (!policy) {
      results.push({ name: metric.name, status: 'INFO', dimensions: {} })
      continue
    }
    const dimensions = {}
    for (const [dimension, dimensionPolicy] of Object.entries(policy)) {
      const current = metric[dimension]
      const base = baseline.metrics[metric.name][dimension]
      assertFiniteNonNegative(current, `${metric.name}.${dimension}`, { integer: true })
      const allowed = calculateAllowed(base, dimensionPolicy)
      const passed = current <= allowed && current <= dimensionPolicy.absolute
      const detail = {
        current,
        baseline: base,
        allowed,
        absolute: dimensionPolicy.absolute,
        excess: Math.max(0, current - allowed),
        increaseRatio: base === 0 ? (current === 0 ? 0 : null) : (current - base) / base,
        passed,
      }
      dimensions[dimension] = detail
      if (!passed) violations.push({
        metric: metric.name,
        dimension,
        source: metric.dimensionAssets?.[dimension] ?? metric.source,
        ...detail,
      })
    }
    results.push({ name: metric.name, status: Object.values(dimensions).every(({ passed }) => passed) ? 'PASS' : 'FAIL', dimensions })
  }

  for (const chunk of chunks) {
    if (chunk.raw > 500 * 1024) violations.push({ metric: 'chunk-500-kib', dimension: 'raw', source: chunk.file, current: chunk.raw, baseline: null, allowed: 500 * 1024, absolute: 500 * 1024, excess: chunk.raw - 500 * 1024, increaseRatio: null, passed: false })
  }

  return { pass: violations.length === 0, results, violations, warnings }
}
