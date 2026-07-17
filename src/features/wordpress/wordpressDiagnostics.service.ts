import type { DatabaseClient } from '../../shared/supabase/client'
import { wordpressDiagnosticsErrorSchema, wordpressDiagnosticsSchema } from './wordpressDiagnostics.schema'
import type { WordPressDiagnosticsResult } from './wordpressDiagnostics.types'

const knownErrorMessages: Record<string, string> = {
  CALLER_UNAUTHENTICATED: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  CALLER_FORBIDDEN: '이 WordPress 연결을 진단할 권한이 없습니다.',
  CONFIG_MISSING: '서버의 WordPress 연결 설정이 완료되지 않았습니다.',
  CONFIG_INVALID: '서버의 WordPress 연결 설정을 확인해 주세요.',
  ORIGIN_FORBIDDEN: '현재 앱 주소는 진단 호출이 허용되지 않았습니다.',
  WORDPRESS_URL_INVALID: '서버의 WordPress 사이트 URL 설정을 확인해 주세요.',
  WORDPRESS_AUTH_FAILED: 'WordPress 인증에 실패했습니다. Application Password 설정을 확인해 주세요.',
  WORDPRESS_FORBIDDEN: 'WordPress 읽기 권한이 부족합니다.',
  WORDPRESS_TIMEOUT: 'WordPress 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  REST_API_UNREACHABLE: 'WordPress REST API에 연결할 수 없습니다.',
}

export class WordPressDiagnosticsServiceError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = 'WordPressDiagnosticsServiceError'
    this.code = code
    this.retryable = retryable
  }
}

async function errorPayload(error: unknown): Promise<unknown> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try {
    return await context.clone().json()
  } catch {
    return null
  }
}

export async function diagnoseWordPress(client: DatabaseClient | null): Promise<WordPressDiagnosticsResult> {
  if (!client) throw new WordPressDiagnosticsServiceError('CLIENT_UNAVAILABLE', 'Supabase 연결이 설정되지 않았습니다.')

  const { data, error } = await client.functions.invoke('wordpress-diagnostics', {
    method: 'POST',
    body: { action: 'diagnose' },
  })

  if (error) {
    const parsed = wordpressDiagnosticsErrorSchema.safeParse(await errorPayload(error))
    if (parsed.success) {
      const detail = parsed.data.error
      throw new WordPressDiagnosticsServiceError(
        detail.code,
        knownErrorMessages[detail.code] ?? detail.message,
        detail.retryable,
      )
    }
    throw new WordPressDiagnosticsServiceError('UNKNOWN', 'WordPress 진단 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.', true)
  }

  const parsed = wordpressDiagnosticsSchema.safeParse(data)
  if (!parsed.success) {
    throw new WordPressDiagnosticsServiceError('INVALID_RESPONSE', 'WordPress 진단 응답을 확인할 수 없습니다.')
  }
  return parsed.data
}
