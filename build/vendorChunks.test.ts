import { describe, expect, it } from 'vitest'

import { manualChunks } from './vendorChunks'

describe('manualChunks', () => {
  it('is available as the vendor classifier', () => {
    expect(manualChunks).toBeTypeOf('function')
  })

  it.each([
    ['/repo/node_modules/react/index.js', 'vendor-react'],
    ['/repo/node_modules/react-dom/client.js', 'vendor-react'],
    ['/repo/node_modules/scheduler/index.js', 'vendor-react'],
    ['/repo/node_modules/react-router/dist/index.mjs', 'vendor-router'],
    ['/repo/node_modules/react-router-dom/dist/index.mjs', 'vendor-router'],
    ['/repo/node_modules/@tanstack/react-query/build/modern/index.js', 'vendor-query'],
    ['/repo/node_modules/@tanstack/query-core/build/modern/index.js', 'vendor-query'],
    ['/repo/node_modules/@supabase/auth-js/dist/module/index.js', 'vendor-supabase'],
    ['/repo/node_modules/@supabase/supabase-js/dist/index.mjs', 'vendor-supabase'],
    ['/repo/node_modules/zod/v4/index.js', 'vendor-validation'],
  ] as const)('classifies %s', (moduleId, expected) => {
    expect(manualChunks(moduleId)).toBe(expected)
  })

  it('does not classify application source', () => {
    expect(manualChunks('/repo/src/features/backups/react-helper.ts')).toBeUndefined()
  })

  it.each([
    '/repo/node_modules/reactive-lib/index.js',
    '/repo/node_modules/react-router-extra/index.js',
    '/repo/node_modules/@tanstackish/react-query/index.js',
    '/repo/node_modules/@supabase-extra/auth-js/index.js',
    '/repo/node_modules/zod-validation-error/index.js',
  ])('does not match a similarly named package: %s', (moduleId) => {
    expect(manualChunks(moduleId)).toBeUndefined()
  })

  it('handles Windows paths', () => {
    expect(manualChunks('D:\\repo\\node_modules\\react-dom\\client.js')).toBe('vendor-react')
  })

  it('handles POSIX paths', () => {
    expect(manualChunks('/repo/node_modules/@supabase/postgrest-js/dist/index.mjs')).toBe('vendor-supabase')
  })

  it('leaves unknown dependencies to automatic chunking', () => {
    expect(manualChunks('/repo/node_modules/react-hook-form/dist/index.esm.mjs')).toBeUndefined()
  })
})
