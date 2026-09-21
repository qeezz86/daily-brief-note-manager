import { describe, expect, it } from 'vitest'
import { postFormSchema } from './postFormSchema'
import { toNullablePostFormValues } from './postFormValues'

describe('post form timestamp payloads', () => {
  it('converts local times and retains explicit offsets and date-only fields', () => {
    const source = { sourceName: '출처', sourceTitle: '원문', checkedPoint: '확인' }
    const values = postFormSchema.parse({
      categoryId: 'chinese-study', contentGroup: 'chinese', title: '제목', summary: '요약', slug: 'cctv-chinese-news-001', contentStatus: 'draft',
      briefingDate: '', publishedOn: '2026-09-16', wordpressUrl: '', htmlBody: '', representativeTitle: '', alternativeTitles: ['', '', '', ''], metaDescription: '', focusKeyword: '', imagePrompt: '', imageAlt: '',
      originalPublishedAt: '2026-09-16T00:30',
      sources: [
        { ...source, sourceUrl: 'https://example.com/a', sourcePublishedAt: '2026-09-16T00:30' },
        { ...source, sourceUrl: 'https://news.cctv.com/a/1', sourcePublishedAt: '2026-09-16T00:30' },
        { ...source, sourceUrl: 'https://example.com/b', sourcePublishedAt: '2026-09-15T15:30:45.123456+00:00' },
        { ...source, sourceUrl: 'https://example.com/c', sourcePublishedAt: '' },
      ],
    })
    const payload = toNullablePostFormValues(values)
    expect(payload.publishedOn).toBe('2026-09-16')
    expect(payload.briefingDate).toBeNull()
    expect(payload.originalPublishedAt).toBe('2026-09-15T16:30:00Z')
    expect(payload.sources.map((item) => item.sourcePublishedAt)).toEqual([
      '2026-09-15T15:30:00Z', '2026-09-15T16:30:00Z', '2026-09-15T15:30:45.123456+00:00', '',
    ])
    expect(toNullablePostFormValues({ ...values, originalPublishedAt: '' }).originalPublishedAt).toBeNull()
  })
})
