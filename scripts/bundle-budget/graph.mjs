import { BundleBudgetError } from './errors.mjs'
import { findSourceKey } from './manifest.mjs'

export function staticDependencyClosure(manifest, roots) {
  const visited = new Set()
  const assets = new Set()
  const stack = roots.map((root) => findSourceKey(manifest, root))

  while (stack.length > 0) {
    const key = stack.pop()
    if (visited.has(key)) continue
    const module = manifest[key]
    if (!module) throw new BundleBudgetError(`static import module이 manifest에 없습니다: ${key}`, 'MANIFEST_IMPORT_MISSING')
    visited.add(key)
    if (module.file.endsWith('.js')) assets.add(module.file)
    for (const dependency of module.imports) stack.push(dependency)
  }

  return [...assets].sort()
}

export function unionAssets(...collections) {
  return [...new Set(collections.flat())].sort()
}

export function differenceAssets(collection, excluded) {
  const excludedSet = new Set(excluded)
  return [...new Set(collection)].filter((asset) => !excludedSet.has(asset)).sort()
}

export function routeClosure(manifest, entryRoot, routeRoot) {
  return unionAssets(
    staticDependencyClosure(manifest, [entryRoot]),
    staticDependencyClosure(manifest, [routeRoot]),
  )
}
