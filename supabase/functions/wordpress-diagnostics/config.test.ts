import { describe, expect, it } from 'vitest'

import { DiagnosticError } from './errors.ts'
import { parseWordPressConfig } from './config.ts'

const validValues: Record<string, string> = {
  WORDPRESS_SITE_URL: 'https://wordpress.example.com',
  WORDPRESS_USERNAME: 'api-user',
  WORDPRESS_APPLICATION_PASSWORD: 'abcd efgh ijkl',
  WORDPRESS_ALLOWED_USER_ID: '11111111-1111-4111-8111-111111111111',
  APP_ALLOWED_ORIGINS: 'http://localhost:5173, https://app.example.com',
}

function environment(overrides: Record<string, string | undefined> = {}) {
  const values = { ...validValues, ...overrides }
  return { get: (name: string) => values[name] }
}

function expectCode(overrides: Record<string, string | undefined>, code: string) {
  try {
    parseWordPressConfig(environment(overrides))
    throw new Error('expected config error')
  } catch (error) {
    expect(error).toBeInstanceOf(DiagnosticError)
    expect((error as DiagnosticError).code).toBe(code)
  }
}

describe('parseWordPressConfig', () => {
  it('normalizes the site root, origins, and displayed Application Password spaces', () => {
    const config = parseWordPressConfig(environment())
    expect(config.siteUrl.href).toBe('https://wordpress.example.com/')
    expect(config.applicationPassword).toBe('abcdefghijkl')
    expect([...config.allowedOrigins]).toEqual(['http://localhost:5173', 'https://app.example.com'])
  })

  it.each([
    'WORDPRESS_SITE_URL',
    'WORDPRESS_USERNAME',
    'WORDPRESS_APPLICATION_PASSWORD',
    'WORDPRESS_ALLOWED_USER_ID',
    'APP_ALLOWED_ORIGINS',
  ])('fails closed when %s is missing', (key) => expectCode({ [key]: undefined }, 'CONFIG_MISSING'))

  it.each([
    ['not-a-url', 'invalid URL'],
    ['http://wordpress.example.com', 'production HTTP'],
    ['https://wordpress.example.com/', 'trailing slash'],
    ['https://name:password@wordpress.example.com', 'userinfo'],
    ['https://wordpress.example.com?target=x', 'query'],
    ['https://wordpress.example.com#fragment', 'fragment'],
    ['https://127.0.0.1', 'IP literal'],
    ['https://service.internal', 'internal hostname'],
    ['ftp://wordpress.example.com', 'unsupported protocol'],
    ['https://wordpress.example.com/wp-json', 'non-root path'],
  ])('rejects %s (%s)', (siteUrl) => expectCode({ WORDPRESS_SITE_URL: siteUrl }, 'WORDPRESS_URL_INVALID'))

  it('allows localhost only in explicit local mode', () => {
    expectCode({ WORDPRESS_SITE_URL: 'http://localhost:8080' }, 'WORDPRESS_URL_INVALID')
    const config = parseWordPressConfig(environment({ WORDPRESS_SITE_URL: 'http://localhost:8080', WORDPRESS_LOCAL_MODE: 'true' }))
    expect(config.siteUrl.origin).toBe('http://localhost:8080')
  })

  it('allows only the exact Docker host root in explicit local mode', () => {
    const config = parseWordPressConfig(environment({
      WORDPRESS_SITE_URL: 'http://host.docker.internal:43123',
      WORDPRESS_LOCAL_MODE: 'true',
    }))
    expect(config.siteUrl.origin).toBe('http://host.docker.internal:43123')
  })

  it.each([
    ['http://host.docker.internal:43123/', undefined, 'production mode'],
    ['http://host.docker.internal.evil.example:43123/', 'true', 'lookalike hostname'],
    ['http://foo.internal:43123/', 'true', 'arbitrary internal hostname'],
    ['http://name:password@host.docker.internal:43123/', 'true', 'userinfo'],
    ['http://host.docker.internal:43123/?target=x', 'true', 'query'],
    ['http://host.docker.internal:43123/#fragment', 'true', 'fragment'],
  ])('rejects Docker-host exception misuse: %s (%s)', (siteUrl, localMode) => {
    expectCode({ WORDPRESS_SITE_URL: siteUrl, WORDPRESS_LOCAL_MODE: localMode }, 'WORDPRESS_URL_INVALID')
  })

  it.each([
    { APP_ALLOWED_ORIGINS: '*' },
    { APP_ALLOWED_ORIGINS: 'https://app.example.com/path' },
    { WORDPRESS_ALLOWED_USER_ID: 'owner@example.com' },
  ])('rejects invalid authorization or CORS configuration', (overrides) => expectCode(overrides, 'CONFIG_INVALID'))
})
