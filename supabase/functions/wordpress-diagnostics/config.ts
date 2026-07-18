import { DiagnosticError } from './errors.ts'
import type { EnvironmentSource, WordPressConfig } from './schemas.ts'

const requiredKeys = [
  'WORDPRESS_SITE_URL',
  'WORDPRESS_USERNAME',
  'WORDPRESS_APPLICATION_PASSWORD',
  'WORDPRESS_ALLOWED_USER_ID',
  'APP_ALLOWED_ORIGINS',
] as const

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
}

function normalizedOrigin(value: string): string {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('invalid origin')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
  return url.origin
}

export function parseWordPressConfig(environment: EnvironmentSource): WordPressConfig {
  const values = Object.fromEntries(requiredKeys.map((key) => [key, environment.get(key)?.trim() ?? '']))
  if (requiredKeys.some((key) => !values[key])) {
    throw new DiagnosticError('CONFIG_MISSING', { httpStatus: 500 })
  }

  const localMode = environment.get('WORDPRESS_LOCAL_MODE')?.trim().toLowerCase() === 'true'
  let siteUrl: URL
  try {
    siteUrl = new URL(values.WORDPRESS_SITE_URL)
  } catch {
    throw new DiagnosticError('WORDPRESS_URL_INVALID', { httpStatus: 500 })
  }

  const localhost = siteUrl.hostname === 'localhost' || siteUrl.hostname === '127.0.0.1' || siteUrl.hostname === '[::1]'
  const dockerHost = siteUrl.hostname === 'host.docker.internal'
  const dockerHostLookalike = siteUrl.hostname.startsWith('host.docker.internal.')
  const allowedLocalHost = localMode && (localhost || dockerHost)
  const forbiddenHostname = isIpLiteral(siteUrl.hostname)
    || siteUrl.hostname.endsWith('.local')
    || siteUrl.hostname.endsWith('.internal')

  if (
    siteUrl.username
    || siteUrl.password
    || siteUrl.search
    || siteUrl.hash
    || (!localMode && siteUrl.protocol !== 'https:')
    || (localMode && !['http:', 'https:'].includes(siteUrl.protocol))
    || ((localhost || dockerHost) && !localMode)
    || dockerHostLookalike
    || (forbiddenHostname && !allowedLocalHost)
  ) {
    throw new DiagnosticError('WORDPRESS_URL_INVALID', { httpStatus: 500 })
  }

  const normalizedPath = siteUrl.pathname.replace(/\/+$/, '')
  if (normalizedPath && normalizedPath !== '/') {
    throw new DiagnosticError('WORDPRESS_URL_INVALID', { httpStatus: 500 })
  }
  siteUrl.pathname = '/'

  const allowedOrigins = parseAllowedOrigins(environment)

  if (!uuidPattern.test(values.WORDPRESS_ALLOWED_USER_ID)) {
    throw new DiagnosticError('CONFIG_INVALID', { httpStatus: 500 })
  }

  return {
    siteUrl,
    username: values.WORDPRESS_USERNAME,
    applicationPassword: values.WORDPRESS_APPLICATION_PASSWORD.replace(/\s+/g, ''),
    allowedUserId: values.WORDPRESS_ALLOWED_USER_ID,
    allowedOrigins,
    localMode,
  }
}

export function parseAllowedOrigins(environment: EnvironmentSource): ReadonlySet<string> {
  const rawOrigins = environment.get('APP_ALLOWED_ORIGINS')?.trim() ?? ''
  if (!rawOrigins) throw new DiagnosticError('CONFIG_MISSING', { httpStatus: 500 })
  const originValues = rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (!originValues.length || originValues.includes('*')) {
    throw new DiagnosticError('CONFIG_INVALID', { httpStatus: 500 })
  }

  let allowedOrigins: Set<string>
  try {
    allowedOrigins = new Set(originValues.map(normalizedOrigin))
  } catch {
    throw new DiagnosticError('CONFIG_INVALID', { httpStatus: 500 })
  }

  return allowedOrigins
}
