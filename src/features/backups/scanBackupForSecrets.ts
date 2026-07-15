import type { BackupSecretIssue } from './backup.types'

const forbiddenKeys = new Set([
  'ownerid', 'email', 'accesstoken', 'refreshtoken', 'servicerole', 'jwt',
  'password', 'secret', 'supabasekey', 'anonkey', 'authorization',
  'cookie', 'rawsql', 'rawpostgresterror', 'stacktrace',
])

const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/
const longEyJPattern = /\beyJ[A-Za-z0-9_-]{40,}\b/
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]{20,}\b/i
const supabaseSecretPattern = /\bsb_(?:secret|service_role)_[A-Za-z0-9_-]{12,}\b/i

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function scanBackupForSecrets(value: unknown): BackupSecretIssue[] {
  const issues: BackupSecretIssue[] = []

  function visit(current: unknown, path: string) {
    if (typeof current === 'string') {
      if (jwtPattern.test(current) || longEyJPattern.test(current)
        || bearerPattern.test(current) || supabaseSecretPattern.test(current)) {
        issues.push({ code: 'token-pattern', path, message: '인증 token으로 보이는 값이 있습니다.' })
      }
      return
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (current !== null && typeof current === 'object') {
      Object.entries(current as Record<string, unknown>).forEach(([key, child]) => {
        const childPath = `${path}.${key}`
        if (forbiddenKeys.has(normalizedKey(key))) {
          issues.push({ code: 'forbidden-key', path: childPath, message: '백업에 허용되지 않는 key가 있습니다.' })
        }
        visit(child, childPath)
      })
    }
  }

  visit(value, '$')
  return issues
}
