import { describe, expect, it } from 'vitest'
import { buildNewsBriefingPrompt } from './buildBriefingPrompt'
import { briefingPromptContextFixture } from './briefingPrompts.fixtures'
import type { BriefingPromptMode, NewsBriefingPromptContext } from './briefingPrompts.types'
import { PROMPT_TEMPLATE_VERSION } from './categoryPromptRules'
import { validateBriefingPrompt } from './validateBriefingPrompt'

function cloneContext(): NewsBriefingPromptContext {
  return structuredClone(briefingPromptContextFixture)
}

function runValidation(options: {
  context?: NewsBriefingPromptContext
  mode?: BriefingPromptMode
  prompt?: string
  categoryId?: string
  referenceDate?: string
  promptTemplateVersion?: number
} = {}) {
  const context = options.context ?? cloneContext()
  const mode = options.mode ?? 'standard'
  const prompt = options.prompt ?? buildNewsBriefingPrompt(context, mode)
  return validateBriefingPrompt({
    promptText: prompt,
    context,
    mode,
    settings: {
      categoryId: options.categoryId ?? context.category.id,
      referenceDate: options.referenceDate ?? context.referenceDate,
      mode,
      closedLookbackDays: 90,
    },
    promptTemplateVersion: options.promptTemplateVersion ?? PROMPT_TEMPLATE_VERSION,
  })
}

function codes(result: ReturnType<typeof runValidation>) {
  return [...result.errors, ...result.warnings].map((issue) => issue.code)
}

describe('validateBriefingPrompt structure and output', () => {
  it('accepts a complete deterministic standard prompt', () => {
    const result = runValidation()
    expect(result.status).toBe('valid')
    expect(result.errors).toEqual([])
    expect(result.validationVersion).toBe(1)
  })
  it.each([
    ['[BEGIN_DAILY_BRIEF_NOTE_PROMPT]', 'MISSING_BEGIN_MARKER'],
    ['[END_DAILY_BRIEF_NOTE_PROMPT]', 'MISSING_END_MARKER'],
    ['[작성 원칙]', 'MISSING_REQUIRED_SECTION'],
  ])('detects a missing %s marker', (marker, code) => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard').replace(marker, '')
    expect(codes(runValidation({ context, prompt }))).toContain(code)
  })
  it('detects duplicate boundary and section markers', () => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard')
      .replace('[작성 원칙]', '[작성 원칙]\n[작성 원칙]')
      .replace('[BEGIN_DAILY_BRIEF_NOTE_PROMPT]', '[BEGIN_DAILY_BRIEF_NOTE_PROMPT]\n[BEGIN_DAILY_BRIEF_NOTE_PROMPT]')
    expect(codes(runValidation({ context, prompt }))).toEqual(expect.arrayContaining(['DUPLICATE_BEGIN_MARKER', 'DUPLICATE_SECTION_MARKER']))
  })
  it('detects a missing output item', () => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard').replace('2. SEO 대안 제목 4개', '')
    expect(codes(runValidation({ context, prompt }))).toContain('MISSING_OUTPUT_ORDER')
  })
  it('detects reversed output order', () => {
    const context = cloneContext()
    const original = buildNewsBriefingPrompt(context, 'standard')
    const prompt = original.replace('1. SEO 입력용 대표 제목', '__FIRST__').replace('2. SEO 대안 제목 4개', '1. SEO 입력용 대표 제목').replace('__FIRST__', '2. SEO 대안 제목 4개')
    expect(codes(runValidation({ context, prompt }))).toContain('INVALID_OUTPUT_ORDER')
  })
  it.each([
    ['daily-brief-note news-briefing economy', 'MISSING_CATEGORY_RULE'],
    ['브리핑 ID 패턴: #YYYY-MM-DD-ECO', 'MISSING_CATEGORY_RULE'],
    ['URL 슬러그 패턴: economy-briefing-YYYY-MM-DD', 'MISSING_CATEGORY_RULE'],
    ['- 거시경제', 'MISSING_CATEGORY_RULE'],
    ['1. 정부 부처와 공공기관', 'MISSING_CATEGORY_RULE'],
    ['공식 통계의 확정치·잠정치·전망을 구분한다.', 'MISSING_CATEGORY_RULE'],
  ])('detects a missing category rule: %s', (needle, code) => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard').replaceAll(needle, '')
    expect(codes(runValidation({ context, prompt }))).toContain(code)
  })
  it('detects an empty category code configuration', () => {
    const context = cloneContext()
    context.category.code = ''
    expect(codes(runValidation({ context }))).toContain('CATEGORY_CODE')
  })
})

describe('validateBriefingPrompt context integrity and duplicates', () => {
  it('detects category, reference date and template version mismatches', () => {
    expect(codes(runValidation({ categoryId: 'global' }))).toContain('CONTEXT_CATEGORY_MISMATCH')
    expect(codes(runValidation({ referenceDate: '2026-07-12' }))).toContain('CONTEXT_REFERENCE_DATE_MISMATCH')
    expect(codes(runValidation({ promptTemplateVersion: 2 }))).toContain('PROMPT_TEMPLATE_VERSION_MISMATCH')
  })
  it('detects a generation mode mismatch', () => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard')
    const result = validateBriefingPrompt({ promptText: prompt, context, mode: 'standard', settings: { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'detailed', closedLookbackDays: 90 }, promptTemplateVersion: 1 })
    expect(codes(result)).toContain('PROMPT_MODE_MISMATCH')
  })
  it('does not silently hide invalid counts', () => {
    const context = cloneContext()
    context.counts.recentPosts = 99
    expect(codes(runValidation({ context }))).toContain('CONTEXT_COUNT_MISMATCH')
  })
  it('detects duplicate recent posts and followups', () => {
    const context = cloneContext()
    context.recentPosts.push(structuredClone(context.recentPosts[0]))
    context.pendingFollowups.push(structuredClone(context.pendingFollowups[0]))
    context.counts.recentPosts = 2
    context.counts.recentUpdates = 2
    context.counts.pendingFollowups = 2
    context.counts.overdueFollowups = 2
    expect(codes(runValidation({ context }))).toEqual(expect.arrayContaining(['DUPLICATE_RECENT_POST_ID', 'DUPLICATE_FOLLOWUP_ID', 'DUPLICATE_UPDATE_ID']))
  })
  it('detects a topic present in open and closed lists', () => {
    const context = cloneContext()
    context.recentClosedTopics[0] = { ...context.recentClosedTopics[0], topicKey: context.openTopics[0].topicKey }
    expect(codes(runValidation({ context }))).toContain('TOPIC_OPEN_AND_CLOSED')
  })
  it('warns only for normalized exact headline duplicates', () => {
    const context = cloneContext()
    const duplicate = { ...context.recentPosts[0].updates[0], id: '99999999-9999-4999-8999-999999999999', itemOrder: 2, headline: '  기준금리   후속 발표  ' }
    context.recentPosts[0].updates.push(duplicate)
    context.counts.recentUpdates = 2
    expect(codes(runValidation({ context }))).toContain('DUPLICATE_NORMALIZED_HEADLINE')
  })
  it('detects non-deterministic item order', () => {
    const context = cloneContext()
    const earlier = { ...context.recentPosts[0].updates[0], id: '99999999-9999-4999-8999-999999999999', itemOrder: 2 }
    context.recentPosts[0].updates.unshift(earlier)
    context.counts.recentUpdates = 2
    expect(codes(runValidation({ context }))).toContain('NON_DETERMINISTIC_CONTEXT_ORDER')
  })
})

describe('validateBriefingPrompt mode coverage and update relationships', () => {
  it('allows simple mode to omit open-topic and detailed sections with a warning', () => {
    const result = runValidation({ mode: 'simple' })
    expect(result.errors).toEqual([])
    expect(codes(result)).toContain('SIMPLE_MODE_DETAIL_OMITTED')
  })
  it('requires every standard open topic and pending followup', () => {
    const context = cloneContext()
    const base = buildNewsBriefingPrompt(context, 'standard')
    expect(codes(runValidation({ context, prompt: base.replaceAll('base-rate', 'removed-topic').replaceAll('기준금리', '제거된 주제') }))).toContain('MISSING_OPEN_TOPIC')
    expect(codes(runValidation({ context, prompt: base.replace('한국은행 의결문 확인', '') }))).toContain('MISSING_PENDING_FOLLOWUP')
  })
  it.each([
    ['통화정책 방향을 보여준다.', 'MISSING_IMPORTANCE_SUMMARY'],
    ['시장금리에 영향을 준다.', 'MISSING_IMPACT_SUMMARY'],
    ['이전 전망이 공식 결정으로 바뀌었다.', 'MISSING_CHANGE_SUMMARY'],
  ])('requires detailed %s coverage', (needle, code) => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'detailed').replace(needle, '')
    expect(codes(runValidation({ context, mode: 'detailed', prompt }))).toContain(code)
  })
  it('requires overdue, priority, due date and topic labels', () => {
    const context = cloneContext()
    const base = buildNewsBriefingPrompt(context, 'standard')
    expect(codes(runValidation({ context, prompt: base.replace('마감 초과 · 높음', '높음') }))).toContain('MISSING_OVERDUE_LABEL')
    expect(codes(runValidation({ context, prompt: base.replace('(마감 2026-07-12)', '') }))).toContain('MISSING_FOLLOWUP_DUE_DATE')
  })
  it('detects invalid new and follow-up relationships', () => {
    const context = cloneContext()
    context.recentPosts[0].updates[0] = { ...context.recentPosts[0].updates[0], updateType: 'new', previousUpdateId: '88888888-8888-4888-8888-888888888888' }
    expect(codes(runValidation({ context }))).toContain('NEW_UPDATE_HAS_PREVIOUS')
    context.recentPosts[0].updates[0] = { ...context.recentPosts[0].updates[0], updateType: 'follow_up', previousUpdateId: null, changeSummary: null }
    expect(codes(runValidation({ context }))).toEqual(expect.arrayContaining(['UPDATE_PREVIOUS_REQUIRED', 'UPDATE_CHANGE_REQUIRED']))
  })
  it('detects invalid correction and closure relationships', () => {
    const correction = cloneContext()
    correction.recentPosts[0].updates[0] = { ...correction.recentPosts[0].updates[0], updateType: 'correction', previousUpdateId: null, changeSummary: null }
    expect(codes(runValidation({ context: correction }))).toEqual(expect.arrayContaining(['UPDATE_PREVIOUS_REQUIRED', 'UPDATE_CHANGE_REQUIRED']))
    const closure = cloneContext()
    closure.recentPosts[0].updates[0] = { ...closure.recentPosts[0].updates[0], updateType: 'closure_note' }
    expect(codes(runValidation({ context: closure }))).toContain('CLOSURE_TOPIC_NOT_CLOSED')
  })
  it('checks empty-state labels and reports data availability warnings', () => {
    const context = cloneContext()
    context.recentPosts = []; context.openTopics = []; context.pendingFollowups = []; context.recentClosedTopics = []
    context.counts = { recentPosts: 0, recentUpdates: 0, openTopics: 0, pendingFollowups: 0, overdueFollowups: 0, recentClosedTopics: 0 }
    const result = runValidation({ context })
    expect(result.errors).toEqual([])
    expect(codes(result)).toEqual(expect.arrayContaining(['NO_RECENT_POSTS', 'NO_OPEN_TOPICS', 'NO_PENDING_FOLLOWUPS', 'NO_RECENT_CLOSED_TOPICS']))
  })
  it('rejects resolved followups and reopened topics in pending/closed sections', () => {
    const context = cloneContext()
    context.pendingFollowups[0].status = 'done'
    context.recentClosedTopics[0].status = 'reopened'
    expect(codes(runValidation({ context }))).toEqual(expect.arrayContaining(['RESOLVED_FOLLOWUP_IN_PENDING', 'NON_CLOSED_TOPIC_IN_CLOSED_LIST']))
  })
})

describe('validateBriefingPrompt privacy, copyright and length', () => {
  it.each([
    ['owner_id: private', 'OWNER_ID_EXPOSED'],
    ['user@example.com', 'EMAIL_EXPOSED'],
    ['11111111-1111-4111-8111-111111111111', 'UUID_EXPOSED'],
    ['access_token: secret', 'TOKEN_EXPOSED'],
    ['SQLSTATE 23505 duplicate key', 'INTERNAL_ERROR_EXPOSED'],
  ])('blocks exposed private data: %s', (leak, code) => {
    const context = cloneContext()
    const prompt = `${buildNewsBriefingPrompt(context, 'standard')}\n${leak}`
    expect(codes(runValidation({ context, prompt }))).toContain(code)
  })
  it('detects a leaked full WordPress body', () => {
    const context = cloneContext()
    const html = `<div class="daily-brief-note news-briefing economy"><h1>원문</h1>${'<p>기사 원문</p>'.repeat(80)}</div>`
    expect(codes(runValidation({ context, prompt: `${buildNewsBriefingPrompt(context, 'standard')}\n${html}` }))).toContain('FULL_HTML_BODY_EXPOSED')
  })
  it.each([
    ['방송 자막 대량 복제', 'MISSING_NO_BULK_CAPTIONS'],
    ['개별 원문 URL', 'MISSING_INDIVIDUAL_SOURCE_URL'],
    ['공식 자료와 신뢰할 수 있는 보도', 'MISSING_PREFER_RELIABLE_SOURCES'],
  ])('detects a missing copyright/source instruction: %s', (needle, code) => {
    const context = cloneContext()
    const prompt = buildNewsBriefingPrompt(context, 'standard').replaceAll(needle, '')
    expect(codes(runValidation({ context, prompt }))).toContain(code)
  })
  it('warns about an excessively long prompt without invalidating it', () => {
    const context = cloneContext()
    const prompt = `${buildNewsBriefingPrompt(context, 'standard')}\n${'추가 확인 문장 '.repeat(5_000)}`
    const result = runValidation({ context, prompt })
    expect(codes(result)).toContain('PROMPT_TOO_LONG')
    expect(result.errors).toEqual([])
  })
  it('returns identical validation results for identical inputs', () => {
    expect(runValidation()).toEqual(runValidation())
  })
})
