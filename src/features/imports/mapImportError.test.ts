import { describe, expect, it } from 'vitest'
import { mapKnownImportError } from './mapImportError'

describe('mapKnownImportError', () => {
  it('maps known duplicate errors without constraint details', () => {
    const error = mapKnownImportError({ code: '23505', message: 'IMPORT_DUPLICATE_SLUG', details: 'posts_owner_slug_key' })
    expect(error.errorCode).toBe('IMPORT_DUPLICATE_SLUG')
    expect(error.message).not.toContain('posts_owner_slug_key')
  })
  it('marks auth and RPC availability failures as fatal', () => {
    expect(mapKnownImportError({ code: '42501', message: 'denied' }).stopExecution).toBe(true)
    expect(mapKnownImportError({ code: 'PGRST202', message: 'import_content_post missing' }).stopExecution).toBe(true)
  })
  it('returns a safe unknown message', () => {
    const error = mapKnownImportError({ message: 'select * from private_table' })
    expect(error.errorCode).toBe('IMPORT_UNKNOWN_ERROR')
    expect(error.message).not.toContain('private_table')
  })
  it.each([
    ['IMPORT_DUPLICATE_WORDPRESS_URL', 'WordPress URL'],
    ['IMPORT_DUPLICATE_BRIEFING', '브리핑'],
    ['IMPORT_DUPLICATE_SERIES', '시리즈 번호'],
    ['IMPORT_DUPLICATE_CHINESE_URL', '중국어 원문 URL'],
    ['IMPORT_INVALID_CATEGORY', '카테고리'],
    ['IMPORT_INVALID_METADATA', 'metadata'],
    ['IMPORT_FORBIDDEN_FIELD', '내부 필드'],
    ['IMPORT_VALIDATION_FAILED', 'DB 저장 검증'],
  ])('maps %s to a safe localized message', (code, messagePart) => {
    const error = mapKnownImportError({ message: `${code}: raw database text` })
    expect(error.errorCode).toBe(code); expect(error.message).toContain(messagePart); expect(error.message).not.toContain('raw database text')
  })
  it('marks a network failure as fatal without echoing its raw message', () => {
    const error = mapKnownImportError({ message: 'Failed to fetch https://secret.invalid' })
    expect(error.errorCode).toBe('IMPORT_CONNECTION_FAILED'); expect(error.stopExecution).toBe(true); expect(error.message).not.toContain('secret.invalid')
  })
})
