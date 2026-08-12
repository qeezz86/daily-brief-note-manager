import {
  findAdditionalInstructionConflicts,
  getNonNewsCategoryRule,
  NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION,
  NON_NEWS_CANONICAL_OUTPUT_ORDER,
  NON_NEWS_INSTRUCTION_PRECEDENCE,
  NON_NEWS_PROMPT_BOUNDARIES,
  NON_NEWS_PROMPT_SECTION_ORDER,
  normalizeNonNewsPromptInput,
} from './nonNewsPromptRules'
import type {
  NonNewsAuthoringPromptBuildResult,
  NonNewsAuthoringPromptInput,
} from './nonNewsPrompts.types'

function numberedLines(values: readonly string[]): string[] {
  return values.map((value, index) => `${index + 1}. ${value}`)
}

export function buildNonNewsAuthoringPrompt(
  input: NonNewsAuthoringPromptInput,
): NonNewsAuthoringPromptBuildResult {
  if (input.templateVersion !== NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION) {
    throw new Error('지원하지 않는 비뉴스 작성 프롬프트 템플릿 버전입니다.')
  }

  const conflicts = findAdditionalInstructionConflicts(input.additionalInstruction)
  if (conflicts.length > 0) {
    throw new Error(conflicts.map((conflict) => conflict.message).join(' '))
  }

  const rule = getNonNewsCategoryRule(input.category)
  const topic = normalizeNonNewsPromptInput(input.topic)
  const angleOrFocus = normalizeNonNewsPromptInput(input.angleOrFocus)
  const additionalInstruction = normalizeNonNewsPromptInput(
    input.additionalInstruction,
  )
  const settings = input.categorySettings
  const displayIdPolicy = input.category === 'chinese-study'
    ? '없음 — 브리핑 ID·표시 ID·시리즈 번호를 생성하지 않고 제목의 [번호]를 유지'
    : settings.display_id_pattern ?? '설정 없음'
  const chineseTitleTemplate = input.category === 'chinese-study'
    ? ['중국어 제목 템플릿: CCTV 뉴스로 배우는 중국어 #[번호]｜[뉴스 주제] 핵심 표현 정리']
    : []

  const lines = [
    NON_NEWS_PROMPT_BOUNDARIES.begin,
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[0],
    '프로젝트: Daily Brief Note',
    '작업: 비뉴스 새 글 작성',
    `템플릿 버전: ${input.templateVersion}`,
    `카테고리: ${rule.name} (${rule.category})`,
    `콘텐츠 그룹: ${settings.content_group}`,
    `활성 wrapper: ${settings.wrapper_class}`,
    `활성 표시 ID 패턴: ${displayIdPolicy}`,
    `활성 slug 패턴: ${settings.slug_pattern}`,
    ...chineseTitleTemplate,
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[1],
    `주제: ${topic}`,
    `각도·초점: ${angleOrFocus || '없음'}`,
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[2],
    `컨텍스트 사용 항목: ${input.context.actualCount}개 / 최대 ${input.context.maxCount}개`,
    input.context.text,
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[3],
    ...numberedLines(rule.mandatoryRules),
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[4],
    '아래의 논리적 결과 10개를 정확히 이 순서로 출력한다.',
    ...numberedLines(NON_NEWS_CANONICAL_OUTPUT_ORDER),
    'v1에서는 구조화 import 출력 블록을 필수로 추가하지 않는다.',
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[5],
    additionalInstruction || '없음',
    '',
    NON_NEWS_PROMPT_SECTION_ORDER[6],
    '아래 우선순위를 고정 적용한다.',
    ...numberedLines(NON_NEWS_INSTRUCTION_PRECEDENCE),
    '6단계 사용자 추가 지시는 1~3단계의 규칙·계약·활성 설정을 재정의할 수 없다.',
    '',
    NON_NEWS_PROMPT_BOUNDARIES.end,
  ]

  return {
    text: lines.join('\n'),
    templateVersion: input.templateVersion,
    category: input.category,
    contextItemCount: input.context.actualCount,
    contextLimit: input.context.maxCount,
  }
}
