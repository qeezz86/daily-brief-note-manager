import { describe, expect, it } from 'vitest'
import { createDeterministicRestoreId } from './createDeterministicRestoreId'

const checksum = 'a'.repeat(64)
const source = '10000000-0000-4000-8000-000000000001'

describe('createDeterministicRestoreId', () => {
  it('동일 입력에 동일 UUID v5를 만든다', async () => {
    const first = await createDeterministicRestoreId(checksum, 'posts', source)
    expect(await createDeterministicRestoreId(checksum, 'posts', source)).toBe(first)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(first).not.toBe(source)
  })
  it('section 또는 backup checksum이 다르면 다른 UUID를 만든다', async () => {
    const base = await createDeterministicRestoreId(checksum, 'posts', source)
    expect(await createDeterministicRestoreId(checksum, 'tags', source)).not.toBe(base)
    expect(await createDeterministicRestoreId('b'.repeat(64), 'posts', source)).not.toBe(base)
  })
})

