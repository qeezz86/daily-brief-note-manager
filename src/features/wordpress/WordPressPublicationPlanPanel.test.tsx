import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicationPlan } from './wordpressPublicationPreview.schema'
import { WordPressPublicationPlanPanel } from './WordPressPublicationPlanPanel'

const copy = vi.fn().mockResolvedValue(undefined)
vi.mock('../briefingPrompts/copyTextToClipboard', () => ({ copyTextToClipboard: (...args: unknown[]) => copy(...args) }))

const emptyResolution = { resolved: [{ localKey: 'economy', localName: '경제', termId: 7, termSlug: 'economy', termName: '경제' }], missing: [], ambiguous: [], stale: [] }
const plan: PublicationPlan = {
  schemaVersion: 1, ok: true, mode: 'dry-run', writePerformed: false, checkedAt: '2026-07-18T00:00:00Z',
  source: { contentId: '10000000-0000-4000-8000-000000000001', contentType: 'news', categoryId: 'economy', updatedAt: '2026-07-18T00:00:00Z', seriesId: null },
  site: { origin: 'https://wordpress.example.com' },
  taxonomy: { categories: emptyResolution, tags: { ...emptyResolution, resolved: [{ localKey: 'economy-policy', localName: '경제 정책', termId: 19, termSlug: 'economy-policy', termName: '경제 정책' }] } },
  duplicate: { conflict: false, matches: [] },
  payload: { title: '대표 제목', content: '<div><h1>대표 제목</h1></div>', status: 'draft', slug: 'economy-briefing-2026-07-18', excerpt: '요약', categories: [7], tags: [19] },
  payloadFingerprint: `sha256:${'a'.repeat(64)}`,
  payloadSize: { titleBytes: 13, contentBytes: 36, excerptBytes: 6, canonicalPayloadBytes: 180 },
  readyForDraftCreation: true, blockers: [], warnings: [],
}

function renderPanel(value: PublicationPlan = plan, stale = false) {
  return render(<MemoryRouter><WordPressPublicationPlanPanel plan={value} sourceTitle="원본 콘텐츠" stale={stale} /></MemoryRouter>)
}

describe('WordPressPublicationPlanPanel', () => {
  it('ready plan과 GET-only 결과를 표시하고 게시 action은 만들지 않는다', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Draft 생성 준비 완료' })).toBeInTheDocument()
    expect(screen.getByText('아니요')).toBeInTheDocument()
    expect(screen.getByText(plan.payloadFingerprint)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /게시|발행|초안 생성/ })).not.toBeInTheDocument()
  })

  it('blocker, warning, duplicate와 stale source를 별도로 표시한다', () => {
    const blocked: PublicationPlan = { ...plan, readyForDraftCreation: false, blockers: [{ code: 'TAG_MAPPING_MISSING', message: '매핑 없음' }], warnings: [{ code: 'TITLE_H1_MISMATCH', message: '제목 확인' }], duplicate: { conflict: true, matches: [{ id: 9, slug: plan.payload.slug, status: 'draft', modifiedGmt: null, link: null }] } }
    renderPanel(blocked, true)
    expect(screen.getByRole('heading', { name: '차단 사유 확인 필요' })).toBeInTheDocument()
    expect(screen.getAllByRole('alert').some((element) => element.textContent?.includes('다시 실행'))).toBe(true)
    expect(screen.getByText('TAG_MAPPING_MISSING')).toBeInTheDocument()
    expect(screen.getByText('TITLE_H1_MISMATCH')).toBeInTheDocument()
    expect(screen.getByText('1건의 충돌이 있습니다.')).toBeInTheDocument()
  })

  it('normalized blocker와 near warning의 원문 쌍을 표시하고 자동 수정 action은 만들지 않는다', () => {
    renderPanel({
      ...plan,
      readyForDraftCreation: false,
      blockers: [{ code: 'SEO_TAG_DUPLICATE_NORMALIZED', message: '정규화 중복', detail: '원문 태그 "생성형-AI" / "생성형 AI"' }],
      warnings: [{ code: 'SEO_TAG_POSSIBLE_NEAR_DUPLICATE', message: '근접 중복', detail: '원문 태그 "워드프레스 연동" / "워드프레스 연동법"' }],
    })
    expect(screen.getByText('SEO_TAG_DUPLICATE_NORMALIZED')).toBeInTheDocument()
    expect(screen.getByText(/생성형-AI.*생성형 AI/)).toBeInTheDocument()
    expect(screen.getByText('SEO_TAG_POSSIBLE_NEAR_DUPLICATE')).toBeInTheDocument()
    expect(screen.getByText(/워드프레스 연동.*워드프레스 연동법/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /콘텐츠 편집 화면/ })).toHaveAttribute('href', `/content/${plan.source.contentId}/edit`)
    expect(screen.queryByRole('button', { name: /자동 수정|태그 병합|태그 삭제/ })).not.toBeInTheDocument()
  })

  it('payload JSON을 escaped text로 렌더링하고 복사한다', async () => {
    const { container } = renderPanel()
    expect(container.querySelector('.wordpress-payload script')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Payload 복사' }))
    expect(await screen.findByText('Payload를 복사했습니다.')).toBeInTheDocument()
    expect(copy).toHaveBeenCalledWith(JSON.stringify(plan.payload, null, 2))
  })

  it.each(['게시', '발행', '초안 생성', 'WordPress 전송', '업로드', '생성 후 게시'])('%s 쓰기 버튼을 제공하지 않는다', (name) => {
    renderPanel()
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
})
