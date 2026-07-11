import { describe, expect, it } from 'vitest'

import { postFormSchema } from './postFormSchema'

const validValues = {
  categoryId: 'ai-column',
  contentGroup: 'ai' as const,
  title: 'AI 에이전트 이해하기',
  summary: 'AI 에이전트의 핵심 개념을 정리합니다.',
  slug: 'ai-agent-guide',
  contentStatus: 'draft' as const,
  briefingDate: '',
  publishedOn: '',
  wordpressUrl: '',
  htmlBody: '',
  representativeTitle: '',
  alternativeTitles: ['', '', '', ''],
  metaDescription: '',
  focusKeyword: '',
  imagePrompt: '',
  imageAlt: '',
}

describe('postFormSchema', () => {
  it('requires category, title, summary, and slug', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      categoryId: '',
      title: ' ',
      summary: '',
      slug: '',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    const paths = result.error.issues.map((issue) => issue.path[0])
    expect(paths).toEqual(
      expect.arrayContaining(['categoryId', 'title', 'summary', 'slug']),
    )
  })

  it('rejects uppercase, leading, trailing, and consecutive slug hyphens', () => {
    for (const slug of ['Bad-Slug', '-bad-slug', 'bad-slug-', 'bad--slug']) {
      const result = postFormSchema.safeParse({ ...validValues, slug })
      expect(result.success).toBe(false)
    }
  })

  it('requires a publication date for published content', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      contentStatus: 'published',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['publishedOn'] }),
      ]),
    )
  })

  it('requires a briefing date for news content', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      categoryId: 'economy',
      contentGroup: 'news',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['briefingDate'] }),
      ]),
    )
  })

  it('trims saved strings and accepts empty optional values', () => {
    const result = postFormSchema.parse({
      ...validValues,
      title: '  AI 에이전트 이해하기  ',
      wordpressUrl: ' ',
    })

    expect(result.title).toBe('AI 에이전트 이해하기')
    expect(result.wordpressUrl).toBe('')
  })

  it('requires complete HTML, SEO, and image fields for ready content', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      contentStatus: 'ready',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining([
        'htmlBody',
        'representativeTitle',
        'alternativeTitles',
        'metaDescription',
        'focusKeyword',
        'imagePrompt',
        'imageAlt',
      ]),
    )
  })

  it('rejects duplicate alternative titles', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      alternativeTitles: ['같은 제목', '다른 제목', '같은 제목', '또 다른 제목'],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['alternativeTitles'] }),
      ]),
    )
  })

  it('requires exactly four non-empty alternative titles for ready content', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      contentStatus: 'ready',
      htmlBody: '<div><h1>본문</h1></div>',
      representativeTitle: '대표 제목',
      alternativeTitles: ['대안 1', '대안 2', '대안 3', ''],
      metaDescription: '메타 설명',
      focusKeyword: '키워드',
      imagePrompt: '프롬프트',
      imageAlt: 'ALT',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['alternativeTitles'] }),
      ]),
    )
  })
})
