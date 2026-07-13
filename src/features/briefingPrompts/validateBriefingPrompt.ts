import {
  PROMPT_TEMPLATE_VERSION,
  resolveCategoryPromptRule,
  type ResolvedCategoryPromptRule,
} from './categoryPromptRules'
import {
  PROMPT_BOUNDARY_MARKERS,
  PROMPT_LENGTH_LIMITS,
  PROMPT_SECTION_MARKERS,
  REQUIRED_OUTPUT_ORDER,
} from './briefingPromptValidation.constants'
import {
  BRIEFING_PROMPT_VALIDATION_VERSION,
  type BriefingPromptValidationIssue,
  type BriefingPromptValidationResult,
  type BriefingPromptValidationSeverity,
  type ValidateBriefingPromptInput,
} from './briefingPromptValidation.types'
import { briefingPromptModeLabels } from './briefingPrompts.types'

const priorityLabels = { high: '높음', normal: '보통', low: '낮음' } as const
const updateLabels = { new: '신규', follow_up: '후속', correction: '정정', closure_note: '종료 메모' } as const

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let offset = 0
  while ((offset = value.indexOf(needle, offset)) !== -1) {
    count += 1
    offset += needle.length
  }
  return count
}

function firstVisiblePart(value: string): string {
  return normalize(value).slice(0, 80)
}

function containsNormalized(promptText: string, expected: string): boolean {
  return normalize(promptText).includes(firstVisiblePart(expected))
}

function hasValuesInOrder(promptText: string, values: readonly string[]): boolean {
  let cursor = -1
  return values.every((value) => {
    const index = promptText.indexOf(value, cursor + 1)
    if (index < 0) return false
    cursor = index
    return true
  })
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    const key = normalize(value)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  }
  return [...duplicates].sort()
}

function isDeterministicallySorted<T>(items: readonly T[], compare: (left: T, right: T) => number): boolean {
  return items.every((item, index) => index === 0 || compare(items[index - 1], item) <= 0)
}

class ValidationCollector {
  private readonly entries = new Map<string, BriefingPromptValidationIssue>()

  add(
    severity: BriefingPromptValidationSeverity,
    code: string,
    message: string,
    section: string,
    relatedKey?: string,
    detail?: string,
  ) {
    const key = `${severity}:${code}:${section}:${relatedKey ?? ''}`
    if (!this.entries.has(key)) {
      this.entries.set(key, { code, severity, message, section, relatedKey, detail })
    }
  }

  check(code: string, message: string, section: string) {
    this.add('check', code, message, section)
  }

  result(metrics: BriefingPromptValidationResult['metrics']): BriefingPromptValidationResult {
    const values = [...this.entries.values()]
    const errors = values.filter((issue) => issue.severity === 'error')
    const warnings = values.filter((issue) => issue.severity === 'warning')
    const checks = values.filter((issue) => issue.severity === 'check')
    return {
      validationVersion: BRIEFING_PROMPT_VALIDATION_VERSION,
      status: errors.length ? 'invalid' : warnings.length ? 'warning' : 'valid',
      errors,
      warnings,
      checks,
      metrics,
    }
  }
}

function validateStructure(input: ValidateBriefingPromptInput, collector: ValidationCollector) {
  const { promptText, context, mode } = input
  const beginCount = countOccurrences(promptText, PROMPT_BOUNDARY_MARKERS.begin)
  const endCount = countOccurrences(promptText, PROMPT_BOUNDARY_MARKERS.end)
  if (beginCount === 0) collector.add('error', 'MISSING_BEGIN_MARKER', '프롬프트 시작 경계 마커가 없습니다.', 'structure')
  else if (beginCount > 1) collector.add('error', 'DUPLICATE_BEGIN_MARKER', '프롬프트 시작 경계 마커가 중복되었습니다.', 'structure')
  if (endCount === 0) collector.add('error', 'MISSING_END_MARKER', '프롬프트 종료 경계 마커가 없습니다.', 'structure')
  else if (endCount > 1) collector.add('error', 'DUPLICATE_END_MARKER', '프롬프트 종료 경계 마커가 중복되었습니다.', 'structure')
  if (beginCount === 1 && endCount === 1) {
    if (promptText.indexOf(PROMPT_BOUNDARY_MARKERS.begin) > promptText.indexOf(PROMPT_BOUNDARY_MARKERS.end)) {
      collector.add('error', 'INVALID_BOUNDARY_ORDER', '시작 경계 마커가 종료 경계 마커보다 뒤에 있습니다.', 'structure')
    } else collector.check('VALID_BOUNDARIES', '프롬프트 경계 마커가 올바릅니다.', 'structure')
  }

  const requiredMarkers: string[] = [
    PROMPT_SECTION_MARKERS.principles,
    PROMPT_SECTION_MARKERS.researchScope,
    PROMPT_SECTION_MARKERS.categoryInstructions,
    PROMPT_SECTION_MARKERS.recentPosts,
    PROMPT_SECTION_MARKERS.followups,
    PROMPT_SECTION_MARKERS.closedTopics,
    PROMPT_SECTION_MARKERS.repeatPrevention,
    PROMPT_SECTION_MARKERS.currentTask,
    PROMPT_SECTION_MARKERS.outputOrder,
    PROMPT_SECTION_MARKERS.seoRules,
    PROMPT_SECTION_MARKERS.htmlRules,
    PROMPT_SECTION_MARKERS.footerOrder,
    PROMPT_SECTION_MARKERS.imageRules,
  ]
  if (mode !== 'simple') requiredMarkers.push(
    PROMPT_SECTION_MARKERS.openTopics,
    PROMPT_SECTION_MARKERS.sourcePriorities,
    PROMPT_SECTION_MARKERS.sourceHtml,
  )
  if (mode === 'detailed') requiredMarkers.push(PROMPT_SECTION_MARKERS.detailedChecks)
  for (const marker of requiredMarkers) {
    const count = countOccurrences(promptText, marker)
    if (count === 0) collector.add('error', 'MISSING_REQUIRED_SECTION', `필수 섹션 ${marker}이 없습니다.`, 'structure', marker)
    else if (count > 1) collector.add('error', 'DUPLICATE_SECTION_MARKER', `섹션 마커 ${marker}이 중복되었습니다.`, 'structure', marker)
  }
  if (mode === 'simple' && promptText.includes(PROMPT_SECTION_MARKERS.openTopics)) {
    collector.add('warning', 'SIMPLE_MODE_OPEN_TOPICS_INCLUDED', '간단 모드에 추적 주제 전체가 포함되었습니다.', 'mode')
  }
  for (const marker of Object.values(PROMPT_SECTION_MARKERS)) {
    if (countOccurrences(promptText, marker) > 1) collector.add('error', 'DUPLICATE_SECTION_MARKER', `섹션 마커 ${marker}이 중복되었습니다.`, 'structure', marker)
  }
  if (requiredMarkers.every((marker) => countOccurrences(promptText, marker) === 1)) {
    collector.check('REQUIRED_SECTIONS_PRESENT', '모드별 필수 섹션이 모두 있습니다.', 'structure')
  }

  const metadata = [
    context.category.name,
    `작성 기준일: ${context.referenceDate}`,
    `모드: ${briefingPromptModeLabels[mode]}`,
    `프롬프트 템플릿 버전: ${input.promptTemplateVersion}`,
  ]
  if (!metadata.every((value) => promptText.includes(value))) {
    collector.add('error', 'MISSING_PROMPT_METADATA', '카테고리, 기준일, 모드 또는 템플릿 버전 표시가 누락되었습니다.', 'structure')
  } else collector.check('PROMPT_METADATA_PRESENT', '생성 설정 표시가 모두 있습니다.', 'structure')
}

function validateOutputRequirements(promptText: string, collector: ValidationCollector) {
  const missing = REQUIRED_OUTPUT_ORDER.filter((label) => !promptText.includes(label))
  if (missing.length) {
    collector.add('error', 'MISSING_OUTPUT_ORDER', '필수 출력 항목이 프롬프트에 모두 포함되지 않았습니다.', 'output-requirements', undefined, missing.join(', '))
  } else if (!hasValuesInOrder(promptText, REQUIRED_OUTPUT_ORDER)) {
    collector.add('error', 'INVALID_OUTPUT_ORDER', '필수 출력 항목의 순서가 올바르지 않습니다.', 'output-requirements')
  } else collector.check('VALID_OUTPUT_ORDER', '10개 출력 항목의 순서가 올바릅니다.', 'output-requirements')

  const requirements: Array<[string, string, string]> = [
    ['SEPARATE_HTML_AND_SEO', 'SEO 항목과 이미지 항목은 HTML 밖', 'SEO·이미지 정보와 HTML 분리 지침이 없습니다.'],
    ['SINGLE_HTML_BLOCK', '하나의 연속된 ```html 코드블록', '하나의 연속된 HTML 코드블록 지침이 없습니다.'],
    ['NO_MARKDOWN_IN_HTML', '그 안에 Markdown을 섞거나', 'HTML과 Markdown 혼용 금지 지침이 없습니다.'],
    ['HTML_H1', 'HTML 내부에 h1', 'HTML 내부 h1 지침이 없습니다.'],
    ['HTML_LAST_DIV', '마지막 </div>', '마지막 wrapper 닫기 지침이 없습니다.'],
    ['IMAGE_OUTSIDE_HTML', '대표 이미지 프롬프트와 ALT 문구를 HTML 안에 넣지 않는다', '대표 이미지 정보의 HTML 외부 분리 지침이 없습니다.'],
  ]
  for (const [code, needle, message] of requirements) {
    if (!promptText.includes(needle)) collector.add('error', `MISSING_${code}`, message, 'output-requirements')
  }
}

function validateCategory(
  input: ValidateBriefingPromptInput,
  collector: ValidationCollector,
): ResolvedCategoryPromptRule | null {
  let rule: ResolvedCategoryPromptRule
  try {
    rule = resolveCategoryPromptRule(input.context.category, input.settings.referenceDate)
  } catch (error) {
    collector.add('error', 'UNSUPPORTED_OR_INVALID_CATEGORY', error instanceof Error ? error.message : '지원되지 않거나 잘못된 카테고리 설정입니다.', 'category')
    return null
  }
  const configuration: Array<[string, string | readonly string[], string]> = [
    ['CATEGORY_TEMPLATE', rule.templateName, '카테고리 template 이름이 비어 있습니다.'],
    ['CATEGORY_CODE', rule.categoryCode, '카테고리 code가 비어 있습니다.'],
    ['CATEGORY_WRAPPER', rule.wrapperClass, '카테고리 wrapper가 비어 있습니다.'],
    ['CATEGORY_ID_PATTERN', rule.briefingIdPattern, '브리핑 ID pattern이 비어 있습니다.'],
    ['CATEGORY_SLUG_PATTERN', rule.slugPattern, 'slug pattern이 비어 있습니다.'],
    ['CATEGORY_RESEARCH_SCOPE', rule.researchScope, '카테고리 조사 범위가 비어 있습니다.'],
    ['CATEGORY_SOURCE_PRIORITIES', rule.sourcePriorities, '카테고리 출처 우선순위가 비어 있습니다.'],
    ['CATEGORY_REQUIRED_INSTRUCTIONS', rule.requiredInstructions, '카테고리 필수 지침이 비어 있습니다.'],
    ['CATEGORY_DETAILED_CHECKS', rule.detailedChecks, '카테고리 상세 검증 항목이 비어 있습니다.'],
    ['CATEGORY_FOOTER_ORDER', rule.footerOrder, '하단 섹션 순서가 비어 있습니다.'],
    ['CATEGORY_CONTENT_NOTE', rule.contentNote, 'content-note가 비어 있습니다.'],
  ]
  for (const [code, value, message] of configuration) {
    if ((typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)) {
      collector.add('error', code, message, 'category')
    }
  }

  const requiredText = [
    rule.templateName,
    rule.wrapperClass,
    rule.briefingIdPattern,
    rule.briefingIdExample,
    rule.slugPattern,
    rule.slugExample,
    ...rule.researchScope,
    ...rule.requiredInstructions,
    ...rule.footerOrder,
    rule.contentNote,
    'SEO 필수 규칙',
    '대표 이미지 필수 규칙',
  ]
  if (input.mode !== 'simple') requiredText.push(...rule.sourcePriorities)
  if (input.mode === 'detailed') requiredText.push(...rule.detailedChecks)
  const missing = requiredText.filter((value) => !input.promptText.includes(value))
  if (missing.length) {
    collector.add('error', 'MISSING_CATEGORY_RULE', '선택한 카테고리의 필수 규칙이 프롬프트에 누락되었습니다.', 'category', undefined, missing.join(', '))
  } else collector.check('CATEGORY_RULES_PRESENT', '선택한 카테고리 규칙이 모두 반영되었습니다.', 'category')
  return rule
}

function validateContextIntegrity(input: ValidateBriefingPromptInput, collector: ValidationCollector) {
  const { context, settings, promptTemplateVersion } = input
  if (context.schemaVersion !== 1) collector.add('error', 'UNSUPPORTED_CONTEXT_SCHEMA', '지원하지 않는 context schema version입니다.', 'context')
  if (context.category.id !== settings.categoryId) collector.add('error', 'CONTEXT_CATEGORY_MISMATCH', 'Context 카테고리와 생성 설정이 일치하지 않습니다.', 'context')
  if (context.referenceDate !== settings.referenceDate) collector.add('error', 'CONTEXT_REFERENCE_DATE_MISMATCH', 'Context 기준일과 생성 설정이 일치하지 않습니다.', 'context')
  if (settings.mode !== input.mode) collector.add('error', 'PROMPT_MODE_MISMATCH', '검증 mode와 생성 설정이 일치하지 않습니다.', 'context')
  if (context.promptTemplateVersion !== promptTemplateVersion || promptTemplateVersion !== PROMPT_TEMPLATE_VERSION) {
    collector.add('error', 'PROMPT_TEMPLATE_VERSION_MISMATCH', 'Context, builder와 생성 설정의 template version이 일치하지 않습니다.', 'context')
  }

  const actualCounts = {
    recentPosts: context.recentPosts.length,
    recentUpdates: context.recentPosts.reduce((sum, post) => sum + post.updates.length, 0),
    openTopics: context.openTopics.length,
    pendingFollowups: context.pendingFollowups.length,
    overdueFollowups: context.pendingFollowups.filter((item) => item.overdue).length,
    recentClosedTopics: context.recentClosedTopics.length,
  }
  const mismatches = Object.entries(actualCounts)
    .filter(([key, value]) => context.counts[key as keyof typeof actualCounts] !== value)
    .map(([key]) => key)
  if (mismatches.length) collector.add('error', 'CONTEXT_COUNT_MISMATCH', 'Context counts와 실제 배열 길이가 일치하지 않습니다.', 'context', undefined, mismatches.join(', '))
  else collector.check('CONTEXT_COUNTS_MATCH', 'Context counts가 실제 데이터와 일치합니다.', 'context')

  const duplicateGroups: Array<[string, string[], string]> = [
    ['DUPLICATE_RECENT_POST_ID', context.recentPosts.map((post) => post.id), '동일한 최근 게시물이 중복되었습니다.'],
    ['DUPLICATE_OPEN_TOPIC_KEY', context.openTopics.map((topic) => topic.topicKey), '동일한 추적 주제 key가 중복되었습니다.'],
    ['DUPLICATE_FOLLOWUP_ID', context.pendingFollowups.map((followup) => followup.id), '동일한 후속 확인 항목이 중복되었습니다.'],
    ['DUPLICATE_CLOSED_TOPIC_KEY', context.recentClosedTopics.map((topic) => topic.topicKey), '동일한 종료 주제 key가 중복되었습니다.'],
    ['DUPLICATE_UPDATE_ID', context.recentPosts.flatMap((post) => post.updates.map((update) => update.id)), '동일한 뉴스 update가 중복되었습니다.'],
  ]
  for (const [code, values, message] of duplicateGroups) {
    for (const duplicate of duplicateValues(values)) collector.add('error', code, message, 'duplicates', duplicate)
  }

  const openKeys = new Set(context.openTopics.map((topic) => normalize(topic.topicKey)))
  for (const topic of context.recentClosedTopics) {
    if (openKeys.has(normalize(topic.topicKey))) {
      collector.add('error', 'TOPIC_OPEN_AND_CLOSED', '같은 주제가 추적 중 목록과 종료 목록에 동시에 있습니다.', 'duplicates', topic.topicKey)
    }
  }
  for (const headline of duplicateValues(context.recentPosts.flatMap((post) => post.updates.map((update) => update.headline)))) {
    collector.add('warning', 'DUPLICATE_NORMALIZED_HEADLINE', '공백·영문 대소문자를 정규화한 동일 headline이 있습니다.', 'duplicates', headline)
  }
  if (context.recentPosts.length > 5) collector.add('error', 'RECENT_POST_LIMIT_EXCEEDED', '현재 context schema가 허용하는 최근 게시물 5개를 초과했습니다.', 'context')
  for (const post of context.recentPosts) {
    for (const itemOrder of duplicateValues(post.updates.map((update) => String(update.itemOrder)))) {
      collector.add('error', 'DUPLICATE_UPDATE_ITEM_ORDER', '같은 게시물에 동일한 update item_order가 중복되었습니다.', 'duplicates', `${post.id}:${itemOrder}`)
    }
  }

  const postOrder = isDeterministicallySorted(context.recentPosts, (a, b) => b.publishedOn.localeCompare(a.publishedOn) || a.id.localeCompare(b.id))
  const updatesOrder = context.recentPosts.every((post) => isDeterministicallySorted(post.updates, (a, b) => a.itemOrder - b.itemOrder || a.id.localeCompare(b.id)))
  const openOrder = { reopened: 0, active: 1, monitoring: 2 }
  const topicsOrder = isDeterministicallySorted(context.openTopics, (a, b) => openOrder[a.status] - openOrder[b.status] || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.topicKey.localeCompare(b.topicKey))
  const priorityOrder = { high: 0, normal: 1, low: 2 }
  const followupOrder = isDeterministicallySorted(context.pendingFollowups, (a, b) => Number(b.overdue) - Number(a.overdue) || priorityOrder[a.priority] - priorityOrder[b.priority] || (a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate)))
  const closedOrder = isDeterministicallySorted(context.recentClosedTopics, (a, b) => b.closedAt.localeCompare(a.closedAt) || a.id.localeCompare(b.id))
  if (!postOrder || !updatesOrder || !topicsOrder || !followupOrder || !closedOrder) {
    collector.add('error', 'NON_DETERMINISTIC_CONTEXT_ORDER', 'Context 배열의 결정적 정렬 순서가 올바르지 않습니다.', 'context')
  } else collector.check('DETERMINISTIC_CONTEXT_ORDER', 'Context 배열이 결정적 순서로 정렬되어 있습니다.', 'context')
}

function validateCoverage(input: ValidateBriefingPromptInput, collector: ValidationCollector) {
  const { context, mode, promptText } = input
  if (!context.recentPosts.length) collector.add('warning', 'NO_RECENT_POSTS', '최근 게시물이 없습니다.', 'recent-posts')
  for (const post of context.recentPosts) {
    if (!promptText.includes(post.title)) collector.add('error', 'MISSING_RECENT_POST', '최근 게시물이 프롬프트에 반영되지 않았습니다.', 'recent-posts', post.displayId ?? post.publishedOn)
    if (!promptText.includes(post.publishedOn)) collector.add('error', 'MISSING_POST_DATE', '최근 게시물 발행일이 프롬프트에 없습니다.', 'recent-posts', post.displayId ?? post.publishedOn)
    let previousIndex = -1
    for (const update of post.updates) {
      const headlineIndex = promptText.indexOf(update.headline)
      if (headlineIndex < 0 || !promptText.includes(`[${updateLabels[update.updateType]}] ${update.headline}`)) {
        collector.add('error', 'MISSING_RECENT_UPDATE', '최근 게시물의 뉴스 update가 프롬프트에 반영되지 않았습니다.', 'recent-posts', `${post.displayId ?? post.publishedOn}:${update.itemOrder}`)
      }
      if (headlineIndex >= 0 && headlineIndex < previousIndex) collector.add('error', 'UPDATE_ITEM_ORDER_MISMATCH', '뉴스 update의 item_order가 프롬프트에서 유지되지 않았습니다.', 'recent-posts', post.displayId ?? post.publishedOn)
      previousIndex = Math.max(previousIndex, headlineIndex)
      if (!containsNormalized(promptText, update.factSummary)) collector.add('error', 'MISSING_FACT_SUMMARY', '뉴스 update의 사실 요약이 프롬프트에 없습니다.', 'recent-posts', `${post.displayId ?? post.publishedOn}:${update.itemOrder}`)
      if (mode === 'detailed') {
        const details: Array<[string, string | null, string]> = [
          ['MISSING_IMPORTANCE_SUMMARY', update.importanceSummary, '중요성 요약'],
          ['MISSING_IMPACT_SUMMARY', update.impactSummary, '영향 요약'],
          ['MISSING_CHANGE_SUMMARY', update.changeSummary, '변화 요약'],
        ]
        for (const [code, value, label] of details) {
          if (value && !containsNormalized(promptText, value)) collector.add('error', code, `상세 모드에 ${label}이 반영되지 않았습니다.`, 'recent-posts', `${post.displayId ?? post.publishedOn}:${update.itemOrder}`)
        }
      }
    }
  }

  if (!context.openTopics.length) collector.add('warning', 'NO_OPEN_TOPICS', '추적 중인 뉴스 주제가 없습니다.', 'open-topics')
  if (mode !== 'simple') {
    for (const topic of context.openTopics) {
      if (!promptText.includes(topic.topicKey) || !promptText.includes(topic.canonicalTitle)) collector.add('error', 'MISSING_OPEN_TOPIC', '추적 중인 주제가 프롬프트에 반영되지 않았습니다.', 'open-topics', topic.topicKey)
      if (mode === 'detailed' && topic.latestUpdate) {
        if (!promptText.includes(topic.latestUpdate.headline) || !containsNormalized(promptText, topic.latestUpdate.factSummary)) collector.add('error', 'MISSING_LATEST_TOPIC_UPDATE', '상세 모드에 주제 최신 update가 반영되지 않았습니다.', 'open-topics', topic.topicKey)
        if (topic.latestUpdate.changeSummary && !containsNormalized(promptText, topic.latestUpdate.changeSummary)) collector.add('error', 'MISSING_LATEST_TOPIC_CHANGE', '상세 모드에 주제 최신 변화가 반영되지 않았습니다.', 'open-topics', topic.topicKey)
      }
    }
  } else if (context.openTopics.length || context.recentPosts.some((post) => post.updates.some((update) => update.importanceSummary || update.impactSummary || update.changeSummary))) {
    collector.add('warning', 'SIMPLE_MODE_DETAIL_OMITTED', '간단 모드 정책에 따라 추적 주제 전체와 일부 상세 요약이 생략되었습니다.', 'mode')
  }

  const requiredFollowups = mode === 'simple'
    ? context.pendingFollowups.filter((item) => item.overdue || item.priority === 'high')
    : context.pendingFollowups
  for (const followup of context.pendingFollowups) {
    if (followup.status && followup.status !== 'pending') collector.add('error', 'RESOLVED_FOLLOWUP_IN_PENDING', '완료·취소된 followup이 pending 섹션에 포함되었습니다.', 'followups', followup.id)
  }
  if (!context.pendingFollowups.length) {
    collector.add('warning', 'NO_PENDING_FOLLOWUPS', '미완료 후속 확인 항목이 없습니다.', 'followups')
    if (!promptText.includes('미완료 후속 확인 없음')) collector.add('error', 'MISSING_EMPTY_FOLLOWUPS', '후속 확인 항목이 없다는 표시가 누락되었습니다.', 'followups')
  }
  for (const followup of requiredFollowups) {
    if (!promptText.includes(followup.checkText)) collector.add('error', 'MISSING_PENDING_FOLLOWUP', '필수 pending followup이 프롬프트에 반영되지 않았습니다.', 'followups', followup.id)
    if (followup.overdue && !promptText.includes(`마감 초과 · ${priorityLabels[followup.priority]}`)) collector.add('error', 'MISSING_OVERDUE_LABEL', '마감 초과 followup 표시가 없습니다.', 'followups', followup.id)
    if (!promptText.includes(priorityLabels[followup.priority])) collector.add('error', 'MISSING_FOLLOWUP_PRIORITY', 'Followup 우선순위 표시가 없습니다.', 'followups', followup.id)
    if (followup.dueDate && !promptText.includes(`(마감 ${followup.dueDate})`)) collector.add('error', 'MISSING_FOLLOWUP_DUE_DATE', 'Followup 마감일 표시가 없습니다.', 'followups', followup.id)
    if (!promptText.includes(followup.topicTitle) && !promptText.includes(followup.topicKey)) collector.add('error', 'MISSING_FOLLOWUP_TOPIC', 'Followup의 연결 주제가 표시되지 않았습니다.', 'followups', followup.id)
  }

  if (!context.recentClosedTopics.length) {
    collector.add('warning', 'NO_RECENT_CLOSED_TOPICS', '조회 기간 내 최근 종료 주제가 없습니다.', 'closed-topics')
    if (!promptText.includes('조회 기간 내 종료 주제 없음')) collector.add('error', 'MISSING_EMPTY_CLOSED_TOPICS', '최근 종료 주제가 없다는 표시가 누락되었습니다.', 'closed-topics')
  }
  for (const topic of context.recentClosedTopics) {
    if (topic.status && topic.status !== 'closed') collector.add('error', 'NON_CLOSED_TOPIC_IN_CLOSED_LIST', '현재 closed 상태가 아닌 주제가 종료 목록에 포함되었습니다.', 'closed-topics', topic.topicKey)
    if (!promptText.includes(topic.canonicalTitle) || !promptText.includes(topic.closedAt)) collector.add('error', 'MISSING_CLOSED_TOPIC', '최근 종료 주제가 프롬프트에 반영되지 않았습니다.', 'closed-topics', topic.topicKey)
    if (topic.closedReason && !containsNormalized(promptText, topic.closedReason)) collector.add('error', 'MISSING_CLOSED_REASON', '종료 사유가 프롬프트에 반영되지 않았습니다.', 'closed-topics', topic.topicKey)
    if (mode === 'detailed' && topic.closureNote && !promptText.includes(topic.closureNote.headline)) collector.add('error', 'MISSING_CLOSURE_NOTE', '상세 모드에 종료 메모가 반영되지 않았습니다.', 'closed-topics', topic.topicKey)
  }
}

function validateUpdateRelations(input: ValidateBriefingPromptInput, collector: ValidationCollector) {
  const closedKeys = new Set(input.context.recentClosedTopics.map((topic) => normalize(topic.topicKey)))
  for (const update of input.context.recentPosts.flatMap((post) => post.updates)) {
    if (update.updateType === 'new' && update.previousUpdateId) collector.add('error', 'NEW_UPDATE_HAS_PREVIOUS', '신규 update에는 이전 update 연결이 없어야 합니다.', 'updates', update.id)
    if (update.updateType !== 'new' && !update.previousUpdateId) collector.add('error', 'UPDATE_PREVIOUS_REQUIRED', `${updateLabels[update.updateType]} update에는 이전 update 연결이 필요합니다.`, 'updates', update.id)
    if (update.updateType !== 'new' && !update.changeSummary?.trim()) collector.add('error', 'UPDATE_CHANGE_REQUIRED', `${updateLabels[update.updateType]} update에는 변화 요약이 필요합니다.`, 'updates', update.id)
    if (update.updateType === 'closure_note' && !closedKeys.has(normalize(update.topicKey))) collector.add('error', 'CLOSURE_TOPIC_NOT_CLOSED', '종료 메모 update가 최근 종료 주제와 연결되지 않았습니다.', 'updates', update.id)
  }
  const instructions: Array<[string, string, string]> = [
    ['MISSING_FOLLOW_UP_GUIDANCE', '후속은 이전 대비 변화', '후속 update의 이전 대비 변화 확인 지침이 없습니다.'],
    ['MISSING_CORRECTION_GUIDANCE', '정정은 잘못된 기존 사실과 수정 내용', '정정 update의 기존 오류와 수정 내용 구분 지침이 없습니다.'],
    ['MISSING_CLOSURE_GUIDANCE', '종료 메모는 종료 메모임을 명시', '종료 메모 판정 지침이 없습니다.'],
  ]
  for (const [code, needle, message] of instructions) if (!input.promptText.includes(needle)) collector.add('error', code, message, 'updates')
}

function validateRepeatAndCopyright(promptText: string, collector: ValidationCollector) {
  const repeatRules: Array<[string, string]> = [
    ['의미 있는 재개 근거가 없으면 반복하지 않는다', '종료 주제의 의미 있는 재개 근거 지침이 없습니다.'],
    ['종료 주제를 신규 뉴스로 무조건 재사용하지 않는다', '종료 주제를 신규 뉴스로 재사용하지 않는 지침이 없습니다.'],
  ]
  for (const [needle, message] of repeatRules) if (!promptText.includes(needle)) collector.add('error', 'MISSING_CLOSED_REPEAT_PREVENTION', message, 'closed-topics', needle)

  const copyrightRules: Array<[string, string, string]> = [
    ['NO_FULL_ARTICLE_COPY', '기사 전문', '기사 전문 복사 금지 지침이 없습니다.'],
    ['NO_FULL_TRANSLATION', '해외 기사 전체 직역', '해외 기사 전체 직역 금지 지침이 없습니다.'],
    ['NO_BULK_CAPTIONS', '방송 자막 대량 복제', '방송 자막 대량 복제 금지 지침이 없습니다.'],
    ['NO_UNLICENSED_MEDIA', '언론사 사진·도표', '언론사 사진·도표 무단 사용 금지 지침이 없습니다.'],
    ['PREFER_RELIABLE_SOURCES', '공식 자료와 신뢰할 수 있는 보도', '공식 자료와 신뢰할 수 있는 보도 우선 지침이 없습니다.'],
    ['INDIVIDUAL_SOURCE_URL', '개별 원문 URL', '개별 기사·발표·보고서 URL 사용 지침이 없습니다.'],
    ['NO_LISTING_SOURCE', '홈페이지, 검색 결과, 목록 페이지', '홈페이지·검색·목록 페이지만 출처로 사용하지 않는 지침이 없습니다.'],
    ['SEPARATE_FACT_ANALYSIS', '사실, 공식 입장, 분석과 전망', '사실과 분석·전망 구분 지침이 없습니다.'],
    ['EXCLUDE_UNVERIFIED', '확인되지 않은', '확인되지 않은 내용을 제외하는 지침이 없습니다.'],
  ]
  for (const [code, needle, message] of copyrightRules) if (!promptText.includes(needle)) collector.add('error', `MISSING_${code}`, message, 'copyright-sources')
}

function validatePrivacy(promptText: string, collector: ValidationCollector) {
  const findings: Array<[string, RegExp, string]> = [
    ['OWNER_ID_EXPOSED', /\bowner_?id\b/i, '복사용 프롬프트에 owner ID가 노출되었습니다.'],
    ['EMAIL_EXPOSED', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, '복사용 프롬프트에 사용자 이메일이 노출되었습니다.'],
    ['JWT_EXPOSED', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, '복사용 프롬프트에 JWT가 노출되었습니다.'],
    ['TOKEN_EXPOSED', /\b(?:access[_ -]?token|refresh[_ -]?token|service[_ -]?role[_ -]?key|sb_secret_[A-Za-z0-9_-]+)\b/i, '복사용 프롬프트에 인증 token 또는 비밀 key가 노출되었습니다.'],
    ['UUID_EXPOSED', /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i, '복사용 프롬프트에 내부 UUID가 노출되었습니다.'],
    ['INTERNAL_ERROR_EXPOSED', /\b(?:SQLSTATE|PostgREST|duplicate key|violates [^\n]* constraint)\b/i, '복사용 프롬프트에 내부 SQL 또는 constraint 정보가 노출되었습니다.'],
    ['INTERNAL_FIELD_EXPOSED', /\b(?:html_body|image_prompt|previous_update_id|topic_id|post_id|update_id)\b/i, '복사용 프롬프트에 내부 필드명이 노출되었습니다.'],
  ]
  for (const [code, pattern, message] of findings) if (pattern.test(promptText)) collector.add('error', code, message, 'privacy')
  if (/<div class="daily-brief-note[^>]*>\s*<h1[\s>][\s\S]{500,}<\/div>/i.test(promptText) || /\[WORDPRESS_HTML\][\s\S]+\[\/WORDPRESS_HTML\]/i.test(promptText)) {
    collector.add('error', 'FULL_HTML_BODY_EXPOSED', '복사용 프롬프트 context에 WordPress HTML 전체 원문이 포함되었습니다.', 'privacy')
  }
}

function validateLength(promptText: string, mode: ValidateBriefingPromptInput['mode'], collector: ValidationCollector) {
  const limits = PROMPT_LENGTH_LIMITS[mode]
  if (promptText.length < limits.minimum) collector.add('warning', 'PROMPT_TOO_SHORT', '프롬프트가 선택한 모드의 기대 길이보다 짧습니다.', 'length', undefined, `${promptText.length}자`)
  if (promptText.length > limits.warningMaximum) collector.add('warning', 'PROMPT_TOO_LONG', '프롬프트가 매우 깁니다. 저장은 가능하지만 복사 전 확인해 주세요.', 'length', undefined, `${promptText.length}자`)
  if (promptText.length >= limits.minimum && promptText.length <= limits.warningMaximum) collector.check('PROMPT_LENGTH_EXPECTED', '프롬프트 길이가 선택한 모드의 기대 범위입니다.', 'length')
}

export function validateBriefingPrompt(input: ValidateBriefingPromptInput): BriefingPromptValidationResult {
  const collector = new ValidationCollector()
  validateStructure(input, collector)
  validateOutputRequirements(input.promptText, collector)
  validateCategory(input, collector)
  validateContextIntegrity(input, collector)
  validateCoverage(input, collector)
  validateUpdateRelations(input, collector)
  validateRepeatAndCopyright(input.promptText, collector)
  validatePrivacy(input.promptText, collector)
  validateLength(input.promptText, input.mode, collector)
  const sectionCount = Object.values(PROMPT_SECTION_MARKERS)
    .filter((marker) => input.promptText.includes(marker)).length
  return collector.result({
    characterCount: input.promptText.length,
    lineCount: input.promptText ? input.promptText.split('\n').length : 0,
    sectionCount,
  })
}
