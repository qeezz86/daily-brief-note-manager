import { describe, expect, it, vi } from 'vitest'
import { executeSelectedImports, importContentPost } from './importExecution.repository'
import { SafeImportError } from './importExecution.types'
import type { DatabaseClient } from '../../shared/supabase/client'
import { validNewsPost } from './imports.fixtures'

const post = (id: string) => ({ postId: id, title: id, categoryId: 'economy', status: 'draft', slug: id, displayId: null, publishedOn: null, wordpressUrl: null })
const candidates = ['one', 'two', 'three'].map((clientKey) => ({ clientKey, title: clientKey, categoryId: 'economy', rawItem: { clientKey } }))
const trackingResult = { postId: '00000000-0000-0000-0000-000000000001', topicCount: 1, reusedTopicCount: 0, createdTopicCount: 1, updateCount: 1, followupCount: 0, sourceLinkCount: 1 }

describe('executeSelectedImports', () => {
  it('executes RPC calls sequentially and preserves input order', async () => {
    let active = 0; let maxActive = 0
    const importer = vi.fn(async (value: unknown) => {
      active += 1; maxActive = Math.max(maxActive, active)
      await Promise.resolve(); active -= 1
      return post((value as { clientKey: string }).clientKey.padEnd(36, '0').slice(0, 36))
    })
    const result = await executeSelectedImports(candidates, importer)
    expect(maxActive).toBe(1)
    expect(result.items.map((item) => item.externalKey)).toEqual(['one', 'two', 'three'])
    expect(result.imported).toBe(3)
  })

  it('continues after an item-level failure', async () => {
    const importer = vi.fn(async (value: unknown) => {
      if ((value as { clientKey: string }).clientKey === 'two') throw new SafeImportError('IMPORT_DUPLICATE_SLUG', 'duplicate')
      return post('00000000-0000-0000-0000-000000000001')
    })
    const result = await executeSelectedImports(candidates, importer)
    expect(importer).toHaveBeenCalledTimes(3)
    expect(result.items.map((item) => item.status)).toEqual(['imported', 'failed', 'imported'])
  })

  it('stops remaining RPC calls after a fatal error', async () => {
    const importer = vi.fn(async () => { throw new SafeImportError('IMPORT_AUTH_REQUIRED', 'expired', true) })
    const result = await executeSelectedImports(candidates, importer)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(result.items.map((item) => item.status)).toEqual(['failed', 'skipped', 'skipped'])
  })

  it('reports progress without exposing raw input', async () => {
    const progress = vi.fn()
    await executeSelectedImports(candidates.slice(0, 1), async () => post('00000000-0000-0000-0000-000000000001'), progress)
    expect(progress).toHaveBeenLastCalledWith({ completed: 1, total: 1, currentTitle: null, imported: 1, failed: 0, skipped: 0, trackingImported: 0, trackingFailed: 0 })
  })
  it('returns an empty completed result for no candidates', async () => {
    const result = await executeSelectedImports([], vi.fn())
    expect(result).toMatchObject({ total: 0, imported: 0, failed: 0, skipped: 0, items: [] }); expect(result.completedAt).toBeTruthy()
  })
  it('merges preflight skipped rows in original selection order', async () => {
    const skipped = [{ externalKey: 'two', title: 'two', categoryId: 'economy', status: 'skipped' as const, contentStatus: 'skipped' as const, trackingStatus: 'not_applicable' as const, errorCode: 'IMPORT_DUPLICATE_PREFLIGHT' }]
    const result = await executeSelectedImports([candidates[0], candidates[2]], async () => post('11111111-1111-4111-8111-111111111111'), undefined, skipped, ['one', 'two', 'three'])
    expect(result.items.map((item) => item.externalKey)).toEqual(['one', 'two', 'three']); expect(result.skipped).toBe(1)
  })
  it('records a safe error code and message for failures', async () => {
    const result = await executeSelectedImports(candidates.slice(0, 1), async () => { throw new SafeImportError('IMPORT_DUPLICATE_SERIES', '중복 시리즈') })
    expect(result.items[0]).toMatchObject({ status: 'failed', errorCode: 'IMPORT_DUPLICATE_SERIES', message: '중복 시리즈' })
  })
  it('uses app-local detail paths only for successful rows', async () => {
    const result = await executeSelectedImports(candidates.slice(0, 1), async () => post('11111111-1111-4111-8111-111111111111'))
    expect(result.items[0].postPath).toBe('/content/11111111-1111-4111-8111-111111111111')
  })
  it('imports tracking only after news content succeeds', async () => {
    const news = [{ ...candidates[0], isNews: true, rawItem: { newsTracking: { topics: [] } } }]
    const trackingImporter = vi.fn().mockResolvedValue(trackingResult)
    const result = await executeSelectedImports(news, async () => post(trackingResult.postId), undefined, [], ['one'], trackingImporter)
    expect(trackingImporter).toHaveBeenCalledWith(trackingResult.postId, { topics: [] })
    expect(result.items[0]).toMatchObject({ contentStatus: 'imported', trackingStatus: 'imported', createdTopicCount: 1 })
  })
  it('marks news without tracking as not present and never calls tracking RPC', async () => {
    const trackingImporter = vi.fn()
    const result = await executeSelectedImports([{ ...candidates[0], isNews: true }], async () => post(trackingResult.postId), undefined, [], ['one'], trackingImporter)
    expect(trackingImporter).not.toHaveBeenCalled()
    expect(result.items[0].trackingStatus).toBe('not_present')
  })
  it('keeps content success and continues after an item tracking failure', async () => {
    const news = candidates.slice(0, 2).map((candidate) => ({ ...candidate, isNews: true, rawItem: { newsTracking: {} } }))
    const trackingImporter = vi.fn().mockRejectedValueOnce(new SafeImportError('IMPORT_TRACKING_INVALID_FOLLOWUP', 'invalid')).mockResolvedValueOnce(trackingResult)
    const result = await executeSelectedImports(news, async () => post(trackingResult.postId), undefined, [], ['one', 'two'], trackingImporter)
    expect(result.items.map((item) => [item.contentStatus, item.trackingStatus])).toEqual([['imported', 'failed'], ['imported', 'imported']])
    expect(result.trackingFailed).toBe(1)
  })
  it('does not call tracking when content import fails', async () => {
    const trackingImporter = vi.fn()
    const result = await executeSelectedImports([{ ...candidates[0], isNews: true, rawItem: { newsTracking: {} } }], async () => { throw new SafeImportError('IMPORT_DUPLICATE_SLUG', 'duplicate') }, undefined, [], ['one'], trackingImporter)
    expect(trackingImporter).not.toHaveBeenCalled()
    expect(result.items[0]).toMatchObject({ contentStatus: 'failed', trackingStatus: 'not_applicable' })
  })
})

describe('importContentPost', () => {
  it('calls only the import RPC and validates its response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: post('11111111-1111-4111-8111-111111111111'), error: null })
    const result = await importContentPost({ rpc } as unknown as DatabaseClient, validNewsPost())
    expect(rpc).toHaveBeenCalledWith('import_content_post', expect.objectContaining({ p_item: expect.objectContaining({ category_id: 'economy' }) }))
    expect(result.postId).toBe('11111111-1111-4111-8111-111111111111')
  })
  it('maps raw Supabase errors to safe errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'IMPORT_DUPLICATE_SLUG', details: 'secret_constraint' } })
    await expect(importContentPost({ rpc } as unknown as DatabaseClient, validNewsPost())).rejects.toMatchObject({ errorCode: 'IMPORT_DUPLICATE_SLUG' })
  })
  it('rejects an unexpected RPC response shape', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { postId: 'not-a-uuid' }, error: null })
    await expect(importContentPost({ rpc } as unknown as DatabaseClient, validNewsPost())).rejects.toMatchObject({ errorCode: 'IMPORT_RPC_UNAVAILABLE' })
  })
})
