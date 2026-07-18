import { canonicalJson, sha256, uniqueSortedIntegers } from './normalization.ts'
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
  if (!title) blockers.push({ code: 'TITLE_MISSING', message: 'SEO 대표 제목이 없습니다.' })
  blockers.push(...structuralHtmlIssues(html, content.wrapperClass))
  if (!content.slug || content.slug !== expectedSlug(content)) blockers.push({ code: 'SLUG_INVALID', message: '현재 카테고리 설정과 slug가 일치하지 않습니다.' })
  if (!content.metaDescription.trim()) blockers.push({ code: 'SEO_META_MISSING', message: '메타 설명이 없습니다.' })
  if (content.tags.length < 5 || content.tags.length > 8) blockers.push({ code: 'SEO_TAG_COUNT_INVALID', message: 'SEO 태그는 5~8개여야 합니다.' })
  const tagKeys = content.tags.map((tag) => tag.name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase())
  if (new Set(tagKeys).size !== tagKeys.length) blockers.push({ code: 'SEO_TAG_DUPLICATE', message: '중복 SEO 태그가 있습니다.' })
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
