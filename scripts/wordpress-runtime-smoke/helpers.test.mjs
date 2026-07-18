import { describe, expect, it, vi } from 'vitest'

import {
  assertNoSecretLeaks,
  assertReadOnlyMockAudit,
  createCleanupManager,
  findSecretLeaks,
  inspectMockAudit,
  maskSecrets,
  parseSupabaseStatusOutput,
  serializeTemporaryEnv,
} from './helpers.mjs'

const audit = [
  '/wp-json/',
  '/wp-json/wp/v2/users/me',
  '/wp-json/wp/v2/types',
  '/wp-json/wp/v2/statuses',
  '/wp-json/wp/v2/categories',
  '/wp-json/wp/v2/tags',
  '/wp-json/wp/v2/posts',
].map((pathname) => ({
  method: 'GET',
  pathname,
  queryKeys: [],
  authorizationPresent: true,
  authorizationValid: true,
  status: 200,
}))

describe('WordPress runtime smoke helpers', () => {
  it.each([
    [{ API_URL: 'http://127.0.0.1:54321', PUBLISHABLE_KEY: 'publishable', SECRET_KEY: 'secret' }],
    [{ API_URL: 'http://localhost:54321', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service' }],
  ])('parses supported Supabase status key variants', (status) => {
    expect(parseSupabaseStatusOutput(JSON.stringify(status))).toMatchObject({ apiUrl: expect.stringMatching(/^http:\/\//) })
  })

  it.each(['not-json', '{}', '{"API_URL":"https://remote.example.com","ANON_KEY":"a","SERVICE_ROLE_KEY":"s"}'])('rejects unsafe or incomplete status output', (output) => {
    expect(() => parseSupabaseStatusOutput(output)).toThrow()
  })

  it('serializes a quoted temporary environment without exposing unescaped lines', () => {
    expect(serializeTemporaryEnv({ WORDPRESS_USERNAME: 'mock user', WORDPRESS_APPLICATION_PASSWORD: 'a"b' }))
      .toBe('WORDPRESS_USERNAME="mock user"\nWORDPRESS_APPLICATION_PASSWORD="a\\"b"\n')
  })

  it('rejects invalid temporary environment keys and empty values', () => {
    expect(() => serializeTemporaryEnv({ 'BAD-KEY': 'value' })).toThrow()
    expect(() => serializeTemporaryEnv({ EMPTY: '' })).toThrow()
  })

  it('masks known secrets and reports labels without returning their values', () => {
    const secrets = [{ label: 'token', value: 'private-token' }]
    expect(maskSecrets('prefix private-token suffix', secrets)).toBe('prefix [REDACTED] suffix')
    expect(findSecretLeaks('private-token', secrets)).toEqual(['token'])
    expect(() => assertNoSecretLeaks('private-token', secrets)).toThrow()
  })

  it('accepts the fixed GET-only mock audit', () => {
    expect(assertReadOnlyMockAudit(audit)).toEqual({ gets: 7, writes: 0, invalidPaths: 0, invalidAuthorization: 0, redirects: 0 })
  })

  it('detects write methods, unknown paths, and invalid authorization', () => {
    const invalid = [
      { ...audit[0], method: 'POST' },
      { ...audit[1], pathname: '/wp-json/unknown' },
      { ...audit[2], authorizationValid: false },
    ]
    expect(inspectMockAudit(invalid)).toMatchObject({ writes: 1, invalidPaths: 1, invalidAuthorization: 1 })
    expect(() => assertReadOnlyMockAudit(invalid)).toThrow()
  })

  it('rejects an unapproved query key', () => {
    const invalid = structuredClone(audit)
    invalid[2].queryKeys = ['redirect_to']
    expect(() => assertReadOnlyMockAudit(invalid)).toThrow()
  })

  it('runs cleanup once in reverse order and remains idempotent', async () => {
    const calls = []
    const first = vi.fn(async () => calls.push('first'))
    const second = vi.fn(async () => calls.push('second'))
    const cleanup = createCleanupManager()
    cleanup.add(first)
    cleanup.add(second)

    await expect(cleanup.run()).resolves.toEqual({ ok: true, errors: [] })
    await expect(cleanup.run()).resolves.toEqual({ ok: true, errors: [] })
    expect(calls).toEqual(['second', 'first'])
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('continues cleanup after a failure without exposing the thrown message', async () => {
    const finalTask = vi.fn()
    const cleanup = createCleanupManager()
    cleanup.add(finalTask)
    cleanup.add(async () => { throw new Error('private cleanup data') })
    await expect(cleanup.run()).resolves.toEqual({ ok: false, errors: ['CLEANUP_STEP_FAILED'] })
    expect(finalTask).toHaveBeenCalledOnce()
  })
})
