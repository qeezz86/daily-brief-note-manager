import { describe, expect, it } from 'vitest'
import { canonicalizeImportPayload } from './canonicalizeImportPayload'
import { createImportFingerprint, ImportFingerprintUnavailableError } from './createImportFingerprint'

describe('canonicalizeImportPayload', () => {
  it('object key를 사전순으로 정렬한다', () => { expect(canonicalizeImportPayload({ z: 1, a: 2 })).toBe('{"a":2,"z":1}') })
  it('중첩 object key도 정렬한다', () => { expect(canonicalizeImportPayload({ x: { b: 1, a: 2 } })).toBe('{"x":{"a":2,"b":1}}') })
  it('array 순서는 보존한다', () => { expect(canonicalizeImportPayload([3, 2, 1])).toBe('[3,2,1]') })
  it('object undefined는 제거한다', () => { expect(canonicalizeImportPayload({ a: 1, b: undefined })).toBe('{"a":1}') })
  it('array undefined는 null로 위치를 보존한다', () => { expect(canonicalizeImportPayload([1, undefined, 3])).toBe('[1,null,3]') })
  it('null, boolean, number와 문자열 공백을 그대로 보존한다', () => { expect(canonicalizeImportPayload({ n: null, b: false, x: 1, s: ' a ' })).toBe('{"b":false,"n":null,"s":" a ","x":1}') })
  it('비유한 숫자를 거부한다', () => { expect(() => canonicalizeImportPayload({ value: Number.NaN })).toThrow(/유한한 숫자/) })
})

describe('createImportFingerprint', () => {
  it('동일 payload는 동일 hash를 만든다', async () => { expect(await createImportFingerprint({ a: 1 })).toBe(await createImportFingerprint({ a: 1 })) })
  it('object key 순서만 다르면 동일 hash다', async () => { expect(await createImportFingerprint({ a: 1, b: 2 })).toBe(await createImportFingerprint({ b: 2, a: 1 })) })
  it('array 순서가 다르면 hash가 다르다', async () => { expect(await createImportFingerprint([1, 2])).not.toBe(await createImportFingerprint([2, 1])) })
  it('값이 달라지면 hash가 다르다', async () => { expect(await createImportFingerprint({ a: 1 })).not.toBe(await createImportFingerprint({ a: 2 })) })
  it('lowercase SHA-256 hexadecimal 형식이다', async () => { expect(await createImportFingerprint({ a: 1 })).toMatch(/^[0-9a-f]{64}$/) })
  it('crypto.subtle 미지원 상태를 안전하게 거부한다', async () => { await expect(createImportFingerprint({}, {} as Crypto)).rejects.toBeInstanceOf(ImportFingerprintUnavailableError) })
})
