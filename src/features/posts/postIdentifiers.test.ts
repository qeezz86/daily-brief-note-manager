import { describe, expect, it } from 'vitest'

import type { Category } from '../categories/categories.types'
import { applyCategoryPattern, buildSuggestedSlug, matchesCategoryPattern } from './postIdentifiers'

const category = (id: string, contentGroup: Category['content_group'], slugPattern: string): Category => ({
  id,
  content_group: contentGroup,
  name: id,
  sort_order: 1,
  display_id_pattern: null,
  slug_pattern: slugPattern,
  wrapper_class: `daily-brief-note ${id}`,
})

describe('post identifiers', () => {
  it.each([
    [1, 'cctv-chinese-news-001'],
    [9, 'cctv-chinese-news-009'],
    [10, 'cctv-chinese-news-010'],
    [99, 'cctv-chinese-news-099'],
    [100, 'cctv-chinese-news-100'],
    [999, 'cctv-chinese-news-999'],
    [1000, 'cctv-chinese-news-1000'],
  ])('중국어 series %i를 최소 3자리 slug로 만든다', (seriesNo, expected) => {
    expect(applyCategoryPattern('cctv-chinese-news-###', { seriesNo })).toBe(expected)
  })

  it('과학기술과 환경·에너지 날짜 slug를 category 설정에서 만든다', () => {
    expect(buildSuggestedSlug(category('technology', 'news', 'technology-briefing-YYYY-MM-DD'), { date: '2026-07-16' }))
      .toBe('technology-briefing-2026-07-16')
    expect(buildSuggestedSlug(category('climate-energy', 'news', 'climate-energy-briefing-YYYY-MM-DD'), { date: '2026-07-16' }))
      .toBe('climate-energy-briefing-2026-07-16')
  })

  it('current pattern만 일치시키고 1000 이상 series도 허용한다', () => {
    expect(matchesCategoryPattern('cctv-chinese-news-###', 'cctv-chinese-news-001', {})).toBe(true)
    expect(matchesCategoryPattern('cctv-chinese-news-###', 'cctv-chinese-news-1000', {})).toBe(true)
    expect(matchesCategoryPattern('cctv-chinese-news-###', 'cctv-chinese-news-study-001', {})).toBe(false)
  })
})
