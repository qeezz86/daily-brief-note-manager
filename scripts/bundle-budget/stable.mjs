import path from 'node:path'

export function normalizeSourceKey(value) {
  if (typeof value !== 'string') return ''
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, '')
}

export function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableObject(child)]),
    )
  }
  return value
}

export function stableJson(value) {
  return `${JSON.stringify(stableObject(value), null, 2)}\n`
}

export function repositoryRelative(rootDirectory, targetPath) {
  const relative = normalizeSourceKey(path.relative(rootDirectory, targetPath))
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    return normalizeSourceKey(path.basename(targetPath))
  }
  return relative
}
