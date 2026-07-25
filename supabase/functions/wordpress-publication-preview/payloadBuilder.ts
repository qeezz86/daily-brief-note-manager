import { canonicalJson, sha256, uniqueSortedIntegers } from './normalization.ts'
import { findSeoTagComparisons } from './seoTagComparison.ts'
import type { PlanIssue, PublicationPayload, SourceContent } from './schemas.ts'

export const MAX_CONTENT_BYTES = 1_500_000
export const MAX_PAYLOAD_BYTES = 2_000_000

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

function structuralHtmlIssues(html: string, wrapper: string) {
  const issues: PlanIssue[] = []
  if (!html.trim()) return [{ code: 'HTML_MISSING', message: 'WordPress HTML 본문이 없습니다.' }]
  if (html.includes('```') || /^\s{0,3}(?:#{1,6}\s|[-*+]\s|>\s)/m.test(html)) issues.push({ code: 'HTML_INVALID', message: 'HTML 본문에 Markdown 문법이 혼합되어 있습니다.' })
  const h1Count = (html.match(/<h1(?:\s[^>]*)?>/gi) ?? []).length
  if (h1Count !== 1) issues.push({ code: 'H1_INVALID', message: 'WordPress HTML에는 h1이 정확히 하나 있어야 합니다.' })
  const root = /^\s*<div\s+class=(['"])([^'"]+)\1[^>]*>/i.exec(html)
  if (!root || root[2].trim().replace(/\s+/g, ' ') !== wrapper.trim().replace(/\s+/g, ' ')) issues.push({ code: 'WRAPPER_INVALID', message: '카테고리 wrapper가 일치하지 않습니다.' })
  if (/<\s*(script|iframe|object|embed|form|input|button)(?:\s|>)/i.test(html) || /\son[a-z0-9_-]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) issues.push({ code: 'HTML_INVALID', message: '실행 또는 입력 요소가 포함된 위험한 HTML입니다.' })
  if (/\sstyle\s*=/i.test(html)) issues.push({ code: 'HTML_INVALID', message: 'inline style은 publication payload에 허용되지 않습니다.' })
  if (/\[IMAGE_PROMPT(?:_JSON)?\]|대표 이미지 프롬프트/i.test(html)) issues.push({ code: 'HTML_INVALID', message: '이미지 프롬프트가 WordPress 본문에 포함되어 있습니다.' })
  if (/\[(SEO|CONTENT_META)(?:_JSON)?\]/i.test(html)) issues.push({ code: 'HTML_INVALID', message: 'SEO 또는 콘텐츠 입력 section이 WordPress 본문에 포함되어 있습니다.' })

  const stack: string[] = []
  const tokenPattern = /<!--[^]*?-->|<![^>]*>|<\/?([a-z][a-z0-9-]*)(?:\s[^<>]*?)?\s*\/?>/gi
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(html))) {
    const token = match[0]
    const tag = match[1]?.toLowerCase()
    if (!tag || token.startsWith('<!--') || token.startsWith('<!') || voidTags.has(tag) || /\/>$/.test(token)) continue
    if (/^<\//.test(token)) {
      if (stack.pop() !== tag) { issues.push({ code: 'HTML_INVALID', message: 'HTML 태그 중첩 또는 닫힘이 올바르지 않습니다.' }); break }
    } else stack.push(tag)
  }
  if (stack.length) issues.push({ code: 'HTML_INVALID', message: '닫히지 않은 HTML 태그가 있습니다.' })
  return issues
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function sourceHtmlIssues(html: string, sources: SourceContent['sources']): PlanIssue[] {
  const values = sources ?? []
  if (!values.length) return [{ code: 'SOURCE_MISSING', message: '출처 레코드가 없습니다.' }]

  const urls: string[] = []
  for (const source of values) {
    if (!source.name.trim() || !source.title.trim() || !source.url.trim() || !source.checkedPoint.trim()) {
      return [{ code: 'SOURCE_INVALID', message: '출처 필수 필드가 완성되지 않았습니다.' }]
    }
    let parsed: URL
    try { parsed = new URL(source.url.trim()) } catch {
      return [{ code: 'SOURCE_INVALID', message: '출처 URL 형식이 올바르지 않습니다.' }]
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return [{ code: 'SOURCE_INVALID', message: '출처 URL은 credential 없는 HTTP 또는 HTTPS URL이어야 합니다.' }]
    }
    urls.push(parsed.href)
  }
  if (new Set(urls).size !== urls.length) {
    return [{ code: 'SOURCE_INVALID', message: '중복된 출처 URL이 있습니다.' }]
  }

  const sections = [...html.matchAll(/<section\b[^>]*\sid\s*=\s*(['"])sources\1[^>]*>([\s\S]*?)<\/section>/gi)]
  const sourceIdCount = (html.match(/\sid\s*=\s*(['"])sources\1/gi) ?? []).length
  if (sections.length !== 1 || sourceIdCount !== 1) {
    return [{ code: 'SOURCE_SECTION_INVALID', message: 'HTML에는 section#sources가 정확히 하나 있어야 합니다.' }]
  }

  const hrefs = [...sections[0][2].matchAll(/<a\b[^>]*\shref\s*=\s*(['"])(.*?)\1[^>]*>/gi)]
    .map((match) => decodeHtmlAttribute(match[2].trim()))
    .map((value) => {
      try { return new URL(value).href } catch { return value }
    })
  const missing = urls.filter((url) => !hrefs.includes(url))
  return missing.length
    ? [{ code: 'SOURCE_HTML_MISMATCH', message: '저장된 출처 URL이 HTML 출처 섹션에 없습니다.', detail: `${missing.length}개 URL 불일치` }]
    : []
}

function expectedSlug(content: SourceContent): string {
  return content.slugPattern
    .replace('YYYY-MM-DD', content.briefingDate ?? content.publishedOn ?? '')
    .replace('###', String(content.seriesNo ?? 0).padStart(Math.max(3, String(content.seriesNo ?? 0).length), '0'))
}

export async function buildPayload(content: SourceContent, categoryIds: number[], tagIds: number[]) {
  const blockers: PlanIssue[] = []
  const warnings: PlanIssue[] = []
  const title = content.representativeTitle?.trim() ?? ''
  const html = content.htmlBody ?? ''
  if (content.contentStatus !== 'ready') blockers.push({ code: 'CONTENT_NOT_READY', message: '발행 준비 상태의 콘텐츠만 WordPress 초안을 만들 수 있습니다.' })
  if (!title) blockers.push({ code: 'TITLE_MISSING', message: 'SEO 대표 제목이 없습니다.' })
  blockers.push(...structuralHtmlIssues(html, content.wrapperClass))
  blockers.push(...sourceHtmlIssues(html, content.sources))
  if (!content.slug || content.slug !== expectedSlug(content)) blockers.push({ code: 'SLUG_INVALID', message: '현재 카테고리 설정과 slug가 일치하지 않습니다.' })
  if (!content.metaDescription.trim()) blockers.push({ code: 'SEO_META_MISSING', message: '메타 설명이 없습니다.' })
  if (content.tags.length < 5 || content.tags.length > 8) blockers.push({ code: 'SEO_TAG_COUNT_INVALID', message: 'SEO 태그는 5~8개여야 합니다.' })
  const tagKeys = content.tags.map((tag) => tag.name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase())
  if (new Set(tagKeys).size !== tagKeys.length) blockers.push({ code: 'SEO_TAG_DUPLICATE', message: '중복 SEO 태그가 있습니다.' })
  const tagComparisons = findSeoTagComparisons(content.tags.map((tag) => tag.name))
  tagComparisons.forEach((comparison) => {
    const detail = `원문 태그 "${comparison.left}" / "${comparison.right}"`
    if (comparison.relation === 'normalized_duplicate') {
      if (tagKeys[comparison.leftIndex] !== tagKeys[comparison.rightIndex]) {
        blockers.push({ code: 'SEO_TAG_DUPLICATE_NORMALIZED', message: '공백·구분자·대소문자를 정규화하면 중복되는 SEO 태그가 있습니다.', detail })
      }
      return
    }
    warnings.push({ code: 'SEO_TAG_POSSIBLE_NEAR_DUPLICATE', message: '서로 포함 관계인 SEO 태그가 실질적으로 겹칠 수 있습니다.', detail })
  })
  const categoryKey = content.categoryName.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
  if (tagKeys.some((tag) => tag === categoryKey || tag.replace(/[\s-]+/g, '') === 'dailybriefnote')) {
    blockers.push({ code: 'SEO_TAG_FORBIDDEN', message: '카테고리명 또는 Daily Brief Note 브랜드명은 SEO 태그로 사용할 수 없습니다.' })
  }
  if ([...content.metaDescription].length < 120 || [...content.metaDescription].length > 160) warnings.push({ code: 'META_DESCRIPTION_LENGTH', message: '메타 설명이 권장 길이 120~160자를 벗어났습니다.' })
  if (!/href\s*=\s*(['"])#sources\1/i.test(html)) warnings.push({ code: 'INTERNAL_LINK_MISSING', message: '본문의 출처 내부 링크를 확인해 주세요.' })
  const h1 = /<h1(?:\s[^>]*)?>([^]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (title && h1 && title !== h1) warnings.push({ code: 'TITLE_H1_MISMATCH', message: 'SEO 대표 제목과 본문 h1이 다릅니다.' })

  const payload: PublicationPayload = {
    title, content: html, status: 'draft', slug: content.slug, excerpt: content.metaDescription,
    categories: uniqueSortedIntegers(categoryIds), tags: uniqueSortedIntegers(tagIds),
  }
  const canonical = canonicalJson(payload)
  const size = {
    titleBytes: new TextEncoder().encode(payload.title).byteLength,
    contentBytes: new TextEncoder().encode(payload.content).byteLength,
    excerptBytes: new TextEncoder().encode(payload.excerpt).byteLength,
    canonicalPayloadBytes: new TextEncoder().encode(canonical).byteLength,
  }
  if (size.contentBytes > MAX_CONTENT_BYTES || size.canonicalPayloadBytes > MAX_PAYLOAD_BYTES) blockers.push({ code: 'PAYLOAD_TOO_LARGE', message: '앱의 WordPress Dry Run 안전 크기 상한을 초과했습니다.' })
  return { payload, payloadFingerprint: `sha256:${await sha256(canonical)}`, size, blockers, warnings }
}
