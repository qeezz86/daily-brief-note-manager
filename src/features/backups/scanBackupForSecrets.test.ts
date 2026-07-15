import { describe, expect, it } from 'vitest'
import { scanBackupForSecrets } from './scanBackupForSecrets'

describe('scanBackupForSecrets', () => {
  it.each([
    'owner_id', 'ownerId', 'email', 'access_token', 'refreshToken',
    'serviceRole', 'password', 'secret', 'anonKey', 'cookie', 'rawSql',
    'rawPostgrestError', 'stackTrace',
  ])('%s key를 차단한다', (key) => {
    expect(scanBackupForSecrets({ [key]: 'value' })[0]?.code).toBe('forbidden-key')
  })
  it('JWT 형태를 차단한다', () => expect(scanBackupForSecrets({ value: 'eyJabcdefghij.abcdefghij.abcdefghij' })[0]?.code).toBe('token-pattern'))
  it('Bearer header를 차단한다', () => expect(scanBackupForSecrets({ value: `Bearer ${'a'.repeat(40)}` })[0]?.code).toBe('token-pattern'))
  it('service role key 형태를 차단한다', () => expect(scanBackupForSecrets({ value: `sb_secret_${'a'.repeat(20)}` })[0]?.code).toBe('token-pattern'))
  it('일반 본문의 email 단어는 차단하지 않는다', () => expect(scanBackupForSecrets({ body: 'email이라는 단어를 설명하는 일반 문장' })).toEqual([]))
  it('안전한 snapshot을 통과시킨다', () => expect(scanBackupForSecrets({ data: { posts: [{ title: '안전한 글' }] } })).toEqual([]))
})
