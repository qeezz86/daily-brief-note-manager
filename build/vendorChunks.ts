export type VendorChunkName =
  | 'vendor-react'
  | 'vendor-router'
  | 'vendor-query'
  | 'vendor-supabase'
  | 'vendor-validation'

function packageNameFromModuleId(moduleId: string): string | null {
  const normalized = moduleId.replaceAll('\\', '/').split('?', 1)[0]
  const marker = '/node_modules/'
  const markerIndex = normalized.lastIndexOf(marker)

  if (markerIndex < 0) return null

  const packagePath = normalized.slice(markerIndex + marker.length)
  const segments = packagePath.split('/')

  if (!segments[0] || segments[0] === '.pnpm') return null
  if (segments[0].startsWith('@')) {
    return segments[1] ? `${segments[0]}/${segments[1]}` : null
  }

  return segments[0]
}

/**
 * Vite 8 uses Rolldown codeSplitting groups instead of Rollup manualChunks.
 * Keeping the classifier pure preserves the manual chunk contract and makes
 * Windows/POSIX package-boundary behavior independently testable.
 */
export function manualChunks(moduleId: string): VendorChunkName | undefined {
  const packageName = packageNameFromModuleId(moduleId)

  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
    return 'vendor-react'
  }
  if (packageName === 'react-router' || packageName === 'react-router-dom') {
    return 'vendor-router'
  }
  if (packageName === '@tanstack/react-query' || packageName === '@tanstack/query-core') {
    return 'vendor-query'
  }
  if (packageName?.startsWith('@supabase/')) {
    return 'vendor-supabase'
  }
  if (packageName === 'zod') {
    return 'vendor-validation'
  }

  return undefined
}
