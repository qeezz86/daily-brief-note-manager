import { describe, expect, it } from 'vitest'

import { corsHeaders } from './cors.ts'
import { DiagnosticError } from './errors.ts'

describe('corsHeaders', () => {
  const origins = new Set(['https://app.example.com'])

  it('reflects only an allowlisted origin with the required invoke headers', () => {
    const headers = corsHeaders('https://app.example.com', origins)
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(headers.get('Access-Control-Allow-Origin')).not.toBe('*')
    expect(headers.get('Access-Control-Allow-Headers')).toContain('authorization')
    expect(headers.get('Access-Control-Allow-Headers')).toContain('apikey')
    expect(headers.get('Access-Control-Allow-Headers')).toContain('content-type')
    expect(headers.get('Vary')).toBe('Origin')
  })

  it.each(['', 'https://evil.example.com'])('rejects origin %s', (origin) => {
    expect(() => corsHeaders(origin, origins)).toThrow(DiagnosticError)
  })
})
