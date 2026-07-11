import { describe, expect, it } from 'vitest'

import {
  isBrandTag,
  isOfficialCctvArticleUrl,
  normalizeSourceUrl,
  normalizeTag,
  sourceUrlWarning,
  validateHtmlSources,
} from './publicationFields'

describe('publication fields', () => {
  it('normalizes tag edge and internal whitespace deterministically', () => {
    expect(normalizeTag('  AI   기술  ')).toBe('AI 기술')
  })

  it('recognizes both forbidden brand spellings', () => {
    expect(isBrandTag('Daily Brief Note')).toBe(true)
    expect(isBrandTag(' dailybriefnote ')).toBe(true)
  })

  it('normalizes source fragments and trailing slashes', () => {
    expect(normalizeSourceUrl('https://example.com/article/#part')).toBe(
      'https://example.com/article',
    )
  })

  it('accepts CCTV subdomains but rejects spoofed and root URLs', () => {
    expect(isOfficialCctvArticleUrl('https://news.cctv.com/article/1')).toBe(true)
    expect(isOfficialCctvArticleUrl('https://cctv.cn/video/1')).toBe(true)
    expect(isOfficialCctvArticleUrl('https://cctv.com.example.com/article')).toBe(false)
    expect(isOfficialCctvArticleUrl('https://fakecctv.com/article')).toBe(false)
    expect(isOfficialCctvArticleUrl('https://cctv.com/')).toBe(false)
  })

  it('warns for homepage and obvious search URLs without blocking them', () => {
    expect(sourceUrlWarning('https://example.com/')).toMatch(/루트 홈페이지/)
    expect(sourceUrlWarning('https://example.com/search?q=news')).toMatch(/검색 결과/)
  })

  it('requires an HTML sources section', () => {
    expect(validateHtmlSources('<div><h1>본문</h1></div>', [])).toContain(
      '본문에 출처 섹션이 없습니다.',
    )
  })

  it('detects a structured source missing from the HTML section', () => {
    expect(validateHtmlSources(
      '<div><section id="sources"><a href="https://example.com/other">Other</a></section></div>',
      [{ sourceName: 'A', sourceTitle: 'A', sourceUrl: 'https://example.com/source', sourcePublishedAt: '', checkedPoint: 'A' }],
    )).toContain('저장된 출처 URL이 WordPress HTML 출처 섹션에 없습니다.')
  })

  it('matches source URLs while ignoring fragments and trailing slashes', () => {
    expect(validateHtmlSources(
      '<div><section id="sources"><a href="https://example.com/source/">Source</a></section></div>',
      [{ sourceName: 'A', sourceTitle: 'A', sourceUrl: 'https://example.com/source#part', sourcePublishedAt: '', checkedPoint: 'A' }],
    )).toEqual([])
  })
})
