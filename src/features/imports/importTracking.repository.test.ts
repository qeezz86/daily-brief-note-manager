import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { validNewsTracking } from './imports.fixtures'
import { importNewsTrackingForPost } from './importTracking.repository'

const postId = '11111111-1111-4111-8111-111111111111'
const response = { postId, topicCount: 1, reusedTopicCount: 0, createdTopicCount: 1, updateCount: 1, followupCount: 0, sourceLinkCount: 1 }

describe('importNewsTrackingForPost', () => {
  it('calls the dedicated RPC and validates counts', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null })
    await expect(importNewsTrackingForPost({ rpc } as unknown as DatabaseClient, postId, validNewsTracking())).resolves.toEqual(response)
    expect(rpc).toHaveBeenCalledWith('import_news_tracking_for_post', expect.objectContaining({ p_post_id: postId, p_tracking: expect.any(Object) }))
  })

  it('maps RPC errors and response mismatch safely', async () => {
    const failed = vi.fn().mockResolvedValue({ data: null, error: { code: '23514', message: 'IMPORT_TRACKING_SOURCE_NOT_FOUND', details: 'private' } })
    await expect(importNewsTrackingForPost({ rpc: failed } as unknown as DatabaseClient, postId, validNewsTracking())).rejects.toMatchObject({ errorCode: 'IMPORT_TRACKING_SOURCE_NOT_FOUND' })
    const mismatch = vi.fn().mockResolvedValue({ data: { postId }, error: null })
    await expect(importNewsTrackingForPost({ rpc: mismatch } as unknown as DatabaseClient, postId, validNewsTracking())).rejects.toMatchObject({ errorCode: 'IMPORT_TRACKING_RPC_UNAVAILABLE' })
  })
})
