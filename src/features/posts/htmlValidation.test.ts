import { describe, expect, it } from 'vitest'

import { validateWordPressHtml } from './htmlValidation'

const newsWrapper = 'daily-brief-note news-briefing economy'
const chineseWrapper = 'daily-brief-note chinese-study'

function newsHtml(content = '<h1>경제 브리핑</h1>') {
  return `<div class="${newsWrapper}">${content}</div>`
}

describe('validateWordPressHtml', () => {
  it('accepts configured news and Chinese study wrappers', () => {
    expect(validateWordPressHtml(newsHtml(), newsWrapper)).toEqual([])
    expect(
      validateWordPressHtml(
        `<div class="${chineseWrapper}"><h1>중국어 학습</h1></div>`,
        chineseWrapper,
      ),
    ).toEqual([])
  })

  it('rejects a missing top-level wrapper', () => {
    expect(validateWordPressHtml('<h1>제목</h1>', newsWrapper)).toContain(
      '최상위 wrapper가 없습니다.',
    )
  })

  it('rejects a wrapper that differs from the category setting', () => {
    expect(
      validateWordPressHtml(
        '<div class="daily-brief-note news-briefing global"><h1>제목</h1></div>',
        newsWrapper,
      ),
    ).toContain('카테고리 wrapper class가 일치하지 않습니다.')
  })

  it('rejects a missing h1', () => {
    expect(validateWordPressHtml(newsHtml('<p>본문</p>'), newsWrapper)).toContain(
      '본문에 h1 태그가 없습니다.',
    )
  })

  it('rejects a missing final wrapper close', () => {
    expect(
      validateWordPressHtml(`<div class="${newsWrapper}"><h1>제목</h1>`, newsWrapper),
    ).toContain('마지막 wrapper div가 닫혀 있지 않습니다.')
  })

  it('does not mistake a nested div close for the final wrapper close', () => {
    expect(
      validateWordPressHtml(
        `<div class="${newsWrapper}"><h1>제목</h1><div></div>`,
        newsWrapper,
      ),
    ).toContain('마지막 wrapper div가 닫혀 있지 않습니다.')
  })

  it('rejects Markdown fences, script, iframe, events, and javascript URLs', () => {
    const result = validateWordPressHtml(
      newsHtml(
        '<h1>제목</h1>```html<script>alert(1)</script><iframe></iframe><a onclick="run()" href="javascript:run()">링크</a>',
      ),
      newsWrapper,
    )

    expect(result).toEqual(expect.arrayContaining([
      'HTML 본문에 Markdown 코드 펜스가 포함되어 있습니다.',
      '허용되지 않은 script 태그가 포함되어 있습니다.',
      '허용되지 않은 iframe 태그가 포함되어 있습니다.',
      'inline event handler는 사용할 수 없습니다.',
      'javascript: URL은 사용할 수 없습니다.',
    ]))
  })

  it('rejects javascript URLs obfuscated with HTML whitespace', () => {
    expect(
      validateWordPressHtml(
        newsHtml('<h1>제목</h1><a href="java&#x0A;script:alert(1)">링크</a>'),
        newsWrapper,
      ),
    ).toContain('javascript: URL은 사용할 수 없습니다.')
  })

  it('rejects forbidden elements and handlers inside template content', () => {
    const result = validateWordPressHtml(
      newsHtml('<h1>제목</h1><template><script>alert(1)</script><a onclick="run()">링크</a></template>'),
      newsWrapper,
    )

    expect(result).toEqual(expect.arrayContaining([
      '허용되지 않은 script 태그가 포함되어 있습니다.',
      'inline event handler는 사용할 수 없습니다.',
    ]))
  })

  it('rejects inline styles, duplicate IDs, and unregistered classes', () => {
    const result = validateWordPressHtml(
      newsHtml('<h1 id="same">제목</h1><p id="same" class="unknown" style="color:red">본문</p>'),
      newsWrapper,
    )

    expect(result).toEqual(expect.arrayContaining([
      'inline style 속성은 사용할 수 없습니다.',
      '중복된 HTML id가 포함되어 있습니다.',
      '등록되지 않은 class가 포함되어 있습니다.',
    ]))
  })

  it('rejects image prompt markers and the entered prompt text', () => {
    expect(
      validateWordPressHtml(newsHtml('<h1>제목</h1><p>[IMAGE_PROMPT]</p>'), newsWrapper),
    ).toContain('대표 이미지 프롬프트는 WordPress HTML 밖에 입력해 주세요.')
    expect(
      validateWordPressHtml(newsHtml('<h1>제목</h1><p>고유 프롬프트</p>'), newsWrapper, '고유 프롬프트'),
    ).toContain('대표 이미지 프롬프트는 WordPress HTML 밖에 입력해 주세요.')
  })
})
