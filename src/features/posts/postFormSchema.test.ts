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

const validChineseReadyValues = {
  ...validValues,
  categoryId: 'chinese-study', categoryName: '중국어 학습', contentGroup: 'chinese' as const,
  contentStatus: 'ready' as const, htmlBody: '<div><h1>본문</h1></div>', representativeTitle: '대표',
  alternativeTitles: ['1', '2', '3', '4'], metaDescription: '설명', focusKeyword: '키워드', imagePrompt: '프롬프트', imageAlt: 'ALT',
  tags: ['A', 'B', 'C', 'D', 'E'], sources: [{ sourceName: 'CCTV', sourceTitle: '원문', sourceUrl: 'https://news.cctv.com/a/1', sourcePublishedAt: '2026-07-11T12:00', checkedPoint: '확인' }],
  learningTopic: '학습 주제', programName: 'CCTV 뉴스', originalTitle: '원문 제목', originalUrl: 'https://news.cctv.com/a/1', originalPublishedAt: '2026-07-11T12:00', episodeListIncluded: 'true' as const, verifiedCoreFact: '확인한 사실', difficulty: '', learningPoints: '',
}

const validAiReadyValues = {
  ...validValues,
  contentStatus: 'ready' as const,
  htmlBody: '<div><h1>본문</h1></div>', representativeTitle: '대표',
  alternativeTitles: ['1', '2', '3', '4'], metaDescription: '설명', focusKeyword: '키워드', imagePrompt: '프롬프트', imageAlt: 'ALT',
  tags: ['A', 'B', 'C', 'D', 'E'], sources: [{ sourceName: '기관', sourceTitle: '원문', sourceUrl: 'https://example.com/a', sourcePublishedAt: '', checkedPoint: '확인' }],
  fieldName: '생성형 AI', metadataDifficulty: 'intermediate' as const, estimatedReadMin: '8', referenceDate: '',
}

describe('postFormSchema', () => {
  it('allows AI and information DB drafts without metadata', () => {
    expect(postFormSchema.safeParse({ ...validValues, contentGroup: 'ai' }).success).toBe(true)
    expect(postFormSchema.safeParse({ ...validValues, categoryId: 'info-db', contentGroup: 'info_db' }).success).toBe(true)
  })

  it.each(['fieldName', 'metadataDifficulty', 'estimatedReadMin'] as const)('requires %s for ready AI content', (field) => {
    const result = postFormSchema.safeParse({ ...validAiReadyValues, [field]: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toContain(field)
  })

  it('rejects zero and decimal estimated read times while allowing an optional information-DB reference date', () => {
    expect(postFormSchema.safeParse({ ...validAiReadyValues, estimatedReadMin: '0' }).success).toBe(false)
    expect(postFormSchema.safeParse({ ...validAiReadyValues, estimatedReadMin: '1.5' }).success).toBe(false)
    expect(postFormSchema.safeParse({ ...validAiReadyValues, categoryId: 'info-db', contentGroup: 'info_db', referenceDate: '' }).success).toBe(true)
  })
  it('allows a Chinese draft with no metadata', () => {
    expect(postFormSchema.safeParse({ ...validValues, categoryId: 'chinese-study', contentGroup: 'chinese' }).success).toBe(true)
  })

  it.each([
    ['learningTopic', 'learningTopic'], ['programName', 'programName'], ['originalTitle', 'originalTitle'],
    ['originalUrl', 'originalUrl'], ['originalPublishedAt', 'originalPublishedAt'],
    ['episodeListIncluded', 'episodeListIncluded'], ['verifiedCoreFact', 'verifiedCoreFact'],
  ] as const)('rejects ready Chinese content without %s', (field, expectedPath) => {
    const value = field === 'episodeListIncluded' ? '' : ''
    const result = postFormSchema.safeParse({ ...validChineseReadyValues, [field]: value })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toContain(expectedPath)
  })

  it('rejects a spoofed CCTV original URL even when its source matches', () => {
    const result = postFormSchema.safeParse({
      ...validChineseReadyValues,
      originalUrl: 'https://cctv.com.example.com/a/1',
      sources: [{ ...validChineseReadyValues.sources[0], sourceUrl: 'https://cctv.com.example.com/a/1' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('공식 CCTV 개별 원문 URL을 입력해 주세요.')
  })

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

  it('allows a draft with zero tags and sources', () => {
    expect(postFormSchema.safeParse({ ...validValues, tags: [], sources: [] }).success).toBe(true)
  })

  it.each([4, 9])('rejects ready content with %i tags', (count) => {
    const result = postFormSchema.safeParse({
      ...validValues,
      contentStatus: 'ready',
      htmlBody: '<div><h1>본문</h1></div>', representativeTitle: '대표',
      alternativeTitles: ['1', '2', '3', '4'], metaDescription: '설명',
      focusKeyword: '키워드', imagePrompt: '프롬프트', imageAlt: 'ALT',
      tags: Array.from({ length: count }, (_, index) => `태그 ${index}`),
      sources: [{ sourceName: '기관', sourceTitle: '원문', sourceUrl: 'https://example.com/a', sourcePublishedAt: '', checkedPoint: '확인' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === 'tags')).toBe(true)
  })

  it('rejects normalized duplicate, brand, category, and full-title tags', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      categoryName: 'AI 칼럼',
      tags: ['AI 기술', ' ai   기술 ', 'DailyBriefNote', 'AI 칼럼', validValues.title],
      sources: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message)
      expect(messages).toEqual(expect.arrayContaining([
        '동일한 태그가 이미 입력되어 있습니다.',
        'Daily Brief Note는 태그로 사용할 수 없습니다.',
        '카테고리명은 태그로 사용할 수 없습니다.',
        '제목 전체를 태그로 사용할 수 없습니다.',
      ]))
    }
  })

  it.each([
    ['AI 도구', 'AI도구'],
    ['생성형-AI', '생성형 AI'],
    ['워드프레스_연동', '워드프레스 연동'],
  ])('rejects comparison-only duplicate tags: %s / %s', (left, right) => {
    const result = postFormSchema.safeParse({ ...validValues, tags: [left, right] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.message).join(' ')).toContain('정규화하면 중복')
  })

  it('rejects partially entered, invalid, and duplicate source URLs', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      sources: [
        { sourceName: '기관', sourceTitle: '', sourceUrl: 'javascript:alert(1)', sourcePublishedAt: '', checkedPoint: '' },
        { sourceName: 'A', sourceTitle: 'A', sourceUrl: 'https://example.com/a#one', sourcePublishedAt: '', checkedPoint: 'A' },
        { sourceName: 'B', sourceTitle: 'B', sourceUrl: 'https://example.com/a#two', sourcePublishedAt: '', checkedPoint: 'B' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['출처 정보를 모두 입력해 주세요.', '출처 URL이 중복되었습니다.']),
    )
  })

  it('allows nullable publication time for an ordinary complete source', () => {
    const result = postFormSchema.safeParse({
      ...validValues,
      sources: [{ sourceName: '기관', sourceTitle: '원문', sourceUrl: 'https://example.com/a', sourcePublishedAt: '', checkedPoint: '확인' }],
    })
    expect(result.success).toBe(true)
  })

  it('requires a publication time and official individual CCTV URL for Chinese ready content', () => {
    const baseReady = {
      ...validValues, categoryId: 'chinese-study', categoryName: '중국어 학습', contentGroup: 'chinese' as const,
      contentStatus: 'ready' as const, htmlBody: '<div><h1>본문</h1></div>', representativeTitle: '대표',
      alternativeTitles: ['1', '2', '3', '4'], metaDescription: '설명', focusKeyword: '키워드',
      imagePrompt: '프롬프트', imageAlt: 'ALT', tags: ['A', 'B', 'C', 'D', 'E'],
      learningTopic: '학습 주제', programName: 'CCTV 뉴스', originalTitle: '원문 제목',
      originalUrl: 'https://news.cctv.com/a/1', originalPublishedAt: '2026-07-11T12:00',
      episodeListIncluded: 'false' as const, verifiedCoreFact: '원문에서 학습 문장을 확인했습니다.',
    }
    const invalid = postFormSchema.safeParse({
      ...baseReady,
      sources: [{ sourceName: 'CCTV', sourceTitle: '원문', sourceUrl: 'https://example.com/a', sourcePublishedAt: '', checkedPoint: '확인' }],
    })
    expect(invalid.success).toBe(false)
    if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['중국어 학습 출처에는 게시·업데이트 일시가 필요합니다.', '중국어 학습에는 공식 CCTV 개별 원문 URL이 필요합니다.']),
    )

    expect(postFormSchema.safeParse({
      ...baseReady,
      sources: [{ sourceName: 'CCTV', sourceTitle: '원문', sourceUrl: 'https://news.cctv.com/a/1', sourcePublishedAt: '2026-07-11T12:00', checkedPoint: '확인' }],
    }).success).toBe(true)
  })

  it('requires complete Chinese metadata and a source URL matching the original URL', () => {
    const baseReady = {
      ...validValues, categoryId: 'chinese-study', categoryName: '중국어 학습', contentGroup: 'chinese' as const,
      contentStatus: 'ready' as const, htmlBody: '<div><h1>본문</h1></div>', representativeTitle: '대표',
      alternativeTitles: ['1', '2', '3', '4'], metaDescription: '설명', focusKeyword: '키워드', imagePrompt: '프롬프트', imageAlt: 'ALT',
      tags: ['A', 'B', 'C', 'D', 'E'], sources: [{ sourceName: 'CCTV', sourceTitle: '원문', sourceUrl: 'https://news.cctv.com/a/1#source', sourcePublishedAt: '2026-07-11T12:00', checkedPoint: '확인' }],
      learningTopic: '학습 주제', programName: 'CCTV 뉴스', originalTitle: '원문 제목', originalUrl: 'https://news.cctv.com/a/1/', originalPublishedAt: '2026-07-11T12:00', episodeListIncluded: 'false' as const, verifiedCoreFact: '확인한 사실', difficulty: '', learningPoints: '',
    }
    expect(postFormSchema.safeParse(baseReady).success).toBe(true)

    const incomplete = postFormSchema.safeParse({ ...baseReady, learningTopic: '', episodeListIncluded: '' })
    expect(incomplete.success).toBe(false)
    if (!incomplete.success) expect(incomplete.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['learningTopic', 'episodeListIncluded']))

    const mismatch = postFormSchema.safeParse({ ...baseReady, originalUrl: 'https://news.cctv.com/a/2' })
    expect(mismatch.success).toBe(false)
    if (!mismatch.success) expect(mismatch.error.issues.map((issue) => issue.message)).toContain('중국어 원문 URL과 출처 목록의 URL이 일치하지 않습니다.')
  })
})
