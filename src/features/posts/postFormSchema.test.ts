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
})
