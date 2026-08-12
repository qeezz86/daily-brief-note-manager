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
  NonNewsPromptValidationCheck,
  NonNewsPromptValidationError,
  NonNewsPromptValidationResult,
  NonNewsPromptValidationWarning,
  SupportedNonNewsCategoryId,
  ValidateNonNewsAuthoringPromptInput,
} from './nonNewsPrompts.types'

const CATEGORY_CONTENT_GROUPS: Record<SupportedNonNewsCategoryId, string> = {
  'ai-column': 'ai',
  'info-db': 'info_db',
  'chinese-study': 'chinese',
}

const CANONICAL_CATEGORIES = Object.keys(
  CATEGORY_CONTENT_GROUPS,
) as SupportedNonNewsCategoryId[]

class ValidationCollector {
  readonly errors: NonNewsPromptValidationError[] = []
  readonly warnings: NonNewsPromptValidationWarning[] = []
  readonly checks: NonNewsPromptValidationCheck[] = []

  error(issue: NonNewsPromptValidationError): void {
    this.errors.push(issue)
  }

  warning(issue: NonNewsPromptValidationWarning): void {
    this.warnings.push(issue)
  }

  check(issue: NonNewsPromptValidationCheck): void {
    this.checks.push(issue)
  }
}

function countOccurrences(text: string, value: string): number {
  if (!value) return 0
  let count = 0
  let fromIndex = 0
  while (true) {
    const index = text.indexOf(value, fromIndex)
    if (index < 0) return count
    count += 1
    fromIndex = index + value.length
  }
}

function orderedExactlyOnce(text: string, markers: readonly string[]): boolean {
  let previousIndex = -1
  return markers.every((marker) => {
    const index = text.indexOf(marker)
    const valid = index > previousIndex && countOccurrences(text, marker) === 1
    previousIndex = index
    return valid
  })
}

function protectedDataFindings(text: string): Array<[string, string]> {
  const patterns: Array<[string, RegExp, string]> = [
    ['OWNER_ID_EXPOSED', /\bowner_?id\b/iu, 'owner_id가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['AUTH_EXPOSED', /\b(?:auth|session)\b/iu, '인증 또는 session 정보가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['EMAIL_EXPOSED', /(?:\bemail\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/iu, 'email 정보가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['SECRET_EXPOSED', /\b(?:access[_ -]?token|refresh[_ -]?token|token|credential|secret|service[_ -]?role)\b/iu, 'token 또는 credential 정보가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['UUID_EXPOSED', /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu, '내부 UUID가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['HTML_BODY_EXPOSED', /\bhtml_body\b/iu, 'html_body 필드가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['WORDPRESS_URL_EXPOSED', /(?:wordpress[_ -]?url|워드프레스\s*URL)/iu, 'WordPress URL 필드가 사용자 또는 컨텍스트 데이터에 노출되었습니다.'],
    ['SECURITY_METADATA_EXPOSED', /(?:security[_ -]?metadata|audit[_ -]?metadata|보안\s*메타데이터|감사\s*메타데이터)/iu, '보안 또는 audit 메타데이터가 노출되었습니다.'],
    ['RAW_ARTICLE_HTML_EXPOSED', /(?:<\/?(?:div|article|section|h1|p|table)\b|\[WORDPRESS_HTML\])/iu, '원문 article HTML이 사용자 또는 컨텍스트 데이터에 포함되었습니다.'],
  ]

  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([code, , message]) => [code, message])
}

function validateIdentity(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): boolean {
  const isCanonicalCategory = CANONICAL_CATEGORIES.includes(input.category)
  if (!isCanonicalCategory) {
    collector.error({
      code: 'UNSUPPORTED_CATEGORY',
      message: '지원하는 비뉴스 카테고리가 아닙니다.',
      section: 'identity',
    })
  } else {
    collector.check({
      code: 'CANONICAL_CATEGORY',
      message: '카테고리가 Phase 5J allowlist에 포함됩니다.',
      section: 'identity',
    })
  }

  if (input.templateVersion !== NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION) {
    collector.error({
      code: 'UNSUPPORTED_TEMPLATE_VERSION',
      message: '비뉴스 작성 프롬프트 템플릿 버전이 일치하지 않습니다.',
      section: 'identity',
    })
  } else {
    collector.check({
      code: 'TEMPLATE_VERSION_COMPATIBLE',
      message: '빌더 입력과 validator의 템플릿 버전이 호환됩니다.',
      section: 'identity',
    })
  }

  const topic = normalizeNonNewsPromptInput(input.topic)
  if (!topic) {
    collector.error({
      code: 'TOPIC_REQUIRED',
      message: '정규화한 새 글 주제가 필요합니다.',
      section: 'brief',
    })
  } else if (!input.promptText.includes(`주제: ${topic}`)) {
    collector.error({
      code: 'TOPIC_MISMATCH',
      message: '정규화한 주제가 프롬프트와 일치하지 않습니다.',
      section: 'brief',
    })
  } else {
    collector.check({
      code: 'TOPIC_PRESENT',
      message: '정규화한 주제가 프롬프트에 포함됩니다.',
      section: 'brief',
    })
  }
  return isCanonicalCategory
}

function validateSettings(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const settings = input.categorySettings
  const expectedGroup = CATEGORY_CONTENT_GROUPS[input.category]
  const errors: Array<[boolean, string, string]> = [
    [settings.id !== input.category, 'CATEGORY_SETTINGS_MISMATCH', '선택 카테고리와 활성 category settings가 일치하지 않습니다.'],
    [settings.content_group !== expectedGroup, 'CONTENT_GROUP_MISMATCH', '카테고리 content group이 Phase 5J 계약과 일치하지 않습니다.'],
    [!settings.wrapper_class.trim(), 'WRAPPER_SETTING_REQUIRED', '활성 category wrapper 설정이 필요합니다.'],
    [!settings.slug_pattern.trim(), 'SLUG_SETTING_REQUIRED', '활성 category slug 패턴이 필요합니다.'],
    [input.category !== 'chinese-study' && !settings.display_id_pattern?.trim(), 'DISPLAY_ID_SETTING_REQUIRED', 'AI 칼럼과 정보DB에는 활성 표시 ID 패턴이 필요합니다.'],
    [input.category === 'chinese-study' && settings.display_id_pattern !== null, 'CHINESE_DISPLAY_ID_FORBIDDEN', '중국어 학습에는 표시 ID 패턴을 사용할 수 없습니다.'],
  ]
  for (const [failed, code, message] of errors) {
    if (failed) collector.error({ code, message, section: 'category-settings' })
  }
  if (!errors.some(([failed]) => failed)) {
    collector.check({
      code: 'CATEGORY_SETTINGS_COMPATIBLE',
      message: '활성 category settings와 content group이 호환됩니다.',
      section: 'category-settings',
    })
  }

  const displayPolicy = input.category === 'chinese-study'
    ? '없음 — 브리핑 ID·표시 ID·시리즈 번호를 생성하지 않고 제목의 [번호]를 유지'
    : settings.display_id_pattern ?? '설정 없음'
  const settingLines = [
    `콘텐츠 그룹: ${settings.content_group}`,
    `활성 wrapper: ${settings.wrapper_class}`,
    `활성 표시 ID 패턴: ${displayPolicy}`,
    `활성 slug 패턴: ${settings.slug_pattern}`,
  ]
  if (settingLines.some((line) => !input.promptText.includes(line))) {
    collector.error({
      code: 'CATEGORY_SETTINGS_NOT_EMBEDDED',
      message: '활성 category settings가 프롬프트에 정확히 반영되지 않았습니다.',
      section: 'category-settings',
    })
  } else {
    collector.check({
      code: 'CATEGORY_SETTINGS_EMBEDDED',
      message: '활성 category settings가 프롬프트에 반영됩니다.',
      section: 'category-settings',
    })
  }
}

function validateStructure(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const text = input.promptText
  if (!text.trim()) {
    collector.error({
      code: 'EMPTY_PROMPT',
      message: '생성된 프롬프트가 비어 있습니다.',
      section: 'structure',
    })
    return
  }

  const markers = [
    NON_NEWS_PROMPT_BOUNDARIES.begin,
    ...NON_NEWS_PROMPT_SECTION_ORDER,
    NON_NEWS_PROMPT_BOUNDARIES.end,
  ]
  const boundariesAreExact = text.startsWith(`${NON_NEWS_PROMPT_BOUNDARIES.begin}\n`)
    && text.endsWith(NON_NEWS_PROMPT_BOUNDARIES.end)
    && countOccurrences(text, NON_NEWS_PROMPT_BOUNDARIES.begin) === 1
    && countOccurrences(text, NON_NEWS_PROMPT_BOUNDARIES.end) === 1
  if (!boundariesAreExact) {
    collector.error({
      code: 'PROMPT_BOUNDARY_MISMATCH',
      message: '프롬프트 시작·종료 경계가 정확하지 않습니다.',
      section: 'structure',
    })
  } else {
    collector.check({
      code: 'PROMPT_BOUNDARIES_VALID',
      message: '프롬프트 시작·종료 경계가 정확합니다.',
      section: 'structure',
    })
  }

  if (!orderedExactlyOnce(text, markers)) {
    collector.error({
      code: 'PROMPT_SECTION_ORDER_MISMATCH',
      message: '필수 섹션 표식이 정확히 한 번씩 정해진 순서로 존재해야 합니다.',
      section: 'structure',
    })
  } else {
    collector.check({
      code: 'PROMPT_SECTION_ORDER_VALID',
      message: '필수 섹션이 정해진 순서로 존재합니다.',
      section: 'structure',
    })
  }

  if (!text.includes(`템플릿 버전: ${input.templateVersion}`)) {
    collector.error({
      code: 'BUILDER_VALIDATOR_VERSION_MISMATCH',
      message: '프롬프트의 빌더 버전과 validator 입력 버전이 일치하지 않습니다.',
      section: 'structure',
    })
  } else {
    collector.check({
      code: 'BUILDER_VALIDATOR_VERSION_COMPATIBLE',
      message: '빌더와 validator 버전이 호환됩니다.',
      section: 'structure',
    })
  }
}

function validateContext(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const rule = getNonNewsCategoryRule(input.category)
  const context = input.context
  const expectedLimit = rule.category === 'info-db' ? 30 : 20
  const countValid = context.actualCount >= 0
    && context.actualCount <= context.maxCount
    && context.maxCount === expectedLimit
    && context.category.id === input.category
  if (!countValid) {
    collector.error({
      code: 'CONTEXT_COUNT_MISMATCH',
      message: 'Phase 5I actual/max count 또는 카테고리 limit이 일치하지 않습니다.',
      section: 'context',
    })
  } else {
    collector.check({
      code: 'CONTEXT_COUNTS_VALID',
      message: 'Phase 5I actual/max count와 category limit이 일치합니다.',
      section: 'context',
    })
  }

  const exactBlock = `${NON_NEWS_PROMPT_SECTION_ORDER[2]}\n컨텍스트 사용 항목: ${context.actualCount}개 / 최대 ${context.maxCount}개\n${context.text}\n\n${NON_NEWS_PROMPT_SECTION_ORDER[3]}`
  if (!input.promptText.includes(exactBlock)) {
    collector.error({
      code: 'CONTEXT_BYTE_MISMATCH',
      message: 'Phase 5I 컨텍스트가 byte-identical 형태로 삽입되지 않았습니다.',
      section: 'context',
    })
  } else {
    collector.check({
      code: 'CONTEXT_BYTE_MATCH',
      message: 'Phase 5I 컨텍스트가 순서·내용 변경 없이 삽입되었습니다.',
      section: 'context',
    })
  }

  const contextCountLine = `사용 항목: ${context.actualCount}개 / 최대 ${context.maxCount}개`
  if (!context.text.includes(contextCountLine)) {
    collector.error({
      code: 'CONTEXT_INTERNAL_COUNT_MISMATCH',
      message: 'Phase 5I 컨텍스트 내부 actual/max count가 일치하지 않습니다.',
      section: 'context',
    })
  }

  if (context.actualCount === 0) {
    if (!context.text.includes('기존 글이 없습니다.')) {
      collector.error({
        code: 'ZERO_CONTEXT_REPRESENTATION_MISSING',
        message: '0개 컨텍스트의 정해진 빈 표현이 누락되었습니다.',
        section: 'context',
      })
    } else {
      collector.warning({
        code: 'ZERO_CONTEXT',
        message: '기존 글이 없어도 프롬프트 생성은 허용되며 새 항목을 만들지 않습니다.',
        section: 'context',
      })
    }
  }
}

function validateRulesAndOutput(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const rule = getNonNewsCategoryRule(input.category)
  const missingRules = rule.mandatoryRules.filter(
    (mandatoryRule) => !input.promptText.includes(mandatoryRule),
  )
  if (missingRules.length > 0) {
    collector.error({
      code: 'MANDATORY_CATEGORY_RULE_MISSING',
      message: `카테고리 필수 작성 규칙 ${missingRules.length}개가 누락되었습니다.`,
      section: 'category-rules',
    })
  } else {
    collector.check({
      code: 'MANDATORY_CATEGORY_RULES_PRESENT',
      message: '카테고리 필수 작성 규칙이 모두 포함됩니다.',
      section: 'category-rules',
    })
  }

  let previousIndex = -1
  const outputOrderValid = NON_NEWS_CANONICAL_OUTPUT_ORDER.every((item, index) => {
    const line = `${index + 1}. ${item}`
    const itemIndex = input.promptText.indexOf(line)
    const valid = itemIndex > previousIndex && countOccurrences(input.promptText, line) === 1
    previousIndex = itemIndex
    return valid
  })
  if (!outputOrderValid) {
    collector.error({
      code: 'CANONICAL_OUTPUT_ORDER_MISMATCH',
      message: '정해진 10개 결과가 정확한 순서로 한 번씩 존재해야 합니다.',
      section: 'output-contract',
    })
  } else {
    collector.check({
      code: 'CANONICAL_OUTPUT_ORDER_VALID',
      message: '정해진 10개 결과 순서가 유지됩니다.',
      section: 'output-contract',
    })
  }

  previousIndex = -1
  const precedenceValid = NON_NEWS_INSTRUCTION_PRECEDENCE.every((item, index) => {
    const line = `${index + 1}. ${item}`
    const itemIndex = input.promptText.indexOf(line)
    const valid = itemIndex > previousIndex
    previousIndex = itemIndex
    return valid
  }) && input.promptText.includes('6단계 사용자 추가 지시는 1~3단계의 규칙·계약·활성 설정을 재정의할 수 없다.')
  if (!precedenceValid) {
    collector.error({
      code: 'PRECEDENCE_BLOCK_MISMATCH',
      message: '고정된 6단계 우선순위와 비재정의 규칙이 누락되거나 변경되었습니다.',
      section: 'precedence',
    })
  } else {
    collector.check({
      code: 'PRECEDENCE_BLOCK_VALID',
      message: '고정 우선순위와 사용자 지시 비재정의 규칙이 포함됩니다.',
      section: 'precedence',
    })
  }

  if (input.category === 'chinese-study') {
    const titleTemplate = '중국어 제목 템플릿: CCTV 뉴스로 배우는 중국어 #[번호]｜[뉴스 주제] 핵심 표현 정리'
    if (!input.promptText.includes(titleTemplate)) {
      collector.error({
        code: 'CHINESE_NUMBER_PLACEHOLDER_REQUIRED',
        message: '중국어 제목·템플릿의 미해결 [번호] literal을 보존해야 합니다.',
        section: 'category-rules',
      })
    }
  }
}

function validateAdditionalInstruction(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const conflicts = findAdditionalInstructionConflicts(
    input.additionalInstruction,
  )
  for (const conflict of conflicts) {
    collector.error({
      code: `ADDITIONAL_INSTRUCTION_${conflict.class.toUpperCase().replace(/-/gu, '_')}`,
      message: conflict.message,
      section: 'additional-instruction',
      conflictClass: conflict.class,
    })
  }
  if (conflicts.length === 0) {
    collector.check({
      code: 'ADDITIONAL_INSTRUCTION_ALLOWED',
      message: '추가 지시가 고정 규칙과 충돌하지 않습니다.',
      section: 'additional-instruction',
    })
  }

  const normalized = normalizeNonNewsPromptInput(input.additionalInstruction) || '없음'
  const exactBlock = `${NON_NEWS_PROMPT_SECTION_ORDER[5]}\n${normalized}\n\n${NON_NEWS_PROMPT_SECTION_ORDER[6]}`
  if (!input.promptText.includes(exactBlock)) {
    collector.error({
      code: 'ADDITIONAL_INSTRUCTION_MISMATCH',
      message: '사용자 추가 지시가 정규화된 전체 값과 일치하지 않습니다.',
      section: 'additional-instruction',
    })
  }
}

function validateProtectedData(
  input: ValidateNonNewsAuthoringPromptInput,
  collector: ValidationCollector,
): void {
  const userAndContextData = [
    normalizeNonNewsPromptInput(input.topic),
    normalizeNonNewsPromptInput(input.angleOrFocus),
    normalizeNonNewsPromptInput(input.additionalInstruction),
    input.context.text,
  ].join('\n')
  const findings = protectedDataFindings(userAndContextData)
  for (const [code, message] of findings) {
    collector.error({ code, message, section: 'protected-data' })
  }

  if (input.category === 'chinese-study') {
    const userData = [input.topic, input.angleOrFocus, input.additionalInstruction].join('\n')
    if (/(?:#\s*\d+|(?:브리핑|표시|display|briefing)[ -]?id\s*[:=]?\s*[A-Z가-힣#-]*\d+)/iu.test(userData)) {
      collector.error({
        code: 'GENERATED_CHINESE_ID_EXPOSED',
        message: '사용자 데이터에 생성된 중국어 시리즈·브리핑·표시 ID가 포함되었습니다.',
        section: 'protected-data',
      })
    }
  }

  if (findings.length === 0) {
    collector.check({
      code: 'PROTECTED_DATA_NOT_EXPOSED',
      message: '사용자 및 Phase 5I 데이터 구간에 보호 필드나 raw HTML이 없습니다.',
      section: 'protected-data',
    })
  }
}

export function validateNonNewsAuthoringPrompt(
  input: ValidateNonNewsAuthoringPromptInput,
): NonNewsPromptValidationResult {
  const collector = new ValidationCollector()
  const hasCanonicalCategory = validateIdentity(input, collector)
  validateStructure(input, collector)

  if (hasCanonicalCategory) {
    validateSettings(input, collector)
    validateContext(input, collector)
    validateRulesAndOutput(input, collector)
  }
  validateAdditionalInstruction(input, collector)
  validateProtectedData(input, collector)

  const status = collector.errors.length > 0
    ? 'invalid'
    : collector.warnings.length > 0
      ? 'warning'
      : 'valid'
  const sectionCount = NON_NEWS_PROMPT_SECTION_ORDER.filter(
    (marker) => input.promptText.includes(marker),
  ).length

  return {
    validationVersion: 1,
    status,
    errors: collector.errors,
    warnings: collector.warnings,
    checks: collector.checks,
    metrics: {
      characterCount: input.promptText.length,
      lineCount: input.promptText ? input.promptText.split('\n').length : 0,
      sectionCount,
      contextItemCount: input.context.actualCount,
      contextLimit: input.context.maxCount,
    },
  }
}
