import { briefingPromptModeLabels, type BriefingPromptMode, type NewsBriefingPromptContext } from './briefingPrompts.types'

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

function applyDatePattern(pattern: string | null, referenceDate: string): string {
  if (!pattern) return '설정 없음'
  const [year, month, day] = referenceDate.split('-')
  return pattern.replaceAll('YYYY', year).replaceAll('MM', month).replaceAll('DD', day)
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
      lines.push(`  - 사실: ${compact(update.factSummary, 350)}`)
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
        lines.push(`  - 사실: ${compact(topic.latestUpdate.factSummary, 350)}`)
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
    if (mode === 'detailed' && topic.closureNote) lines.push(`  - 마지막 종료 메모: ${topic.closureNote.headline} — ${compact(topic.closureNote.factSummary, 350)}`)
    return lines
  })
}

export function buildNewsBriefingPrompt(context: NewsBriefingPromptContext, mode: BriefingPromptMode): string {
  const displayId = applyDatePattern(context.category.displayIdPattern, context.referenceDate)
  const slug = applyDatePattern(context.category.slugPattern, context.referenceDate)
  const sections: string[] = [
    '[BEGIN_DAILY_BRIEF_NOTE_PROMPT]', '',
    `프로젝트: Daily Brief Note`,
    `작업: ${context.category.name} 뉴스 브리핑 작성`,
    `작성 기준일: ${context.referenceDate}`,
    `모드: ${briefingPromptModeLabels[mode]}`,
    `브리핑 ID: ${displayId}`,
    `URL 슬러그: ${slug}`,
    `Wrapper: ${context.category.wrapperClass}`,
    `참조 범위: 최근 ${context.recentPosts.length}개 게시물`, '',
    '[작성 원칙]',
    '- 최신 공개 자료를 새로 조사하고 공식 자료와 신뢰할 수 있는 보도를 우선한다.',
    '- 기존 브리핑과 완전히 동일한 내용, 표현만 바뀐 동일 보도, 새로운 사실이 없는 반복 보도는 제외한다.',
    '- 같은 사건은 공식 발표·새 수치·정책 확정 등 의미 있는 진전이 있을 때만 업데이트로 다룬다.',
    '- pending 후속 확인 항목을 확인하고 날짜·수치·기관명·인물명을 검증한다.',
    '- 사실과 분석·전망을 구분하고 확인되지 않은 내용은 작성하지 않는다.',
    '- 기사 문장을 복사하거나 해외 기사를 전체 직역하지 않는다.',
    '- 뉴스 수를 억지로 채우지 않는다.', '',
    '[최근 브리핑]', ...recentPosts(context, mode), '',
  ]
  if (mode !== 'simple') sections.push('[현재 추적 주제]', ...openTopics(context, mode), '')
  sections.push('[후속 확인 항목]', ...followups(context, mode), '')
  sections.push('[최근 종료 주제]', ...closedTopics(context, mode), '',
    '[반복 방지]',
    '- 종료된 뉴스는 새로운 공식 발표나 실질적 변화가 확인되지 않는 한 다시 포함하지 않는다.',
    '- 종료 후 의미 있는 진전이 확인되면 재개 사유를 명시하고 업데이트로 처리한다.', '',
    '[이번 작업]',
    `- ${context.referenceDate} 기준 ${context.category.name} 브리핑을 작성한다.`,
    '- 최근 이력과 추적 상태를 중복 방지 자료로 사용하되, 최신 사실은 공개 원문에서 다시 확인한다.', '',
    '[출력 요구사항]',
    '- SEO 대표 제목, 대안 제목 4개, 메타 설명, URL slug, 포커스 키워드, SEO 태그, WordPress HTML, 대표 이미지 프롬프트, 이미지 ALT, 발행 전 체크리스트 순서로 작성한다.',
    '- WordPress HTML은 하나의 블록이며 h1과 지정 wrapper를 포함하고 마지막 wrapper를 닫는다.',
    '- 태그는 5~8개이며 카테고리명, Daily Brief Note, DailyBriefNote와 의미 중복 태그를 제외한다.',
    '- 대표 이미지 프롬프트와 ALT는 HTML 밖에 출력한다.', '',
    '[END_DAILY_BRIEF_NOTE_PROMPT]')
  return sections.join('\n')
}
