import { describe, expect, it } from 'vitest'
import { calculateBackupChecksum, BackupChecksumUnavailableError, verifyBackupChecksum } from './calculateBackupChecksum'

describe('backup checksum', () => {
  it('object key 순서는 checksum에 영향이 없다', async () => {
    expect(await calculateBackupChecksum({ a: 1, b: 2 })).toBe(await calculateBackupChecksum({ b: 2, a: 1 }))
  })
  it('array 순서가 바뀌면 checksum도 바뀐다', async () => {
    expect(await calculateBackupChecksum([1, 2])).not.toBe(await calculateBackupChecksum([2, 1]))
  })
  it('data 값이 바뀌면 checksum도 바뀐다', async () => {
    expect(await calculateBackupChecksum({ data: 1 })).not.toBe(await calculateBackupChecksum({ data: 2 }))
  })
  it('lowercase SHA-256 hexadecimal 형식이다', async () => {
    expect(await calculateBackupChecksum({ data: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
  it('checksum field를 제외한 payload를 검증한다', async () => {
    const payload = { format: 'backup', data: { value: 1 } }
    const checksum = await calculateBackupChecksum(payload)
    await expect(verifyBackupChecksum({ ...payload, checksum: { value: checksum } })).resolves.toBe(true)
  })
  it('생성 직후 verify가 성공한다', async () => {
    const checksum = await calculateBackupChecksum({ a: 1 })
    expect(await verifyBackupChecksum({ a: 1, checksum: { value: checksum } })).toBe(true)
  })
  it('변조 후 verify가 실패한다', async () => {
    const checksum = await calculateBackupChecksum({ a: 1 })
    expect(await verifyBackupChecksum({ a: 2, checksum: { value: checksum } })).toBe(false)
  })
  it('crypto.subtle 미지원 상태를 차단한다', async () => {
    await expect(calculateBackupChecksum({}, {} as Crypto)).rejects.toBeInstanceOf(BackupChecksumUnavailableError)
  })
})
