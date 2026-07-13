import { describe, expect, it } from 'vitest'
import { ImportInputError, parseImportJsonText } from './importSchema'

describe('parseImportJsonText', () => {
  it('BOM이 있는 JSON을 파싱한다', () => expect(parseImportJsonText('\uFEFF{"format":"daily-brief-note-content-import","schemaVersion":1,"posts":[]}')).toEqual({ format: 'daily-brief-note-content-import', schemaVersion: 1, posts: [] }))
  it.each([
    ['', 'BUNDLE_EMPTY_INPUT'],
    ['   ', 'BUNDLE_EMPTY_INPUT'],
    ['{', 'BUNDLE_JSON_INVALID'],
    ['null trailing', 'BUNDLE_JSON_INVALID'],
  ])('잘못된 입력을 차단한다 %#', (text, code) => {
    expect(() => parseImportJsonText(text)).toThrowError(ImportInputError)
    try { parseImportJsonText(text) } catch (error) { expect((error as ImportInputError).code).toBe(code) }
  })
  it.each(['__proto__', 'constructor', 'prototype'])('%s key를 차단한다', (key) => {
    try { parseImportJsonText(`{"format":"daily-brief-note-content-import","schemaVersion":1,"posts":[{"${key}":{}}]}`) }
    catch (error) { expect((error as ImportInputError).code).toBe('BUNDLE_FORBIDDEN_KEY'); return }
    throw new Error('차단되지 않았습니다.')
  })
  it('과도한 중첩을 차단한다', () => {
    const text = `${'{"a":'.repeat(32)}null${'}'.repeat(32)}`
    try { parseImportJsonText(text) } catch (error) { expect((error as ImportInputError).code).toBe('BUNDLE_NESTING_TOO_DEEP'); return }
    throw new Error('차단되지 않았습니다.')
  })
})
