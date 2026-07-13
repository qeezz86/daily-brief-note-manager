import { describe, expect, it } from 'vitest'
import type { BriefingPromptCategory } from './briefingPrompts.types'
import {
  PROMPT_TEMPLATE_VERSION,
  categoryPromptRules,
  getCategoryConfigurationError,
  getCategoryPromptRule,
  resolveCategoryPromptRule,
} from './categoryPromptRules'

const categories: BriefingPromptCategory[] = [
  { id: 'economy', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD' },
  { id: 'global', name: '국제', code: 'GLO', wrapperClass: 'daily-brief-note news-briefing global', displayIdPattern: '#YYYY-MM-DD-GLO', slugPattern: 'global-briefing-YYYY-MM-DD' },
  { id: 'technology', name: '과학기술', code: 'TEC', wrapperClass: 'daily-brief-note news-briefing technology', displayIdPattern: '#YYYY-MM-DD-TEC', slugPattern: 'technology-briefing-YYYY-MM-DD' },
  { id: 'society', name: '사회', code: 'SOC', wrapperClass: 'daily-brief-note news-briefing society', displayIdPattern: '#YYYY-MM-DD-SOC', slugPattern: 'society-briefing-YYYY-MM-DD' },
  { id: 'climate-energy', name: '환경·에너지', code: 'ENV', wrapperClass: 'daily-brief-note news-briefing climate-energy', displayIdPattern: '#YYYY-MM-DD-ENV', slugPattern: 'climate-energy-briefing-YYYY-MM-DD' },
]

describe('categoryPromptRules', () => {
  it('is a deterministic read-only map keyed by the five news category IDs', () => {
    expect(Object.keys(categoryPromptRules)).toEqual(categories.map((category) => category.id))
    expect(Object.isFrozen(categoryPromptRules)).toBe(true)
    expect(PROMPT_TEMPLATE_VERSION).toBe(1)
  })

  it.each(categories)('resolves $name rules with category settings', (category) => {
    const rule = resolveCategoryPromptRule(category, '2026-07-13')
    expect(getCategoryPromptRule(category.id)).toBe(categoryPromptRules[category.id])
    expect(rule.templateName).toContain(category.name)
    expect(rule.wrapperClass).toBe(category.wrapperClass)
    expect(rule.briefingIdExample).toBe(category.displayIdPattern?.replace('YYYY-MM-DD', '2026-07-13'))
    expect(rule.slugExample).toBe(category.slugPattern.replace('YYYY-MM-DD', '2026-07-13'))
    expect(rule.researchScope.length).toBeGreaterThan(5)
    expect(rule.sourcePriorities.length).toBeGreaterThan(4)
  })

  it('uses configurable category wrapper, ID and slug settings without rewriting them', () => {
    const custom = { ...categories[0], wrapperClass: 'registered custom wrapper', displayIdPattern: 'BRIEF-YYYY-MM-DD', slugPattern: 'custom-YYYY-MM-DD' }
    const rule = resolveCategoryPromptRule(custom, '2026-07-13')
    expect(rule.wrapperClass).toBe('registered custom wrapper')
    expect(rule.briefingIdExample).toBe('BRIEF-2026-07-13')
    expect(rule.slugExample).toBe('custom-2026-07-13')
  })

  it('rejects unsupported categories with an understandable error', () => {
    expect(() => getCategoryPromptRule('unknown')).toThrow('지원하지 않는 뉴스 카테고리')
    expect(getCategoryConfigurationError({ ...categories[0], id: 'unknown' })).toContain('지원하지 않는 뉴스 카테고리')
  })

  it('rejects incomplete configurable category formats', () => {
    expect(getCategoryConfigurationError({ ...categories[0], wrapperClass: '' })).toContain('wrapper')
    expect(getCategoryConfigurationError({ ...categories[0], displayIdPattern: null })).toContain('ID 패턴')
    expect(getCategoryConfigurationError({ ...categories[0], slugPattern: '' })).toContain('slug')
  })
})
