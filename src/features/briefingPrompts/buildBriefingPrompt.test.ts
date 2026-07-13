import { describe, expect, it } from 'vitest'
import { buildNewsBriefingPrompt } from './buildBriefingPrompt'
import { briefingPromptContextFixture as context } from './briefingPrompts.fixtures'

describe('buildNewsBriefingPrompt', () => {
  it('uses explicit prompt boundary markers', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value.startsWith('[BEGIN_DAILY_BRIEF_NOTE_PROMPT]')).toBe(true); expect(value.endsWith('[END_DAILY_BRIEF_NOTE_PROMPT]')).toBe(true) })
  it('includes the prompt template version and selected template name', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('프롬프트 템플릿 버전: 1'); expect(value).toContain('경제 브리핑 작성 템플릿') })
  it('uses category settings to generate identifiers', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('브리핑 ID: #2026-07-13-ECO'); expect(value).toContain('URL 슬러그: economy-briefing-2026-07-13'); expect(value).toContain(context.category.wrapperClass) })
  it.each([
    [{ id: 'economy', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD' }, '한국은행', '확정치·잠정치·전망'],
    [{ id: 'global', name: '국제', code: 'GLO', wrapperClass: 'daily-brief-note news-briefing global', displayIdPattern: '#YYYY-MM-DD-GLO', slugPattern: 'global-briefing-YYYY-MM-DD' }, '국제기구', '공식 입장, 분석, 전망'],
    [{ id: 'technology', name: '과학기술', code: 'TEC', wrapperClass: 'daily-brief-note news-briefing technology', displayIdPattern: '#YYYY-MM-DD-TEC', slugPattern: 'technology-briefing-YYYY-MM-DD' }, '연구 논문과 학술지', '연구 단계, 시험·실증 단계'],
    [{ id: 'society', name: '사회', code: 'SOC', wrapperClass: 'daily-brief-note news-briefing society', displayIdPattern: '#YYYY-MM-DD-SOC', slugPattern: 'society-briefing-YYYY-MM-DD' }, '경찰·소방', '최신 공식 발표'],
    [{ id: 'climate-energy', name: '환경·에너지', code: 'ENV', wrapperClass: 'daily-brief-note news-briefing climate-energy', displayIdPattern: '#YYYY-MM-DD-ENV', slugPattern: 'climate-energy-briefing-YYYY-MM-DD' }, '국제에너지기구(IEA)', '인과관계를 근거 없이 과장하지 않는다'],
  ] as const)('applies $0.name category research and source rules', (category, source, instruction) => {
    const value = buildNewsBriefingPrompt({ ...context, category: { ...category } }, 'standard')
    expect(value).toContain(source)
    expect(value).toContain(instruction)
    expect(value).toContain(category.wrapperClass)
  })
  it('includes recent briefing updates', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('최근 경제 브리핑'); expect(value).toContain('기준금리 후속 발표') })
  it('includes open topics in standard mode', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('[현재 추적 주제]'))
  it('includes pending followups', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('한국은행 의결문 확인'); expect(value).toContain('마감 초과') })
  it('includes recent closed topics', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('종료된 정책'))
  it('includes repeat exclusion guidance', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('완전히 동일한 내용'))
  it('includes pending followup guidance', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('pending 후속 확인 항목'))
  it('includes closed-topic repeat prevention', () => expect(buildNewsBriefingPrompt(context, 'standard')).toContain('실질적 변화가 확인되지 않는 한 다시 포함하지 않는다'))
  it('keeps the ten required output items in order', () => {
    const value = buildNewsBriefingPrompt(context, 'standard')
    const labels = ['1. SEO 입력용 대표 제목', '2. SEO 대안 제목 4개', '3. 메타 설명', '4. URL 슬러그', '5. 포커스 키워드', '6. SEO 태그 5~8개', '7. 워드프레스 본문용 HTML', '8. 대표 이미지 프롬프트', '9. 이미지 ALT 문구', '10. 발행 전 체크리스트']
    expect(labels.map((label) => value.indexOf(label))).toEqual([...labels].map((_label, index, values) => value.indexOf(values[index])).sort((a, b) => a - b))
  })
  it('includes SEO tag and metadata rules', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('120~160자'); expect(value).toContain('태그는 5~8개만'); expect(value).toContain('DailyBriefNote') })
  it('includes complete and safe HTML requirements', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('HTML 내부에 h1'); expect(value).toContain('마지막 </div>'); expect(value).toContain('inline style, script, iframe, 중복 id'); expect(value).toContain('하나의 연속된 ```html 코드블록') })
  it('keeps sources, previous briefing and content note in order', () => { const value = buildNewsBriefingPrompt(context, 'standard'); const footer = value.slice(value.indexOf('[하단 섹션 순서]')); expect(footer.indexOf('출처 및 참고자료')).toBeLessThan(footer.indexOf('이전 경제 브리핑')); expect(footer.indexOf('이전 경제 브리핑')).toBeLessThan(footer.indexOf('content-note')); expect(footer).toContain('Writer by <strong>Daily Brief Note</strong>') })
  it('includes copyright and independent rewriting rules', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('기사 전문'); expect(value).toContain('해외 기사 전체 직역'); expect(value).toContain('표·도표 복제') })
  it('includes image prompt and ALT rules', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('16:9, 1200×675px'); expect(value).toContain('로고, 워터마크'); expect(value).toContain('ALT 문구') })
  it('keeps simple mode concise', () => { const value = buildNewsBriefingPrompt(context, 'simple'); expect(value).not.toContain('[현재 추적 주제]'); expect(value).not.toContain('중요성:') })
  it('keeps category and mandatory output rules in simple mode', () => { const value = buildNewsBriefingPrompt(context, 'simple'); expect(value).toContain('[카테고리 조사 범위]'); expect(value).toContain('[WordPress HTML 필수 규칙]'); expect(value).toContain('[하단 섹션 순서]'); expect(value).not.toContain('[카테고리 출처 우선순위]') })
  it('includes standard tracking without detailed summaries', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('[현재 추적 주제]'); expect(value).not.toContain('중요성:') })
  it('adds source priorities and HTML source format in standard mode', () => { const value = buildNewsBriefingPrompt(context, 'standard'); expect(value).toContain('[카테고리 출처 우선순위]'); expect(value).toContain('[출처 HTML 형식]'); expect(value).not.toContain('[상세 사실 검증 체크리스트]') })
  it('adds detailed importance, impact and change summaries', () => { const value = buildNewsBriefingPrompt(context, 'detailed'); expect(value).toContain('중요성:'); expect(value).toContain('영향:'); expect(value).toContain('변화:') })
  it('adds category-specific detailed verification', () => { const value = buildNewsBriefingPrompt(context, 'detailed'); expect(value).toContain('[상세 사실 검증 체크리스트]'); expect(value).toContain('계절조정 여부'); expect(value).toContain('발행 전 체크리스트') })
  it('prints explicit empty states without null text', () => { const empty = { ...context, recentPosts: [], openTopics: [], pendingFollowups: [], recentClosedTopics: [], counts: { recentPosts: 0, recentUpdates: 0, openTopics: 0, pendingFollowups: 0, overdueFollowups: 0, recentClosedTopics: 0 } }; const value = buildNewsBriefingPrompt(empty, 'standard'); expect(value).toContain('최근 게시물 없음'); expect(value).toContain('현재 추적 중 주제 없음'); expect(value).toContain('미완료 후속 확인 없음'); expect(value).toContain('조회 기간 내 종료 주제 없음'); expect(value).not.toContain('undefined') })
  it('returns identical text for identical inputs', () => expect(buildNewsBriefingPrompt(context, 'detailed')).toBe(buildNewsBriefingPrompt(context, 'detailed')))
  it('does not include UUID references', () => expect(buildNewsBriefingPrompt(context, 'detailed')).not.toContain(context.recentPosts[0].id))
  it('rejects unsupported categories', () => expect(() => buildNewsBriefingPrompt({ ...context, category: { ...context.category, id: 'unknown' } }, 'standard')).toThrow('지원하지 않는 뉴스 카테고리'))
  it('rejects missing or unsupported prompt template versions', () => {
    expect(() => buildNewsBriefingPrompt({ ...context, promptTemplateVersion: undefined }, 'standard')).toThrow('지원하지 않는 프롬프트 템플릿 버전')
    expect(() => buildNewsBriefingPrompt({ ...context, promptTemplateVersion: 2 }, 'standard')).toThrow('지원하지 않는 프롬프트 템플릿 버전')
  })
  it('does not include WordPress bodies or image prompts', () => { const value = buildNewsBriefingPrompt(context, 'detailed'); expect(value).not.toContain('html_body'); expect(value).not.toContain('image_prompt') })
})
