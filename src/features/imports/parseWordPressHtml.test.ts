import { describe, expect, it, vi } from 'vitest'
import { importCategories } from './imports.fixtures'
import { parseWordPressHtml } from './parseWordPressHtml'
import { WORDPRESS_HTML_MAX_INPUT_BYTES } from './wordPressHtmlImport.types'

const wrapper = 'daily-brief-note news-briefing economy'
const emptyChinese = {
  programName: '', originalTitle: '', originalUrl: '', originalPublishedAt: '', episodeListIncluded: null, verifiedCoreFact: '',
}

function economyHtml(body = '<h1>경제 브리핑</h1>') {
  return `<div class="${wrapper}">${body}</div>`
}

function codes(html: string) {
  return parseWordPressHtml(html, importCategories).issues.map((issue) => issue.code)
}

describe('parseWordPressHtml input and raw HTML contract', () => {
  it('blocks empty input without parsing', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    expect(codes('')).toContain('WORDPRESS_HTML_EMPTY')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it('accepts the exact 20 MiB UTF-8 boundary', () => {
    const base = economyHtml()
    const baseBytes = new TextEncoder().encode(base).byteLength
    const html = `${base}${' '.repeat(WORDPRESS_HTML_MAX_INPUT_BYTES - baseBytes)}`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.byteLength).toBe(WORDPRESS_HTML_MAX_INPUT_BYTES)
    expect(result.issues.map((issue) => issue.code)).not.toContain('WORDPRESS_HTML_TOO_LARGE')
  }, 20_000)

  it('blocks over 20 MiB before DOM parsing', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString')
    const result = parseWordPressHtml('a'.repeat(WORDPRESS_HTML_MAX_INPUT_BYTES + 1), importCategories)
    expect(result.issues.map((issue) => issue.code)).toContain('WORDPRESS_HTML_TOO_LARGE')
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it('preserves the original string byte-for-byte without DOM serialization', () => {
    const html = `<div id="first" class="${wrapper}" data-z="2" data-a="1">\r\n  <h1> 경제 브리핑 </h1>\r\n</div>\r\n`
    expect(parseWordPressHtml(html, importCategories).rawHtml).toBe(html)
  })

  it('is deterministic for the same input and runtime categories', () => {
    const html = economyHtml('<h1>경제 브리핑</h1><p class="intro">요약</p>')
    expect(parseWordPressHtml(html, importCategories)).toEqual(parseWordPressHtml(html, importCategories))
  })
})

describe('parseWordPressHtml detection and ambiguity', () => {
  it('detects the supported wrapper from runtime category configuration', () => {
    const result = parseWordPressHtml(economyHtml(), importCategories)
    expect(result.categoryMatches.map((category) => category.id)).toEqual(['economy'])
    expect(result.wrapperClasses).toEqual([wrapper])
  })

  it('blocks an unknown wrapper and does not auto-register it', () => {
    const result = parseWordPressHtml('<div class="daily-brief-note unknown"><h1>제목</h1></div>', importCategories)
    expect(result.categoryMatches).toEqual([])
    expect(result.issues.map((issue) => issue.code)).toContain('WORDPRESS_CATEGORY_UNKNOWN')
  })

  it('reports multiple wrapper and runtime category ambiguity', () => {
    const html = `${economyHtml()}<div class="daily-brief-note ai-column"><h1>AI</h1></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.categoryMatches.map((category) => category.id)).toEqual(['economy', 'ai-column'])
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['WORDPRESS_WRAPPER_AMBIGUOUS', 'WORDPRESS_CATEGORY_AMBIGUOUS', 'WORDPRESS_TITLE_AMBIGUOUS']))
  })

  it('reports missing and conflicting h1 candidates', () => {
    expect(codes(economyHtml('<p>본문</p>'))).toContain('WORDPRESS_TITLE_MISSING')
    expect(codes(economyHtml('<h1>첫 제목</h1><h1>둘째 제목</h1>'))).toContain('WORDPRESS_TITLE_AMBIGUOUS')
  })

  it('reports persistence-significant date, display ID, series, slug, URL, and source ambiguity', () => {
    const html = economyHtml(`
      <h1>중국어 #1</h1><h1>중국어 #2</h1>
      <p class="brief-meta">2026-08-01 2026-08-02 #2026-08-01-ECO #2026-08-02-ECO</p>
      <i data-slug="first-slug"></i><i data-slug="second-slug"></i>
      <link rel="canonical" href="https://example.com/first-slug">
      <link rel="canonical" href="https://example.com/second-slug">
      <section id="sources"><p><a href="https://source.test/a">첫 제목</a></p><p><a href="https://source.test/a">둘째 제목</a></p></section>
    `)
    expect(codes(html)).toEqual(expect.arrayContaining([
      'WORDPRESS_DATE_AMBIGUOUS', 'WORDPRESS_DISPLAY_ID_AMBIGUOUS', 'WORDPRESS_SERIES_NO_AMBIGUOUS',
      'WORDPRESS_SLUG_AMBIGUOUS', 'WORDPRESS_URL_AMBIGUOUS', 'SOURCE_CANDIDATE_AMBIGUOUS',
    ]))
  })
})

describe('parseWordPressHtml structural extraction', () => {
  it('extracts intro, summary-box, brief metadata, sources, links, and notes', () => {
    const result = parseWordPressHtml(economyHtml(`
      <h1>경제 브리핑</h1><p class="intro">공통 요약</p><p class="summary-box">공통 요약</p>
      <p class="brief-meta">2026-08-09 #2026-08-09-ECO</p>
      <link rel="canonical" href="https://example.com/economy-briefing-2026-08-09">
      <section id="sources"><p><a href="https://source.test/article">원문 제목</a> 확인 포인트</p></section>
      <p class="previous-content"><a href="https://example.com/previous">이전 글</a></p>
      <p class="content-note">고정 안내</p>
    `), importCategories)
    expect(result.summary.value).toBe('공통 요약')
    expect(result.publishedOn.value).toBe('2026-08-09')
    expect(result.displayId.value).toBe('#2026-08-09-ECO')
    expect(result.slug.value).toBe('economy-briefing-2026-08-09')
    expect(result.sources).toEqual([expect.objectContaining({ sourceUrl: 'https://source.test/article', sourceTitle: '원문 제목' })])
    expect(result.previousContentLinks).toEqual(['https://example.com/previous'])
    expect(result.contentNotes).toEqual(['고정 안내'])
  })

  it('extracts news issue structure, update labels, change log, and watch points', () => {
    const result = parseWordPressHtml(economyHtml(`
      <h1>경제 브리핑</h1>
      <section id="issue-1"><h2>금리</h2><span class="update-label">신규</span>
        <h3>무엇이 있었나</h3><p>사실</p><h3>왜 중요한가</h3><p>중요</p>
        <h3>우리에게 미치는 영향</h3><p>영향</p><h3>앞으로 볼 포인트</h3><p>후속</p>
      </section><section id="change-log">변경 기록</section><section id="watch-points">관찰 지점</section>
    `), importCategories)
    expect(result.newsIssues).toEqual([expect.objectContaining({ id: 'issue-1', heading: '금리', whatHappened: '사실', whyImportant: '중요', impact: '영향', watchPoint: '후속', updateLabel: '신규' })])
    expect(result.changeLog).toContain('변경 기록')
    expect(result.watchPoints).toContain('관찰 지점')
  })

  it('keeps Chinese metadata inactive for a confirmed non-Chinese document with multiple anchors', () => {
    const result = parseWordPressHtml(economyHtml(`
      <h1>경제 브리핑</h1>
      <a href="https://example.com/previous">이전 브리핑</a>
      <a href="https://source.test/article">출처</a>
      <a href="https://example.com/internal">내부 링크</a>
      <a href="https://external.test/other">외부 링크</a>
    `), importCategories)
    expect(result.chinese).toEqual(emptyChinese)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS' }))
  })

  it('does not activate Chinese extraction for an ordinary non-Chinese sources section', () => {
    const result = parseWordPressHtml(economyHtml(`
      <h1>경제 브리핑</h1><section id="sources">
        <a href="https://source.test/one">첫 번째 출처</a>
        <a href="https://source.test/two">두 번째 출처</a>
      </section>
    `), importCategories)
    expect(result.chinese).toEqual(emptyChinese)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ path: 'metadata.originalUrl' }))
  })

  it('lets a confirmed non-Chinese category win over recognized source-check labels', () => {
    const result = parseWordPressHtml(economyHtml(`
      <h1>경제 브리핑</h1><section id="source-check"><table><tbody>
        <tr><th>프로그램명</th><td>新闻联播</td></tr>
        <tr><th>원문 URL</th><td><a href="https://news.cctv.com/one">one</a><a href="https://news.cctv.com/two">two</a></td></tr>
      </tbody></table></section>
    `), importCategories)
    expect(result.chinese).toEqual(emptyChinese)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS' }))
  })

  it('extracts a Chinese title series number with the canonical project #source-check labels', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #37</h1><section id="source-check"><table><tbody>
      <tr><th>프로그램명</th><td>新闻联播</td></tr><tr><th>원문 제목</th><td>测试标题</td></tr>
      <tr><th>개별 원문</th><td><a href="https://news.cctv.com/2026/a.shtml">CCTV 원문</a></td></tr>
      <tr><th>게시·업데이트 시간</th><td>2026-08-09T12:00:00+08:00</td></tr>
      <tr><th>본편 목록 포함 여부</th><td>예</td></tr><tr><th>확인한 핵심 내용</th><td>핵심 확인</td></tr>
    </tbody></table></section></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.seriesNo.value).toBe(37)
    expect(result.chinese).toEqual({
      programName: '新闻联播', originalTitle: '测试标题', originalUrl: 'https://news.cctv.com/2026/a.shtml',
      originalPublishedAt: '2026-08-09T04:00:00.000Z', episodeListIncluded: true, verifiedCoreFact: '핵심 확인',
    })
  })

  it('collects conflicting candidates from multiple aliases without selecting by alias priority', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #38</h1><section id="source-check"><table><tbody>
      <tr><th>프로그램명</th><td>新闻联播</td></tr><tr><th>프로그램</th><td>朝闻天下</td></tr>
    </tbody></table></section></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.programName).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: 'metadata.programName',
    }))
  })

  it('collects structured and textual fallback candidates and deduplicates trim-only equivalents', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #39</h1><section id="source-check"><table><tbody>
      <tr><th>원문 제목</th><td>동일 제목</td></tr>
      <tr><th>본편 목록 포함</th><td>예</td></tr><tr><th>본편 목록 포함</th><td>true</td></tr>
    </tbody></table></section>
원문 제목:   동일 제목${'  '}
</div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.originalTitle).toBe('동일 제목')
    expect(result.chinese.episodeListIncluded).toBe(true)
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS' }))
  })

  it.each([
    ['originalTitle', '<tr><th>원문 제목</th><td>  동일 제목  </td></tr>', '<tr><th>CCTV 원문 제목</th><td>동일 제목</td></tr>', '동일 제목'],
    ['originalUrl', '<tr><th>원문 URL</th><td><a href="https://news.cctv.com/2026/same.shtml#detail">A</a></td></tr>', '<tr><th>개별 원문 URL</th><td><a href="https://news.cctv.com/2026/same.shtml">B</a></td></tr>', 'https://news.cctv.com/2026/same.shtml'],
  ] as const)('selects a deterministic canonical %s representative for equivalent candidate permutations', (field, first, second, expected) => {
    const parseRows = (rows: string) => parseWordPressHtml(`<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #46</h1>
      <section id="source-check"><table><tbody>${rows}</tbody></table></section></div>`, importCategories)
    const forward = parseRows(first + second)
    const reverse = parseRows(second + first)
    expect(forward.chinese[field]).toBe(expected)
    expect(reverse.chinese[field]).toBe(expected)
    expect(forward.issues.filter((issue) => issue.code.startsWith('CHINESE_')))
      .toEqual(reverse.issues.filter((issue) => issue.code.startsWith('CHINESE_')))
  })

  it('keeps internal whitespace materially distinct for factual text candidates', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #40</h1><section id="source-check"><table><tbody>
      <tr><th>프로그램명</th><td>프로그램 이름</td></tr>
    </tbody></table></section>
프로그램명: 프로그램  이름
</div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.programName).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: 'metadata.programName',
    }))
  })

  it('blocks a structured and fallback conflict without a persistence-ready value', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #41</h1><section id="source-check"><table><tbody>
      <tr><th>원문 제목</th><td>구조화 제목</td></tr>
    </tbody></table></section>
원문 제목: fallback 제목
</div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.originalTitle).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: 'metadata.originalTitle',
    }))
  })

  it.each([
    ['programName', '프로그램명', '뉴스 A', '프로그램: 뉴스 B', ''],
    ['originalTitle', '원문 제목', '제목 A', 'CCTV 원문 제목: 제목 B', ''],
    ['originalUrl', '원문 URL', '<a href="https://news.cctv.com/a">A</a>', '개별 기사·영상 URL: https://news.cctv.com/b', ''],
    ['originalPublishedAt', '게시·업데이트 시간', '2026-08-09T12:00:00+08:00', '방송일·게시일·업데이트 시간: 2026-08-09T13:00:00+08:00', ''],
    ['episodeListIncluded', '본편 목록 포함', '예', '본편 목록 포함 여부: 아니오', null],
    ['verifiedCoreFact', '확인한 핵심 내용', '사실 A', '확인한 핵심 사실: 사실 B', ''],
  ] as const)('uses exhaustive ambiguity handling for %s', (field, structuredLabel, structuredValue, fallbackLine, emptyValue) => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #42</h1><section id="source-check"><table><tbody>
      <tr><th>${structuredLabel}</th><td>${structuredValue}</td></tr>
    </tbody></table>
${fallbackLine}
</section>
</div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese[field]).toBe(emptyValue)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: `metadata.${field}`,
    }))
  })

  it('selects the canonical timestamp independently of equivalent candidate order', () => {
    const first = '<tr><th>게시·업데이트 시간</th><td>2026-08-09T12:00:00+08:00</td></tr>'
    const second = '<tr><th>원문 게시 시각</th><td>2026-08-09T04:00:00Z</td></tr>'
    const parseRows = (rows: string) => parseWordPressHtml(`<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #43</h1>
      <section id="source-check"><table><tbody>${rows}</tbody></table></section></div>`, importCategories)
    const forward = parseRows(first + second)
    const reverse = parseRows(second + first)
    expect(forward.chinese.originalPublishedAt).toBe('2026-08-09T04:00:00.000Z')
    expect(reverse.chinese.originalPublishedAt).toBe(forward.chinese.originalPublishedAt)
    expect(forward.issues.filter((issue) => issue.code.startsWith('CHINESE_')))
      .toEqual(reverse.issues.filter((issue) => issue.code.startsWith('CHINESE_')))
    expect(forward.issues).not.toContainEqual(expect.objectContaining({ path: 'metadata.originalPublishedAt' }))
  })

  it('does not guess a Chinese original URL from unrelated anchors without source-check', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #47</h1>
프로그램명: 新闻联播
      <a href="https://example.com/previous">이전 글</a>
      <a href="https://source.test/article">일반 출처</a>
    </div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.programName).toBe('新闻联播')
    expect(result.chinese.originalUrl).toBe('')
    expect(result.issues).not.toContainEqual(expect.objectContaining({ path: 'metadata.originalUrl' }))
  })

  it('extracts a URL associated with a recognized label in authoritative source-check', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #48</h1><section id="source-check"><dl>
      <dt>CCTV 개별 원문 URL</dt><dd><a href="https://news.cctv.com/2026/authoritative.shtml#video">CCTV 원문</a></dd>
    </dl></section><a href="https://example.com/unrelated">무관한 링크</a></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.originalUrl).toBe('https://news.cctv.com/2026/authoritative.shtml')
    expect(result.issues).not.toContainEqual(expect.objectContaining({ path: 'metadata.originalUrl' }))
  })

  it('keeps Chinese extraction inactive when category is unresolved, even with authoritative labels', () => {
    const html = `<div class="daily-brief-note unknown"><h1>미확정 #49</h1><section id="source-check"><table><tbody>
      <tr><th>프로그램명</th><td>新闻联播</td></tr>
      <tr><th>원문 URL</th><td><a href="https://news.cctv.com/2026/unresolved.shtml">CCTV 원문</a></td></tr>
    </tbody></table></section><a href="https://example.com/unrelated">무관한 링크</a></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.categoryMatches).toEqual([])
    expect(result.chinese).toEqual(emptyChinese)
    expect(result.issues.map((issue) => issue.code)).toContain('WORDPRESS_CATEGORY_UNKNOWN')
    expect(result.issues).not.toContainEqual(expect.objectContaining({ code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS' }))
  })

  it('blocks conflicting original URLs and removes their persistence value', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #44</h1><section id="source-check"><table><tbody>
      <tr><th>원문 URL</th><td><a href="https://news.cctv.com/2026/a.shtml#detail">A</a><a href="https://news.cctv.com/2026/b.shtml">B</a></td></tr>
    </tbody></table></section></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.originalUrl).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: 'metadata.originalUrl',
    }))
  })

  it('blocks conflicting Chinese published or update timestamps', () => {
    const html = `<div class="daily-brief-note chinese-study"><h1>CCTV 중국어 #45</h1><section id="source-check"><dl>
      <dt>원문 게시 시각</dt><dd>2026-08-09T12:00:00+08:00</dd>
      <dt>원문 게시 시각</dt><dd>2026-08-09T13:00:00+08:00</dd>
    </dl></section></div>`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.chinese.originalPublishedAt).toBe('')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'CHINESE_SOURCE_VALUE_AMBIGUOUS', severity: 'error', path: 'metadata.originalPublishedAt',
    }))
  })
})

describe('parseWordPressHtml inert security inspection', () => {
  it.each([
    ['<script>window.__wordpressExecuted = true</script>', 'HTML_SCRIPT_NOT_ALLOWED'],
    ['<iframe src="https://example.com"></iframe>', 'HTML_IFRAME_NOT_ALLOWED'],
    ['<button onclick="window.__wordpressExecuted = true">x</button>', 'HTML_EVENT_HANDLER_NOT_ALLOWED'],
    ['<a href=" javascript:alert(1)">x</a>', 'HTML_JAVASCRIPT_URL_NOT_ALLOWED'],
  ])('detects unsafe markup without mounting or executing it', (markup, code) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    Reflect.deleteProperty(window, '__wordpressExecuted')
    expect(codes(economyHtml(`<h1>경제</h1>${markup}`))).toContain(code)
    expect(Reflect.get(window, '__wordpressExecuted')).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    expect(document.querySelector('iframe, script, [onclick]')).toBeNull()
    fetch.mockRestore()
  })

  it('emits legacy-review warnings for inline style and unknown classes', () => {
    expect(codes(economyHtml('<h1 style="color:red" class="historical-class">경제</h1>'))).toEqual(expect.arrayContaining(['HTML_INLINE_STYLE', 'HTML_UNKNOWN_CLASS']))
  })

  it('uses DOMParser recovery but still returns the untouched source', () => {
    const html = `<div class="${wrapper}"><h1>복구된 제목`
    const result = parseWordPressHtml(html, importCategories)
    expect(result.title.value).toBe('복구된 제목')
    expect(result.rawHtml).toBe(html)
  })
})
