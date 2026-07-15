import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { backupRestoreBundleFixture } from './backupRestore.fixtures'
import { getBackupConflictReferenceData, getBackupRestoreCategories } from './backupConflicts.repository'

function mockClient(handler: (table: string, column: string, values: unknown[], projection: string) => { data: unknown[] | null; error: unknown }) {
  const calls: Array<{ table: string; column: string; values: unknown[]; projection: string }> = []
  const from = vi.fn((table: string) => ({
    select: (projection: string) => ({
      in: async (column: string, values: unknown[]) => {
        calls.push({ table, column, values, projection })
        return handler(table, column, values, projection)
      },
      order: async () => ({ data: [], error: null }),
    }),
  }))
  return { client: { from } as unknown as DatabaseClient, calls, from }
}

describe('backup conflict repository', () => {
  it('category projection에 owner를 사용하지 않는다', async () => {
    const { client, from } = mockClient(() => ({ data: [], error: null }))
    await getBackupRestoreCategories(client)
    expect(from).toHaveBeenCalledWith('categories')
  })
  it('모든 후보 조회를 100개 이하 chunk로 제한한다', async () => {
    const bundle = await backupRestoreBundleFixture()
    bundle.data.posts = Array.from({ length: 205 }, (_, index) => ({ ...bundle.data.posts[0], id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000001`, slug: `slug-${index}`, wordpressUrl: `https://example.com/${index}` }))
    const { client, calls } = mockClient(() => ({ data: [], error: null }))
    await getBackupConflictReferenceData(client, bundle)
    expect(calls.length).toBeGreaterThan(3); expect(calls.every((call) => call.values.length <= 100)).toBe(true)
  })
  it('일부 chunk 실패를 partial로 분류한다', async () => {
    const bundle = await backupRestoreBundleFixture(); let count = 0
    const { client } = mockClient(() => ({ data: [], error: count++ === 0 ? { message: 'raw' } : null }))
    expect((await getBackupConflictReferenceData(client, bundle)).databaseCheck).toBe('partial')
  })
  it('모든 실행 chunk 실패를 unavailable로 분류한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const { client } = mockClient(() => ({ data: null, error: { message: 'raw' } }))
    expect((await getBackupConflictReferenceData(client, bundle)).databaseCheck).toBe('unavailable')
  })
  it('select projection과 query 값에 owner_id를 넣지 않는다', async () => {
    const bundle = await backupRestoreBundleFixture(); const { client, calls } = mockClient(() => ({ data: [], error: null }))
    await getBackupConflictReferenceData(client, bundle)
    expect(JSON.stringify(calls)).not.toMatch(/owner_id|ownerId/)
  })
})
