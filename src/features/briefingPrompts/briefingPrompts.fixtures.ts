import type { BriefingPromptRun, NewsBriefingPromptContext } from './briefingPrompts.types'

export const briefingPromptContextFixture: NewsBriefingPromptContext = {
  schemaVersion: 1,
  promptTemplateVersion: 1,
  referenceDate: '2026-07-13',
  category: { id: 'economy', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD' },
  recentPosts: [{
    id: '11111111-1111-4111-8111-111111111111', publishedOn: '2026-07-12', displayId: '#2026-07-12-ECO', title: '최근 경제 브리핑', summary: '최근 경제 핵심 요약',
    updates: [{ id: '22222222-2222-4222-8222-222222222222', itemOrder: 1, updateType: 'follow_up', headline: '기준금리 후속 발표', factSummary: '공식 수치가 발표됐다.', importanceSummary: '통화정책 방향을 보여준다.', impactSummary: '시장금리에 영향을 준다.', changeSummary: '이전 전망이 공식 결정으로 바뀌었다.', topicId: '33333333-3333-4333-8333-333333333333', topicKey: 'base-rate', topicTitle: '기준금리', previousUpdateId: null }],
  }],
  openTopics: [{ id: '33333333-3333-4333-8333-333333333333', topicKey: 'base-rate', canonicalTitle: '기준금리', topicSummary: '통화정책 추적', status: 'active', firstSeenAt: '2026-07-01T00:00:00+09:00', lastSeenAt: '2026-07-12T00:00:00+09:00', lastClosedReason: null, latestUpdate: { id: '22222222-2222-4222-8222-222222222222', headline: '기준금리 후속 발표', updateType: 'follow_up', factSummary: '공식 수치가 발표됐다.', changeSummary: '공식 결정으로 바뀌었다.', publishedOn: '2026-07-12' } }],
  pendingFollowups: [{ id: '44444444-4444-4444-8444-444444444444', checkText: '한국은행 의결문 확인', priority: 'high', dueDate: '2026-07-12', overdue: true, topicId: '33333333-3333-4333-8333-333333333333', topicKey: 'base-rate', topicTitle: '기준금리' }],
  recentClosedTopics: [{ id: '55555555-5555-4555-8555-555555555555', topicKey: 'old-policy', canonicalTitle: '종료된 정책', topicSummary: '정책 절차 종료', closedReason: '공식 절차 완료', closedAt: '2026-07-10T12:00:00+09:00', closureNote: { headline: '절차 종료', factSummary: '기관이 종료를 발표했다.', changeSummary: '추적 종료' } }],
  counts: { recentPosts: 1, recentUpdates: 1, openTopics: 1, pendingFollowups: 1, overdueFollowups: 1, recentClosedTopics: 1 },
}

export const briefingPromptRunFixture: BriefingPromptRun = {
  id: '66666666-6666-4666-8666-666666666666',
  categoryId: 'economy',
  referenceDate: '2026-07-13',
  promptMode: 'standard',
  closedLookbackDays: 90,
  contextSchemaVersion: 1,
  promptTemplateVersion: 1,
  contextSnapshot: briefingPromptContextFixture,
  promptText: '[BEGIN_DAILY_BRIEF_NOTE_PROMPT]\n작업: 경제 뉴스 브리핑 작성\n[END_DAILY_BRIEF_NOTE_PROMPT]',
  isPinned: false,
  generatedAt: '2026-07-13T03:30:00+00:00',
  requestedPostCount: 5,
  actualPostCount: 1,
}

export function briefingPromptRunRow(
  run: BriefingPromptRun = briefingPromptRunFixture,
) {
  return {
    id: run.id,
    category_id: run.categoryId,
    reference_date: run.referenceDate,
    prompt_mode: run.promptMode,
    closed_lookback_days: run.closedLookbackDays,
    context_schema_version: run.contextSchemaVersion,
    context_snapshot: run.contextSnapshot,
    prompt_text: run.promptText,
    is_pinned: run.isPinned,
    generated_at: run.generatedAt,
    requested_post_count: run.requestedPostCount,
    actual_post_count: run.actualPostCount,
  }
}
