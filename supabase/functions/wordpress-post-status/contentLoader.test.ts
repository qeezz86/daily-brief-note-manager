import { describe, expect, it, vi } from 'vitest'
import { loadSyncableAttempt } from './contentLoader'

function client(row: unknown) { const maybeSingle = vi.fn(async () => ({ data: row, error: null })); const eq = vi.fn(() => ({ eq, maybeSingle })); return { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) } as never }
const row = { id: 'a', owner_id: 'owner', content_id: 'content', operation: 'create_draft', status: 'succeeded', site_origin: 'https://example.com', wordpress_post_id: 1, wordpress_post_status: 'draft', wordpress_post_slug: 'post', wordpress_post_link: 'https://example.com/post' }
describe('syncable attempt loader', () => {
  it('requires an exact successful create_draft record', async () => await expect(loadSyncableAttempt(client(row), 'owner', 'content', 'a', 'https://example.com')).resolves.toMatchObject({ wordpressPostId: 1 }))
  it('rejects non-succeeded and non-positive records', async () => await expect(loadSyncableAttempt(client({ ...row, status: 'uncertain', wordpress_post_id: null }), 'owner', 'content', 'a', 'https://example.com')).rejects.toThrow())
})
