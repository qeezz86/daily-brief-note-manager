import { describe, expect, it } from 'vitest'
import type { SourceContent } from './schemas'
import { buildPayload, MAX_CONTENT_BYTES } from './payloadBuilder'

const meta = '가'.repeat(130)
const valid: SourceContent = { id: crypto.randomUUID(), categoryId: 'economy', categoryName: '경제', contentGroup: 'news', wrapperClass: 'daily-brief-note news-briefing economy', slugPattern: 'economy-briefing-YYYY-MM-DD', seriesNo: null, briefingDate: '2026-07-18', publishedOn: null, contentStatus: 'ready', updatedAt: '2026-07-18T00:00:00Z', representativeTitle: '대표 제목', metaDescription: meta, htmlBody: '<div class="daily-brief-note news-briefing economy"><h1>대표 제목</h1><a href="#sources">출처</a></div>', slug: 'economy-briefing-2026-07-18', tags: ['A','B','C','D','E'].map((name) => ({ id: crypto.randomUUID(), name, normalizedName: name.toLowerCase() })) }

describe('publication payload builder', () => {
  it('draft payload의 허용 필드만 만든다', async () => { const result = await buildPayload(valid, [3, 1, 3], [8, 7]); expect(result.payload).toEqual({ title: '대표 제목', content: valid.htmlBody, status: 'draft', slug: valid.slug, excerpt: meta, categories: [1, 3], tags: [7, 8] }); expect(result.blockers).toEqual([]) })
  it('fingerprint는 deterministic하다', async () => expect((await buildPayload(valid, [1], [2])).payloadFingerprint).toBe((await buildPayload(valid, [1], [2])).payloadFingerprint))
  it('UTF-8 byte 크기를 측정한다', async () => expect((await buildPayload(valid, [1], [2])).size.excerptBytes).toBe(390))
  it('빈 제목을 차단한다', async () => expect((await buildPayload({ ...valid, representativeTitle: null }, [], [])).blockers.some((item) => item.code === 'TITLE_MISSING')).toBe(true))
  it('빈 HTML을 차단한다', async () => expect((await buildPayload({ ...valid, htmlBody: '' }, [], [])).blockers.some((item) => item.code === 'HTML_MISSING')).toBe(true))
  it('h1 복수는 차단한다', async () => expect((await buildPayload({ ...valid, htmlBody: valid.htmlBody!.replace('</div>', '<h1>둘</h1></div>') }, [], [])).blockers.some((item) => item.code === 'H1_INVALID')).toBe(true))
  it('wrong wrapper를 차단한다', async () => expect((await buildPayload({ ...valid, htmlBody: valid.htmlBody!.replace('economy', 'global') }, [], [])).blockers.some((item) => item.code === 'WRAPPER_INVALID')).toBe(true))
  it.each(['<script>x</script>', '<iframe></iframe>', '<object></object>', '<form></form>', '<button>x</button>', '<p onclick="x()">x</p>', '<a href="javascript:x">x</a>'])('위험 HTML %s를 차단한다', async (fragment) => expect((await buildPayload({ ...valid, htmlBody: valid.htmlBody!.replace('</div>', `${fragment}</div>`) }, [], [])).blockers.some((item) => item.code === 'HTML_INVALID')).toBe(true))
  it('deprecated/불일치 slug를 차단한다', async () => expect((await buildPayload({ ...valid, slug: 'science-tech-briefing-2026-07-18' }, [], [])).blockers.some((item) => item.code === 'SLUG_INVALID')).toBe(true))
  it('태그 5개 미만을 차단한다', async () => expect((await buildPayload({ ...valid, tags: valid.tags.slice(0, 4) }, [], [])).blockers.some((item) => item.code === 'SEO_TAG_COUNT_INVALID')).toBe(true))
  it('중복 태그를 차단한다', async () => expect((await buildPayload({ ...valid, tags: [...valid.tags.slice(0, 4), { ...valid.tags[0], id: crypto.randomUUID() }] }, [], [])).blockers.some((item) => item.code === 'SEO_TAG_DUPLICATE')).toBe(true))
  it.each(['경제', 'Daily Brief Note', 'DailyBriefNote'])('금지 SEO 태그 %s를 차단한다', async (name) => {
    const tags = [{ ...valid.tags[0], name, normalizedName: name.toLowerCase() }, ...valid.tags.slice(1)]
    expect((await buildPayload({ ...valid, tags }, [], [])).blockers.some((item) => item.code === 'SEO_TAG_FORBIDDEN')).toBe(true)
  })
  it('payload 안전 상한을 넘으면 자르지 않고 차단한다', async () => { const html = `<div class="${valid.wrapperClass}"><h1>대표 제목</h1>${'가'.repeat(MAX_CONTENT_BYTES)}</div>`; const result = await buildPayload({ ...valid, htmlBody: html }, [], []); expect(result.blockers.some((item) => item.code === 'PAYLOAD_TOO_LARGE')).toBe(true); expect(result.payload.content).toBe(html) })
})
