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

  if (!normalizedHtml.toLocaleLowerCase('en-US').endsWith('</div>')) {
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

  if (root.querySelector('script')) {
    errors.push('허용되지 않은 script 태그가 포함되어 있습니다.')
  }

  if (root.querySelector('iframe')) {
    errors.push('허용되지 않은 iframe 태그가 포함되어 있습니다.')
  }

  if (root.querySelector('[style]')) {
    errors.push('inline style 속성은 사용할 수 없습니다.')
  }

  const seenIds = new Set<string>()
  let hasDuplicateId = false
  let hasInlineEventHandler = false
  let hasJavascriptUrl = false
  let hasUnknownClass = false
  const wrapperClasses = new Set(normalizedExpectedWrapper.split(' '))

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
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
        attribute.value.trim().toLocaleLowerCase('en-US').startsWith('javascript:')
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
