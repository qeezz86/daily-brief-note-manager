import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { fetchTaxonomyCatalog, prepareWordPressPublication, WordPressPreviewServiceError } from './wordpressPublicationPreview.service'

function client(data: unknown, error: unknown = null) {
  return { functions: { invoke: vi.fn().mockResolvedValue({ data, error }) } } as unknown as DatabaseClient
}

const catalog = { schemaVersion: 1, ok: true, mode: 'dry-run', writePerformed: false, checkedAt: '2026-07-18T00:00:00Z', site: { origin: 'https://wordpress.example.com' }, catalog: { categories: [], tags: [], categoryPages: 1, tagPages: 1 } }

describe('wordpress publication preview service', () => {
  it('catalog 요청에는 고정 action만 전달한다', async () => {
    const db = client(catalog)
    await fetchTaxonomyCatalog(db)
    expect(db.functions.invoke).toHaveBeenCalledWith('wordpress-publication-preview', { method: 'POST', body: { action: 'get-taxonomy-catalog' } })
  })

  it('publication 요청에는 action과 contentId만 전달한다', async () => {
    const db = client({ invalid: true })
    await expect(prepareWordPressPublication(db, '10000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(db.functions.invoke).toHaveBeenCalledWith('wordpress-publication-preview', { method: 'POST', body: { action: 'prepare-publication', contentId: '10000000-0000-4000-8000-000000000001' } })
  })

  it('raw function 오류를 노출하지 않는다', async () => {
    await expect(fetchTaxonomyCatalog(client(null, new Error('private credential error')))).rejects.toEqual(expect.objectContaining<Partial<WordPressPreviewServiceError>>({ code: 'UNKNOWN', message: 'WordPress Dry Run 요청을 완료하지 못했습니다.' }))
  })
})
