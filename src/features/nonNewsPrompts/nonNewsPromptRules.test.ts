import { describe, expect, it } from 'vitest'
import {
  ADDITIONAL_INSTRUCTION_CONFLICT_RULESET_VERSION,
  ADDITIONAL_INSTRUCTION_CONFLICT_RULES,
  NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION,
  NON_NEWS_CATEGORY_RULES,
  NON_NEWS_PROMPT_SECTION_ORDER,
} from './nonNewsPromptRules'

describe('nonNewsPromptRules', () => {
  it('freezes the v1 template and exactly three category configurations', () => {
    expect(NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION).toBe(
      'non-news-authoring-prompt-v1',
    )
    expect(ADDITIONAL_INSTRUCTION_CONFLICT_RULESET_VERSION).toBe(1)
    expect(Object.keys(NON_NEWS_CATEGORY_RULES)).toEqual([
      'ai-column',
      'info-db',
      'chinese-study',
    ])
    expect(Object.isFrozen(NON_NEWS_CATEGORY_RULES)).toBe(true)
    expect(Object.isFrozen(NON_NEWS_PROMPT_SECTION_ORDER)).toBe(true)
  })

  it('includes the mandatory AI column authoring areas', () => {
    const rules = NON_NEWS_CATEGORY_RULES['ai-column'].mandatoryRules.join('\n')
    for (const phrase of [
      '정의', '메커니즘', '비교', '실제 적용 사례', '이점', '한계', '보안',
      '개인정보', '검증', '사람의 감독', '현재 가능한 기능과 미래 전망', 'FAQ',
      '개별 원문 URL', '이전 AI 칼럼', 'wrapper', 'SEO', '기사 전문',
    ]) {
      expect(rules).toContain(phrase)
    }
  })

  it('includes the mandatory Info DB authoring areas', () => {
    const rules = NON_NEWS_CATEGORY_RULES['info-db'].mandatoryRules.join('\n')
    for (const phrase of [
      '초보자용 정의', '핵심 원리', '구성 요소', '비교', '실제 예시', '오해',
      '한계', '최신 개별 출처', '사실과 예측·전망', '핵심 포인트', 'FAQ',
      '개별 원문 URL', '이전 정보DB', 'wrapper', 'SEO',
    ]) {
      expect(rules).toContain(phrase)
    }
  })

  it('preserves unresolved Chinese numbering and forbids generated IDs', () => {
    const rules = NON_NEWS_CATEGORY_RULES['chinese-study'].mandatoryRules.join('\n')
    for (const phrase of [
      'CCTV 공식 개별 기사 또는 영상 URL', '홈페이지·검색 결과·목록', '프로그램명',
      '원문 제목', '게시 또는 업데이트 시각', '확인한 핵심 사실', '핵심 문장 3~5개',
      '성조', '한국어 해석', '어휘', '문장 구조', '독립적으로 작성', '세 문항',
      '응용 문장과 CCTV 원문 인용', '전체 자막', '꾸며내지', 'wrapper',
      '출처 확인 구조', '이전 중국어 학습', '저작권 메모', 'SEO', '[번호]',
      '생성·추정·증가시키지 않는다',
    ]) {
      expect(rules).toContain(phrase)
    }
    expect(rules).not.toMatch(/#[0-9]+/u)
    expect(rules).not.toMatch(/(?:AI|정보DB|CHINESE)-[0-9]+/u)
  })

  it('defines the ten deterministic blocked conflict classes in fixed order', () => {
    expect(ADDITIONAL_INSTRUCTION_CONFLICT_RULES.map((rule) => rule.class)).toEqual([
      'hierarchy-bypass',
      'mandatory-output-change',
      'category-settings-override',
      'chinese-id-generation',
      'protected-data-disclosure',
      'raw-html-context-insertion',
      'copyright-source-fabrication',
      'image-storage-or-html-prompt',
      'external-write-or-publication',
      'external-api-or-model-execution',
    ])
  })
})
