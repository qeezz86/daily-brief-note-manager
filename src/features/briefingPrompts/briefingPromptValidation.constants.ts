import type { BriefingPromptMode } from './briefingPrompts.types'

export const PROMPT_BOUNDARY_MARKERS = {
  begin: '[BEGIN_DAILY_BRIEF_NOTE_PROMPT]',
  end: '[END_DAILY_BRIEF_NOTE_PROMPT]',
} as const

export const PROMPT_SECTION_MARKERS = {
  principles: '[작성 원칙]',
  researchScope: '[카테고리 조사 범위]',
  categoryInstructions: '[카테고리 필수 지침]',
  recentPosts: '[최근 브리핑]',
  openTopics: '[현재 추적 주제]',
  followups: '[후속 확인 항목]',
  closedTopics: '[최근 종료 주제]',
  repeatPrevention: '[반복 방지]',
  currentTask: '[이번 작업]',
  updateLabels: '[신규·업데이트 표시]',
  outputOrder: '[최종 출력 순서]',
  seoRules: '[SEO 필수 규칙]',
  htmlRules: '[WordPress HTML 필수 규칙]',
  footerOrder: '[하단 섹션 순서]',
  imageRules: '[대표 이미지 필수 규칙]',
  sourcePriorities: '[카테고리 출처 우선순위]',
  sourceHtml: '[출처 HTML 형식]',
  detailedChecks: '[상세 사실 검증 체크리스트]',
} as const

export const REQUIRED_OUTPUT_ORDER = [
  '1. SEO 입력용 대표 제목',
  '2. SEO 대안 제목 4개',
  '3. 메타 설명',
  '4. URL 슬러그',
  '5. 포커스 키워드',
  '6. SEO 태그 5~8개',
  '7. 워드프레스 본문용 HTML',
  '8. 대표 이미지 프롬프트',
  '9. 이미지 ALT 문구',
  '10. 발행 전 체크리스트',
] as const

export const PROMPT_LENGTH_LIMITS: Readonly<Record<BriefingPromptMode, {
  minimum: number
  warningMaximum: number
}>> = Object.freeze({
  simple: { minimum: 2_500, warningMaximum: 18_000 },
  standard: { minimum: 3_500, warningMaximum: 28_000 },
  detailed: { minimum: 4_000, warningMaximum: 40_000 },
})
