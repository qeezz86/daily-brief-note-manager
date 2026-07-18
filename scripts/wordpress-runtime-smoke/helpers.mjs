export class SmokeError extends Error {
  constructor(code, stage, options = {}) {
    super(code)
    this.name = 'SmokeError'
    this.code = code
    this.stage = stage
    this.cause = options.cause
  }
}

export const allowedWordPressQueries = new Map([
  ['/wp-json/', new Set()],
  ['/wp-json/wp/v2/users/me', new Set(['context'])],
  ['/wp-json/wp/v2/types', new Set(['context'])],
  ['/wp-json/wp/v2/statuses', new Set(['context'])],
  ['/wp-json/wp/v2/categories', new Set(['_fields', 'context', 'hide_empty', 'page', 'per_page'])],
  ['/wp-json/wp/v2/tags', new Set(['_fields', 'context', 'hide_empty', 'page', 'per_page'])],
  ['/wp-json/wp/v2/posts', new Set(['_fields', 'context', 'page', 'per_page'])],
])

export const allowedWordPressPaths = new Set(allowedWordPressQueries.keys())
export const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function statusValue(parsed, names) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
  const entries = new Map(Object.entries(parsed).map(([key, value]) => [key.toUpperCase(), value]))
  for (const name of names) {
    const value = entries.get(name)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function parseSupabaseStatusOutput(output) {
  let parsed
  try {
    parsed = JSON.parse(String(output).trim())
  } catch {
    throw new SmokeError('SUPABASE_STATUS_INVALID', 'local Supabase status')
  }

  const apiUrl = statusValue(parsed, ['API_URL', 'SUPABASE_URL'])
  const publishableKey = statusValue(parsed, ['PUBLISHABLE_KEY', 'ANON_KEY', 'SUPABASE_ANON_KEY'])
  const secretKey = statusValue(parsed, ['SECRET_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!apiUrl || !publishableKey || !secretKey) {
    throw new SmokeError('SUPABASE_STATUS_INVALID', 'local Supabase status')
  }

  let url
  try {
    url = new URL(apiUrl)
  } catch {
    throw new SmokeError('SUPABASE_STATUS_INVALID', 'local Supabase status')
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new SmokeError('LOCAL_SUPABASE_REQUIRED', 'local Supabase status')
  }

  return { apiUrl: url.origin, publishableKey, secretKey }
}

function dotenvValue(value) {
  return JSON.stringify(String(value))
}

export function serializeTemporaryEnv(values) {
  return `${Object.entries(values)
    .map(([key, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        throw new SmokeError('TEMP_ENV_INVALID', 'temporary Function environment')
      }
      if (typeof value !== 'string' || !value) {
        throw new SmokeError('TEMP_ENV_INVALID', 'temporary Function environment')
      }
      return `${key}=${dotenvValue(value)}`
    })
    .join('\n')}\n`
}

function normalizedSecrets(secrets) {
  const unique = new Map()
  for (const secret of secrets) {
    if (!secret || typeof secret.value !== 'string' || !secret.value) continue
    unique.set(`${secret.label}\0${secret.value}`, secret)
  }
  return [...unique.values()].sort((left, right) => right.value.length - left.value.length)
}

export function maskSecrets(value, secrets) {
  let masked = String(value)
  for (const secret of normalizedSecrets(secrets)) {
    masked = masked.split(secret.value).join('[REDACTED]')
  }
  return masked
}

export function findSecretLeaks(value, secrets) {
  const text = String(value)
  return [...new Set(normalizedSecrets(secrets)
    .filter((secret) => text.includes(secret.value))
    .map((secret) => secret.label))]
}

export function assertNoSecretLeaks(value, secrets, stage = 'credential leakage') {
  if (findSecretLeaks(value, secrets).length) {
    throw new SmokeError('CREDENTIAL_LEAK_DETECTED', stage)
  }
}

function queryKeysAllowed(entry) {
  const allowed = allowedWordPressQueries.get(entry.pathname)
  return allowed !== undefined
    && entry.queryKeys.every((key) => allowed.has(key))
}

export function inspectMockAudit(audit) {
  const writes = audit.filter((entry) => writeMethods.has(entry.method)).length
  const invalidPaths = audit.filter((entry) => !allowedWordPressPaths.has(entry.pathname) || !queryKeysAllowed(entry)).length
  const invalidAuthorization = audit.filter((entry) => !entry.authorizationPresent || !entry.authorizationValid).length
  const redirects = audit.filter((entry) => entry.status >= 300 && entry.status < 400).length
  const gets = audit.filter((entry) => entry.method === 'GET').length

  return { gets, writes, invalidPaths, invalidAuthorization, redirects }
}

export function assertReadOnlyMockAudit(audit) {
  const summary = inspectMockAudit(audit)
  if (
    audit.length !== allowedWordPressPaths.size
    || summary.gets !== audit.length
    || summary.writes !== 0
    || summary.invalidPaths !== 0
    || summary.invalidAuthorization !== 0
    || summary.redirects !== 0
  ) {
    throw new SmokeError('WORDPRESS_AUDIT_FAILED', 'Mock WordPress request audit')
  }

  const counts = new Map()
  for (const entry of audit) counts.set(entry.pathname, (counts.get(entry.pathname) ?? 0) + 1)
  if ([...allowedWordPressPaths].some((pathname) => counts.get(pathname) !== 1)) {
    throw new SmokeError('WORDPRESS_AUDIT_FAILED', 'Mock WordPress request audit')
  }
  if (audit[0]?.pathname !== '/wp-json/' || audit[1]?.pathname !== '/wp-json/wp/v2/users/me') {
    throw new SmokeError('WORDPRESS_SEQUENCE_FAILED', 'Mock WordPress request audit')
  }

  return summary
}

export function createCleanupManager() {
  const tasks = []
  let result
  return {
    add(task) {
      tasks.push(task)
    },
    async run() {
      if (result) return result
      const errors = []
      for (const task of tasks.reverse()) {
        try {
          await task()
        } catch {
          errors.push('CLEANUP_STEP_FAILED')
        }
      }
      result = { ok: errors.length === 0, errors }
      return result
    },
  }
}
