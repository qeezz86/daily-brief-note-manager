import { briefingPromptModeLabels, type BriefingPromptMode, type NewsBriefingPromptContext } from './briefingPrompts.types'
import {
  PROMPT_TEMPLATE_VERSION,
  resolveCategoryPromptRule,
} from './categoryPromptRules'
import {
  PROMPT_BOUNDARY_MARKERS,
  PROMPT_SECTION_MARKERS,
  REQUIRED_OUTPUT_ORDER,
} from './briefingPromptValidation.constants'

const updateLabels = { new: '신규', follow_up: '후속', correction: '정정', closure_note: '종료 메모' }
const topicStatusLabels = { active: '활성', monitoring: '모니터링', reopened: '재개' }
const priorityLabels = { high: '높음', normal: '보통', low: '낮음' }

function compact(text: string | null, max: number): string | null {
  if (!text) return null
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  const candidate = normalized.slice(0, max + 1)
  const boundary = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('다. '), candidate.lastIndexOf('? '), candidate.lastIndexOf('! '))
  return boundary >= Math.floor(max * 0.5) ? `${candidate.slice(0, boundary + 1)} … (이하 생략)` : '[길이 제한으로 상세 요약 생략]'
}

function displayCompact(text: string | null, max: number): string {
  return compact(text, max) ?? '없음'
}

function recentPosts(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string[] {
  if (!context.recentPosts.length) return ['최근 게시물 없음']
  return context.recentPosts.flatMap((post) => {
    const lines = [`### ${post.displayId || post.publishedOn} | ${post.title}`, `- 발행일: ${post.publishedOn}`]
    const summary = compact(post.summary, 600)
    if (summary) lines.push(`- 전체 요약: ${summary}`)
    if (!post.updates.length) lines.push('- 뉴스 항목: 없음')
    for (const update of post.updates) {
      lines.push(`- [${updateLabels[update.updateType]}] ${update.headline} (${update.topicKey})`)
      lines.push(`  - 사실: ${displayCompact(update.factSummary, 350)}`)
      if (mode === 'detailed') {
        if (update.importanceSummary) lines.push(`  - 중요성: ${compact(update.importanceSummary, 350)}`)
        if (update.impactSummary) lines.push(`  - 영향: ${compact(update.impactSummary, 350)}`)
        if (update.changeSummary) lines.push(`  - 변화: ${compact(update.changeSummary, 250)}`)
      }
    }
    return lines
  })
}

function openTopics(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string[] {
  if (!context.openTopics.length) return ['현재 추적 중 주제 없음']
  return context.openTopics.flatMap((topic) => {
    const lines = [`### ${topic.canonicalTitle} (${topic.topicKey})`, `- 상태: ${topicStatusLabels[topic.status]}`, `- 최근 확인: ${topic.lastSeenAt}`]
    if (topic.topicSummary) lines.push(`- 주제 요약: ${compact(topic.topicSummary, 350)}`)
    if (topic.lastClosedReason) lines.push(`- 보존된 마지막 종료 사유: ${compact(topic.lastClosedReason, 250)}`)
    if (topic.latestUpdate) {
      lines.push(`- 최신 업데이트: [${updateLabels[topic.latestUpdate.updateType]}] ${topic.latestUpdate.headline}${topic.latestUpdate.publishedOn ? ` (${topic.latestUpdate.publishedOn})` : ''}`)
      if (mode === 'detailed') {
        lines.push(`  - 사실: ${displayCompact(topic.latestUpdate.factSummary, 350)}`)
        if (topic.latestUpdate.changeSummary) lines.push(`  - 변화: ${compact(topic.latestUpdate.changeSummary, 250)}`)
      }
    }
    return lines
  })
}

function followups(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string[] {
  const items = mode === 'simple'
    ? context.pendingFollowups.filter((item) => item.overdue || item.priority === 'high')
    : context.pendingFollowups
  if (!items.length) return ['미완료 후속 확인 없음']
  return items.map((item) => `- [${item.overdue ? '마감 초과 · ' : ''}${priorityLabels[item.priority]}] ${item.checkText} — ${item.topicTitle}${item.dueDate ? ` (마감 ${item.dueDate})` : ''}`)
}

function closedTopics(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string[] {
  if (!context.recentClosedTopics.length) return ['조회 기간 내 종료 주제 없음']
  return context.recentClosedTopics.flatMap((topic) => {
    const lines = [`- ${topic.canonicalTitle} (${topic.topicKey})`, `  - 종료 시각: ${topic.closedAt}`]
    if (topic.closedReason) lines.push(`  - 종료 사유: ${compact(topic.closedReason, 250)}`)
    if (mode !== 'simple' && topic.topicSummary) lines.push(`  - 주제 요약: ${compact(topic.topicSummary, 350)}`)
    if (mode === 'detailed' && topic.closureNote) lines.push(`  - 마지막 종료 메모: ${topic.closureNote.headline} — ${displayCompact(topic.closureNote.factSummary, 350)}`)
    return lines
  })
}

export function buildNewsBriefingPrompt(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string {
  if (context.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION) {
    throw new Error(`지원하지 않는 프롬프트 템플릿 버전입니다: ${context.promptTemplateVersion ?? '없음'}`)
  }
  const rule = resolveCategoryPromptRule(context.category, context.referenceDate)
  const sections: string[] = [
    PROMPT_BOUNDARY_MARKERS.begin, '',
    `프로젝트: Daily Brief Note`,
    `작업: ${rule.displayName} 뉴스 브리핑 작성`,
    `적용 템플릿: ${rule.templateName}`,
    `프롬프트 템플릿 버전: ${PROMPT_TEMPLATE_VERSION}`,
    `작성 기준일: ${context.referenceDate}`,
    `모드: ${briefingPromptModeLabels[mode]}`,
    `브리핑 ID 패턴: ${rule.briefingIdPattern}`,
    `브리핑 ID: ${rule.briefingIdExample}`,
    `URL 슬러그 패턴: ${rule.slugPattern}`,
    `URL 슬러그: ${rule.slugExample}`,
    `Wrapper: ${rule.wrapperClass}`,
    `참조 범위: 최근 ${context.recentPosts.length}개 게시물`, '',
    PROMPT_SECTION_MARKERS.principles,
    '- 최신 공개 자료를 새로 조사하고 공식 자료와 신뢰할 수 있는 보도를 우선하며 실제 발생 여부를 확인한다.',
    '- 공식 발표일, 사실 발생일, 기사 작성일과 작성 기준 시각을 구분한다.',
    '- 날짜·수치·단위·인명·기관명을 검증하고 원 출처와 2차 보도의 의미가 일치하는지 확인한다.',
    '- 후속 보도, 정정, 철회와 최신 상태를 확인하고 출처를 여러 기관에 편중하지 않는다.',
    '- 기존 브리핑과 완전히 동일한 내용, 표현만 바뀐 동일 보도, 새로운 사실이 없는 반복 보도는 제외한다.',
    '- 같은 사건은 공식 발표·새 수치·정책 확정 등 의미 있는 진전이 있을 때만 업데이트로 다룬다.',
    '- pending 후속 확인 항목을 확인하고 날짜·수치·기관명·인물명을 검증한다.',
    '- 사실, 공식 입장, 분석과 전망을 구분하고 확인되지 않은 전망을 사실처럼 작성하지 않는다.',
    '- 각 뉴스에 무엇이 확인됐는지, 왜 중요한지, 독자에게 미치는 영향, 앞으로 확인할 포인트를 포함한다.',
    '- 기사 전문·문단·리드를 복사하거나 해외 기사 전체 직역, 방송 자막 대량 복제를 하지 않고 독립적인 표현과 구성으로 재작성한다.',
    '- 언론사 사진·도표와 방송 화면을 무단 사용하거나 모사하지 않는다.',
    '- 출처는 공식 자료와 신뢰할 수 있는 보도를 우선하고 개별 기사·발표·보고서의 개별 원문 URL을 사용한다.',
    '- 홈페이지, 검색 결과, 목록 페이지는 최종 출처로 사용하지 않으며 확인되지 않은 내용은 제외한다.',
    '- 뉴스 수를 억지로 채우지 않는다.', '',
    PROMPT_SECTION_MARKERS.researchScope,
    ...rule.researchScope.map((item) => `- ${item}`), '',
    PROMPT_SECTION_MARKERS.categoryInstructions,
    ...rule.requiredInstructions.map((item) => `- ${item}`), '',
    PROMPT_SECTION_MARKERS.recentPosts, ...recentPosts(context, mode), '',
  ]
  if (mode !== 'simple') sections.push(PROMPT_SECTION_MARKERS.openTopics, ...openTopics(context, mode), '')
  sections.push(PROMPT_SECTION_MARKERS.followups, ...followups(context, mode), '')
  sections.push(PROMPT_SECTION_MARKERS.closedTopics, ...closedTopics(context, mode), '',
    PROMPT_SECTION_MARKERS.repeatPrevention,
    '- 종료된 뉴스는 새로운 공식 발표나 실질적 변화가 확인되지 않는 한 다시 포함하지 않는다.',
    '- 종료 후 의미 있는 진전이 확인되면 재개 사유를 명시하고 업데이트로 처리한다.', '',
    '- 의미 있는 재개 근거가 없으면 반복하지 않는다.',
    '- 종료 주제를 신규 뉴스로 무조건 재사용하지 않는다.', '',
    PROMPT_SECTION_MARKERS.currentTask,
    `- ${context.referenceDate} 기준 ${rule.displayName} 브리핑을 작성한다.`,
    '- 최근 이력과 추적 상태를 중복 방지 자료로 사용하되, 최신 사실은 공개 원문에서 다시 확인한다.', '',
    PROMPT_SECTION_MARKERS.updateLabels,
    '- 각 뉴스의 .update-label에 최초 포함이면 “신규”, 의미 있는 변화가 있으면 “업데이트｜[이전 브리핑 ID] 후속”을 표시한다.',
    '- 후속은 이전 대비 변화를 확인하고 이전 update와 연결해 명시한다.',
    '- 정정은 잘못된 기존 사실과 수정 내용을 구분한다.',
    '- 종료 메모는 종료 메모임을 명시하고 종료 근거를 적는다. 변화가 없는 반복 보도는 포함하지 않는다.', '',
    PROMPT_SECTION_MARKERS.outputOrder,
    ...REQUIRED_OUTPUT_ORDER,
    '- SEO 항목과 이미지 항목은 HTML 밖에 별도 일반 텍스트로 출력한다.', '',
    PROMPT_SECTION_MARKERS.seoRules,
    `- 대표 제목 형식: ${rule.seoTitlePattern}`,
    '- 대표 제목과 대안 제목은 본문에 있는 핵심 이슈만 사용하고 과도한 클릭 유도나 미확인 사실을 넣지 않는다.',
    '- 메타 설명은 날짜·카테고리 문구로 기계적으로 시작하지 말고 핵심 이슈를 앞에 두며 120~160자를 권장한다.',
    `- URL 슬러그는 정확히 ${rule.slugExample} 형식을 사용한다.`,
    '- 태그는 5~8개만 사용하고 카테고리명, Daily Brief Note, DailyBriefNote, 제목 전체, 중복·유사 태그를 제외한다.', '',
    PROMPT_SECTION_MARKERS.htmlRules,
    `- 전체를 <div class="${rule.wrapperClass}">로 시작하고 HTML 내부에 h1을 포함하며 마지막 </div>까지 완전하게 출력한다.`,
    '- WordPress HTML만 하나의 연속된 ```html 코드블록에 넣고 그 안에 Markdown을 섞거나 여러 HTML 블록으로 나누지 않는다.',
    '- 등록된 Daily Brief Note 템플릿의 class만 사용하고 새 class, inline style, script, iframe, 중복 id를 사용하지 않는다.',
    '- 본문 순서는 h1 → intro → brief-meta → summary-box → 목차 → 뉴스 issue → 뉴스 간 연결성 → change-log → watch-points → FAQ → 하단 섹션으로 구성한다.',
    '- brief-meta에 작성일, 브리핑 ID와 확인 시각·조사 범위를 포함한 작성 기준을 표시한다.',
    '- 대표 이미지 프롬프트와 ALT 문구를 HTML 안에 넣지 않는다.',
    '- 기사 전문, 문단 대량 복사, 제목·리드 재사용, 해외 기사 전체 직역, 타사 표·도표 복제를 금지한다.', '',
    PROMPT_SECTION_MARKERS.footerOrder,
    ...rule.footerOrder.map((item, index) => `${index + 1}. ${item}`),
    `- 이전 브리핑 섹션에는 관련성이 높은 이전 ${rule.displayName} 브리핑의 실제 내부 링크를 포함한다.`,
    `- content-note는 본문의 마지막에 다음 문구와 태그를 그대로 사용한다: <p class="content-note">${rule.contentNote}</p>`, '',
    PROMPT_SECTION_MARKERS.imageRules,
    '- 16:9, 1200×675px, 현실적인 전문 뉴스 미디어 스타일로 기사 내용을 독립적으로 구성한다.',
    '- 텍스트, 기사 제목, 기업·언론사 로고, 워터마크, 과도한 공포·선정성을 넣지 않고 언론사 사진을 모사하지 않는다.',
    '- ALT 문구는 본문 주제와 실제 이미지 구성을 설명하는 자연스러운 문장으로 작성한다.', '',
  )
  if (mode !== 'simple') {
    sections.push(
      PROMPT_SECTION_MARKERS.sourcePriorities,
      ...rule.sourcePriorities.map((item, index) => `${index + 1}. ${item}`),
      '- 각 출처는 기관·언론사명, 원문 제목, 게시·업데이트일, 개별 원문 URL, 확인한 핵심 내용을 기록한다.',
      '- 홈페이지, 검색 결과, 목록 페이지는 최종 출처로 사용하지 않는다.', '',
      PROMPT_SECTION_MARKERS.sourceHtml,
      '- 본문 말미의 <section id="sources"><h2>출처 및 참고자료</h2> 구조 안에 개별 원문 링크를 순서대로 둔다.',
      '- 외부 링크는 필요한 경우 target="_blank"와 rel="noopener"를 함께 사용한다.', '',
    )
  }
  if (mode === 'detailed') {
    sections.push(
      PROMPT_SECTION_MARKERS.detailedChecks,
      '- 사실 발생 여부, 공식 발표일, 기사 작성일, 최신 상태, 정정·철회 여부를 각각 확인한다.',
      '- 날짜·시각·수치·단위·인명·기관명과 원 출처·2차 보도 간 의미 일치를 확인한다.',
      '- 신규·후속·정정·종료 메모 판정을 기존 주제와 이전 업데이트에 대조한다.',
      '- 신규 뉴스가 부족하면 개수를 줄이고, 동일 사건에 실질적 변화가 없으면 제외한다.',
      ...rule.detailedChecks.map((item) => `- ${item}`),
      '- 발행 전 체크리스트에 HTML 완결성, SEO, 출처, 저작권, 내부 링크, 이미지 프롬프트 분리를 항목별로 확인한다.', '',
    )
  }
  sections.push(PROMPT_BOUNDARY_MARKERS.end)
  return sections.join('\n')
}
