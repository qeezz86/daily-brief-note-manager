const allowedTemplateClasses = new Set([
  'intro',
  'brief-meta',
  'summary-box',
  'update-label',
  'content-note',
  'content-meta',
  'series-id',
  'sentence-card',
  'chinese-sentence',
  'pinyin',
  'translation',
])

function normalizeClasses(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).join(' ')
}

function hasClosedFinalWrapperDiv(html: string) {
  let index = 0
  let divDepth = 0
  let sawDiv = false
  let rootCloseIndex = -1

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)
    if (tagStart === -1) break

    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4)
      if (commentEnd === -1) return false
      index = commentEnd + 3
      continue
    }

    let tagEnd = tagStart + 1
    let quote: '"' | "'" | null = null
    while (tagEnd < html.length) {
      const character = html[tagEnd]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
      tagEnd += 1
    }

    if (tagEnd >= html.length) return false

    const tag = html.slice(tagStart, tagEnd + 1)
    if (/^<div(?:\s|>|\/)/i.test(tag)) {
      sawDiv = true
      divDepth += 1
    } else if (/^<\/div(?:\s|>)/i.test(tag)) {
      if (divDepth === 0) return false
      divDepth -= 1
      if (divDepth === 0) rootCloseIndex = tagEnd + 1
    }

    index = tagEnd + 1
  }

  return sawDiv && divDepth === 0 && rootCloseIndex !== -1 && !html.slice(rootCloseIndex).trim()
}

function isJavascriptUrl(value: string) {
  const nullCharacter = String.fromCharCode(0)

  return value
    .split('')
    .filter((character) => character !== nullCharacter && character.trim() !== '')
    .join('')
    .toLocaleLowerCase('en-US')
    .startsWith('javascript:')
}

function collectElements(root: HTMLElement) {
  const elements: Element[] = [root]

  function visit(container: ParentNode) {
    for (const element of Array.from(container.children)) {
      elements.push(element)
      visit(element)
      if (element instanceof HTMLTemplateElement) {
        visit(element.content)
      }
    }
  }

  visit(root)
  return elements
}

export function validateWordPressHtml(
  htmlBody: string,
  expectedWrapperClass: string,
  imagePrompt = '',
): string[] {
  if (!htmlBody.trim()) return []

  const errors: string[] = []
  const normalizedHtml = htmlBody.trim()

  if (normalizedHtml.includes('```')) {
    errors.push('HTML 본문에 Markdown 코드 펜스가 포함되어 있습니다.')
  }

  if (!hasClosedFinalWrapperDiv(normalizedHtml)) {
    errors.push('마지막 wrapper div가 닫혀 있지 않습니다.')
  }

  if (
    /\[IMAGE_PROMPT(?:_JSON)?\]/i.test(htmlBody) ||
    htmlBody.includes('대표 이미지 프롬프트') ||
    (imagePrompt.trim() && htmlBody.includes(imagePrompt.trim()))
  ) {
    errors.push('대표 이미지 프롬프트는 WordPress HTML 밖에 입력해 주세요.')
  }

  const document = new DOMParser().parseFromString(htmlBody, 'text/html')
  const meaningfulTopLevelNodes = Array.from(document.body.childNodes).filter(
    (node) => node.nodeType === 1 || (node.nodeType === 3 && node.textContent?.trim()),
  )
  const root = meaningfulTopLevelNodes.length === 1
    ? meaningfulTopLevelNodes[0]
    : null

  if (!(root instanceof HTMLElement) || root.tagName !== 'DIV') {
    errors.push('최상위 wrapper가 없습니다.')
    return [...new Set(errors)]
  }

  const actualWrapperClass = normalizeClasses(root.className)
  const normalizedExpectedWrapper = normalizeClasses(expectedWrapperClass)
  if (actualWrapperClass !== normalizedExpectedWrapper) {
    errors.push('카테고리 wrapper class가 일치하지 않습니다.')
  }

  if (!root.querySelector('h1')) {
    errors.push('본문에 h1 태그가 없습니다.')
  }

  const elements = collectElements(root)

  if (elements.some((element) => element.tagName === 'SCRIPT')) {
    errors.push('허용되지 않은 script 태그가 포함되어 있습니다.')
  }

  if (elements.some((element) => element.tagName === 'IFRAME')) {
    errors.push('허용되지 않은 iframe 태그가 포함되어 있습니다.')
  }

  if (elements.some((element) => element.hasAttribute('style'))) {
    errors.push('inline style 속성은 사용할 수 없습니다.')
  }

  const seenIds = new Set<string>()
  let hasDuplicateId = false
  let hasInlineEventHandler = false
  let hasJavascriptUrl = false
  let hasUnknownClass = false
  const wrapperClasses = new Set(normalizedExpectedWrapper.split(' '))

  for (const element of elements) {
    if (element.id) {
      if (seenIds.has(element.id)) hasDuplicateId = true
      seenIds.add(element.id)
    }

    for (const className of element.classList) {
      if (!wrapperClasses.has(className) && !allowedTemplateClasses.has(className)) {
        hasUnknownClass = true
      }
    }

    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLocaleLowerCase('en-US').startsWith('on')) {
        hasInlineEventHandler = true
      }

      if (
        ['href', 'src', 'action'].includes(attribute.name.toLocaleLowerCase('en-US')) &&
        isJavascriptUrl(attribute.value)
      ) {
        hasJavascriptUrl = true
      }
    }
  }

  if (hasDuplicateId) {
    errors.push('중복된 HTML id가 포함되어 있습니다.')
  }
  if (hasInlineEventHandler) {
    errors.push('inline event handler는 사용할 수 없습니다.')
  }
  if (hasJavascriptUrl) {
    errors.push('javascript: URL은 사용할 수 없습니다.')
  }
  if (hasUnknownClass) {
    errors.push('등록되지 않은 class가 포함되어 있습니다.')
  }

  return [...new Set(errors)]
}
