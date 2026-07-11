export const MAX_TAG_LENGTH = 80

export interface PublicationSourceInput {
  sourceName: string
  sourceTitle: string
  sourceUrl: string
  sourcePublishedAt: string
  checkedPoint: string
}

export function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function tagComparisonKey(value: string) {
  return normalizeTag(value).toLocaleLowerCase('ko-KR')
}

export function isBrandTag(value: string) {
  return tagComparisonKey(value).replace(/\s/g, '') === 'dailybriefnote'
}

export function normalizeSourceUrl(value: string) {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    url.hash = ''
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return trimmed
  }
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isOfficialCctvArticleUrl(value: string) {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLocaleLowerCase('en-US')
    const allowedHost = host === 'cctv.com' || host.endsWith('.cctv.com') ||
      host === 'cctv.cn' || host.endsWith('.cctv.cn')
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      allowedHost && url.pathname !== '/' && url.pathname !== ''
  } catch {
    return false
  }
}

export function isEmptySource(source: PublicationSourceInput) {
  return !source.sourceName.trim() && !source.sourceTitle.trim() &&
    !source.sourceUrl.trim() && !source.sourcePublishedAt.trim() &&
    !source.checkedPoint.trim()
}

export function sourceUrlWarning(value: string) {
  if (!isHttpUrl(value)) return null
  const url = new URL(value.trim())
  if (url.pathname === '/' || url.pathname === '') {
    return '루트 홈페이지로 보입니다. 가능하면 개별 원문 URL을 입력해 주세요.'
  }
  if (url.searchParams.has('q') || url.searchParams.has('query') || url.searchParams.has('search')) {
    return '검색 결과 URL로 보입니다. 가능하면 개별 원문 URL을 입력해 주세요.'
  }
  return null
}

export function validateHtmlSources(htmlBody: string, sources: PublicationSourceInput[]) {
  const document = new DOMParser().parseFromString(htmlBody, 'text/html')
  const section = document.querySelector('#sources')
  if (!section) return ['본문에 출처 섹션이 없습니다.']

  const hrefs = new Set(
    Array.from(section.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => normalizeSourceUrl(anchor.href)),
  )
  const missing = sources.some((source) => !hrefs.has(normalizeSourceUrl(source.sourceUrl)))
  return missing
    ? ['저장된 출처 URL이 WordPress HTML 출처 섹션에 없습니다.']
    : []
}
