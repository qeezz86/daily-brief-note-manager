import { describe, expect, it } from 'vitest'
import { buildNewsBriefingPrompt } from './buildBriefingPrompt'
import { briefingPromptContextFixture as context } from './briefingPrompts.fixtures'

describe('buildNewsBriefingPrompt', () => {
  it('uses explicit prompt boundary markers', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value.startsWith('[BEGIN_DAILY_BRIEF_NOTE_PROMPT]')).toBe(true); expect(value.endsWith('[END_DAILY_BRIEF_NOTE_PROMPT]')).toBe(true) })
  it('uses category settings to generate identifiers', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('브리핑 ID: #2026-07-13-ECO'); expect(value).toContain('URL 슬러그: economy-briefing-2026-07-13'); expect(value).toContain(context.category.wrapperClass) })
  it('includes recent briefing updates', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('최근 경제 브리핑'); expect(value).toContain('기준금리 후속 발표') })
  it('includes open topics in standard mode', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('[현재 추적 주제]'))
  it('includes pending followups', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('한국은행 의결문 확인'); expect(value).toContain('마감 초과') })
  it('includes recent closed topics', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('종료된 정책'))
  it('includes repeat exclusion guidance', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('완전히 동일한 내용'))
  it('includes pending followup guidance', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('pending 후속 확인 항목'))
  it('includes closed-topic repeat prevention', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('실질적 변화가 확인되지 않는 한 다시 포함하지 않는다'))
  it('keeps simple mode concise', () => { const value = buildNewsBriefingPrompt(context, 'simple'); expect(value).not.toContain('[현재 추적 주제]'); expect(value).not.toContain('중요성:') })
  it('includes standard tracking without detailed summaries', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('[현재 추적 주제]'); expect(value).not.toContain('중요성:') })
  it('adds detailed importance, impact and change summaries', () => { const value = buildNewsBriefingPrompt(context, 'detailed'); expect(value).toContain('중요성:'); expect(value).toContain('영향:'); expect(value).toContain('변화:') })
  it('prints explicit empty states without null text', () => { const empty = { ...context, recentPosts: [], openTopics: [], pendingFollowups: [], recentClosedTopics: [], counts: { recentPosts: 0, recentUpdates: 0, openTopics: 0, pendingFollowups: 0, overdueFollowups: 0, recentClosedTopics: 0 } }; const value = buildNewsBriefingPrompt(empty, 'standard'); expect(value).toContain('최근 게시물 없음'); expect(value).toContain('현재 추적 중 주제 없음'); expect(value).toContain('미완료 후속 확인 없음'); expect(value).toContain('조회 기간 내 종료 주제 없음'); expect(value).not.toContain('undefined') })
  it('returns identical text for identical inputs', () => expect(buildNewsBriefingPrompt(context, 'detailed')).toBe(buildNewsBriefingPrompt(context, 'detailed')))
  it('does not include UUID references', () => expect(buildNewsBriefingPrompt(context, 'detailed')).not.toContain(context.recentPosts[0].id))
  it('does not include WordPress bodies or image prompts', () => { const value = buildNewsBriefingPrompt(context, 'detailed'); expect(value).not.toContain('html_body'); expect(value).not.toContain('image_prompt') })
})
