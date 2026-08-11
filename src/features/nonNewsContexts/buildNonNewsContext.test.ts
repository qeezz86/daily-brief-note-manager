import { describe, expect, it } from 'vitest'
import {
  buildNonNewsContext,
  NON_NEWS_CONTEXT_HEADER,
  NON_NEWS_CONTEXT_PURPOSE,
} from './buildNonNewsContext'
import type { NonNewsContextItem } from './nonNewsContexts.types'

const aiItem: NonNewsContextItem = {
  displayId: 'AI-001',
  seriesNo: 1,
  title: '  생성형   AI의 미래  ',
  slug: 'ai-001',
  summary: ' 핵심   요약 ',
  publishedOn: '2026-08-10',
  focusKeyword: '생성형 AI',
  tags: ['😀', ' 인공   지능 ', '\uE000'],
  fieldName: 'AI 산업',
  chineseMetadata: null,
}

describe('buildNonNewsContext', () => {
  it('uses the exact frozen header, purpose, category and AI count', () => {
    const result = buildNonNewsContext('ai-column', [aiItem])
    expect(result.text.split('\n').slice(0, 4)).toEqual([
      NON_NEWS_CONTEXT_HEADER,
      NON_NEWS_CONTEXT_PURPOSE,
      '카테고리: AI 칼럼 (ai-column)',
      '사용 항목: 1개 / 최대 20개',
    ])
    expect(result).toMatchObject({ actualCount: 1, maxCount: 20 })
  })

  it('formats only the frozen AI fields and sorts tags by Unicode code point', () => {
    const text = buildNonNewsContext('ai-column', [aiItem]).text
    expect(text).toContain('표시 ID: AI-001')
    expect(text).toContain('제목: 생성형 AI의 미래')
    expect(text).toContain('요약: 핵심 요약')
    expect(text).toContain('포커스 키워드: 생성형 AI')
    expect(text).toContain('태그: 인공 지능, \uE000, 😀')
    expect(text).toContain('분야: AI 산업')
  })

  it('formats InfoDB fields with the 30-item maximum and without AI tags', () => {
    const text = buildNonNewsContext('info-db', [{ ...aiItem, displayId: '정보DB-001', fieldName: '경제 용어' }]).text
    expect(text).toContain('카테고리: 정보DB (info-db)')
    expect(text).toContain('사용 항목: 1개 / 최대 30개')
    expect(text).toContain('표시 ID: 정보DB-001')
    expect(text).toContain('분야: 경제 용어')
    expect(text).not.toContain('태그:')
  })

  it('formats only the frozen Chinese fields and never creates a display ID', () => {
    const item: NonNewsContextItem = {
      ...aiItem,
      displayId: null,
      seriesNo: 17,
      focusKeyword: null,
      tags: [],
      fieldName: null,
      chineseMetadata: {
        programName: ' 新闻联播 ',
        originalTitle: ' 原文 标题 ',
        originalUrl: '  https://news.cctv.com/a/b?x=hello%20world  ',
        learningTopic: ' 경제   중국어 ',
        learningPoints: ' 표현 1\n표현 2 ',
      },
    }
    const text = buildNonNewsContext('chinese-study', [item]).text
    expect(text).toContain('시리즈 번호: 17')
    expect(text).toContain('프로그램명: 新闻联播')
    expect(text).toContain('원문 제목: 原文 标题')
    expect(text).toContain('원문 URL: https://news.cctv.com/a/b?x=hello%20world')
    expect(text).toContain('학습 주제: 경제 중국어')
    expect(text).toContain('학습 포인트: 표현 1 표현 2')
    expect(text).not.toContain('표시 ID:')
  })

  it('numbers items from one and preserves repository order', () => {
    const text = buildNonNewsContext('ai-column', [
      { ...aiItem, title: '첫 번째' },
      { ...aiItem, title: '두 번째' },
    ]).text
    expect(text.indexOf('--- 항목 1 ---')).toBeLessThan(text.indexOf('제목: 첫 번째'))
    expect(text.indexOf('제목: 첫 번째')).toBeLessThan(text.indexOf('--- 항목 2 ---'))
    expect(text.indexOf('--- 항목 2 ---')).toBeLessThan(text.indexOf('제목: 두 번째'))
  })

  it('omits a blank summary line without synthesizing a replacement', () => {
    const text = buildNonNewsContext('ai-column', [{ ...aiItem, summary: ' \n\t ' }]).text
    expect(text).not.toContain('요약:')
    expect(text).not.toMatch(/요약 없음|자동 요약/)
    expect(text).toContain('제목: 생성형 AI의 미래')
  })

  it('renders the deterministic empty message and accurate zero count', () => {
    const result = buildNonNewsContext('chinese-study', [])
    expect(result).toMatchObject({ actualCount: 0, maxCount: 20 })
    expect(result.text).toContain('사용 항목: 0개 / 최대 20개')
    expect(result.text.endsWith('기존 글이 없습니다.')).toBe(true)
  })

  it('reports the actual fewer-than-limit count without padding', () => {
    const result = buildNonNewsContext('info-db', [aiItem, aiItem])
    expect(result.text).toContain('사용 항목: 2개 / 최대 30개')
    expect(result.text).not.toContain('--- 항목 3 ---')
  })

  it('does not fall through unknown, owner, UUID, HTML, URL, credential or audit fields', () => {
    const unsafeItem = {
      ...aiItem,
      owner_id: 'owner-secret',
      id: 'internal-uuid',
      html_body: '<script>secretBody()</script>',
      wordpress_url: 'https://wordpress.example/private',
      source_import_type: 'secret-import',
      updated_at: 'audit-time',
      token: 'secret-token',
      unknownField: 'unknown-value',
    }
    const text = buildNonNewsContext('ai-column', [unsafeItem]).text
    expect(text).not.toMatch(/owner-secret|internal-uuid|secretBody|wordpress\.example|secret-import|audit-time|secret-token|unknown-value/)
  })

  it('returns byte-identical output for repeated calls and adds no article-generation instruction', () => {
    const first = buildNonNewsContext('ai-column', [aiItem]).text
    const second = buildNonNewsContext('ai-column', [aiItem]).text
    expect(second).toBe(first)
    expect(first).not.toMatch(/최종 글|기사를 작성|글을 생성/)
  })
})
