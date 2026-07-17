import type { DatabaseClient } from '../../shared/supabase/client'
import { describe, expect, it, vi } from 'vitest'

import { readyWordPressDiagnostics } from './wordpressDiagnostics.fixtures'
import { diagnoseWordPress, WordPressDiagnosticsServiceError } from './wordpressDiagnostics.service'

function client(result: { data: unknown; error: unknown }): DatabaseClient {
  return { functions: { invoke: vi.fn().mockResolvedValue(result) } } as unknown as DatabaseClient
}

describe('diagnoseWordPress', () => {
  it('invokes only wordpress-diagnostics with the fixed action and parses success', async () => {
    const mockClient = client({ data: readyWordPressDiagnostics, error: null })
    await expect(diagnoseWordPress(mockClient)).resolves.toEqual(readyWordPressDiagnostics)
    expect(mockClient.functions.invoke).toHaveBeenCalledWith('wordpress-diagnostics', { method: 'POST', body: { action: 'diagnose' } })
  })

  it('rejects an invalid success response', async () => {
    await expect(diagnoseWordPress(client({ data: { ok: true, password: 'unexpected' }, error: null }))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([
    ['WORDPRESS_AUTH_FAILED', 'WordPress 인증에 실패했습니다. Application Password 설정을 확인해 주세요.'],
    ['CALLER_FORBIDDEN', '이 WordPress 연결을 진단할 권한이 없습니다.'],
    ['WORDPRESS_TIMEOUT', 'WordPress 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'],
  ])('maps known safe error %s', async (code, message) => {
    const body = { schemaVersion: 1, ok: false, error: { code, message: 'server message', retryable: code === 'WORDPRESS_TIMEOUT' } }
    const error = { context: new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) }
    await expect(diagnoseWordPress(client({ data: null, error }))).rejects.toMatchObject({ code, message })
  })

  it('uses a bounded message for unknown invoke failures', async () => {
    await expect(diagnoseWordPress(client({ data: null, error: new Error('raw credential detail') }))).rejects.toMatchObject({ code: 'UNKNOWN' })
    try {
      await diagnoseWordPress(client({ data: null, error: new Error('raw credential detail') }))
    } catch (error) {
      expect(error).toBeInstanceOf(WordPressDiagnosticsServiceError)
      expect((error as Error).message).not.toContain('credential')
    }
  })

  it('fails clearly when the Supabase client is unavailable', async () => {
    await expect(diagnoseWordPress(null)).rejects.toMatchObject({ code: 'CLIENT_UNAVAILABLE' })
  })
})
