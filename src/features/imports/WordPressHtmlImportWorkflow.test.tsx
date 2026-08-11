import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { importCategories } from './imports.fixtures'
import { parseWordPressHtml } from './parseWordPressHtml'
import { WordPressHtmlImportWorkflow } from './WordPressHtmlImportWorkflow'
import type { WordPressHtmlDraft } from './wordPressHtmlImport.types'
import { WordPressManualRepositoryError, type SaveWordPressManualPostResult } from './wordPressManual.repository'

const html = `<div class="daily-brief-note news-briefing economy"><h1>경제 브리핑</h1><p class="intro">경제 요약</p><p class="brief-meta">2026-08-09 #2026-08-09-ECO</p><link rel="canonical" href="https://example.com/economy-briefing-2026-08-09"></div>`
const saved: SaveWordPressManualPostResult = {
  postId: '11111111-1111-4111-8111-111111111111', title: '경제 브리핑', categoryId: 'economy', status: 'draft',
  slug: 'economy-briefing-2026-08-09', displayId: '#2026-08-09-ECO', publishedOn: '2026-08-09', wordpressUrl: 'https://example.com/economy-briefing-2026-08-09',
}
const emptyReference = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }

function completeLookup(referenceData = emptyReference) {
  return vi.fn().mockResolvedValue({ databaseCheck: 'complete' as const, referenceData })
}

type WorkflowProps = ComponentProps<typeof WordPressHtmlImportWorkflow>
type SaveMock = ReturnType<typeof vi.fn<(client: DatabaseClient, post: WordPressHtmlDraft) => Promise<SaveWordPressManualPostResult>>>

function renderWorkflow(options: {
  duplicateLookup?: NonNullable<WorkflowProps['duplicateLookup']>
  save?: SaveMock
  parse?: NonNullable<WorkflowProps['parse']>
  categories?: typeof importCategories
} = {}) {
  const save = options.save ?? vi.fn().mockResolvedValue(saved)
  const duplicateLookup = options.duplicateLookup ?? completeLookup()
  render(<MemoryRouter initialEntries={['/imports']}><Routes>
    <Route path="/imports" element={<WordPressHtmlImportWorkflow
      client={{} as DatabaseClient} categories={options.categories ?? importCategories} save={save} duplicateLookup={duplicateLookup} parse={options.parse}
    />} />
    <Route path="/content/:postId" element={<h1>저장된 콘텐츠 상세</h1>} />
  </Routes></MemoryRouter>)
  return { save, duplicateLookup }
}

async function analyze(value = html) {
  const user = userEvent.setup()
  fireEvent.change(screen.getByLabelText('WordPress HTML 원문'), { target: { value } })
  await user.click(screen.getByRole('button', { name: '로컬 HTML 분석' }))
  return user
}

async function validate() {
  await userEvent.click(screen.getByRole('button', { name: 'Canonical 검증 및 DB 중복 검사' }))
  await waitFor(() => expect(screen.getByText(/DB 중복 검사와 canonical validation이 완료되었습니다|저장 가능한 경고가 있습니다/)).toBeInTheDocument())
}

describe('WordPressHtmlImportWorkflow', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('runs local parse to editable structural preview with no persistence', async () => {
    const { save, duplicateLookup } = renderWorkflow()
    await analyze()
    expect(screen.getByRole('heading', { name: 'WordPress HTML 구조 미리보기 및 편집' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('경제 브리핑')).toBeInTheDocument()
    expect(screen.getByText(/DOMParser로 브라우저 내부에서만 분석/)).toBeInTheDocument()
    expect(duplicateLookup).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps missing metadata editable and uses legacy validation warnings', async () => {
    renderWorkflow()
    await analyze('<div class="daily-brief-note ai-column"><h1 style="color:red">AI 칼럼 #1</h1><i data-slug="ai-001"></i></div>')
    expect(screen.getByLabelText('분야')).toBeInTheDocument()
    expect(screen.getByLabelText('난이도')).toBeInTheDocument()
    expect(screen.getByLabelText('예상 읽기 시간(분)')).toBeInTheDocument()
    expect(screen.getByLabelText('대표 제목')).toBeInTheDocument()
    expect(screen.getByLabelText('이미지 alt')).toBeInTheDocument()
    expect(screen.getByText(/HTML_INLINE_STYLE/)).toBeInTheDocument()
  })

  it('allows explicit title and category ambiguity resolution and invalidates stale validation after edits', async () => {
    const parse = (raw: string, categories: typeof importCategories) => {
      const result = parseWordPressHtml(raw, categories)
      return {
        ...result,
        categoryMatches: [categories[0], categories[1]],
        title: { state: 'ambiguous' as const, values: ['첫 제목', '둘째 제목'], value: null },
        issues: [...result.issues,
          { code: 'WORDPRESS_CATEGORY_AMBIGUOUS', severity: 'error' as const, message: 'ambiguous', path: 'categoryId' },
          { code: 'WORDPRESS_TITLE_AMBIGUOUS', severity: 'error' as const, message: 'ambiguous', path: 'title' }],
      }
    }
    renderWorkflow({ parse })
    const user = await analyze()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'economy')
    await user.type(screen.getByLabelText('제목'), '경제 브리핑')
    fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-09' } })
    await validate()
    expect(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' })).toBeEnabled()
    await user.clear(screen.getByLabelText('제목'))
    await user.type(screen.getByLabelText('제목'), '수정된 제목')
    expect(screen.queryByText(/DB 중복 검사와 canonical validation이 완료되었습니다/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' })).toBeDisabled()
  })

  it.each(['partial', 'unavailable'] as const)('blocks %s duplicate lookup state', async (databaseCheck) => {
    const duplicateLookup = vi.fn().mockResolvedValue({ databaseCheck, referenceData: emptyReference })
    const { save } = renderWorkflow({ duplicateLookup })
    await analyze()
    await userEvent.click(screen.getByRole('button', { name: 'Canonical 검증 및 DB 중복 검사' }))
    expect(await screen.findByText(/DB 중복 검사가 complete가 아니므로 저장할 수 없습니다/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and cancel performs zero writes', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    const { save } = renderWorkflow()
    await analyze(); await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('wordpress_manual'))
    expect(await screen.findByText(/저장을 취소했습니다/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('binds an approved warning state to unchanged final validation and saves once', async () => {
    const { save, duplicateLookup } = renderWorkflow()
    await analyze(html.replace('<h1>', '<h1 style="color:red">'))
    await validate()
    const approval = screen.getByRole('checkbox', { name: /legacy 경고와 저장 가능한 모든 경고/ })
    expect(approval).not.toBeChecked()
    await userEvent.click(approval)
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument()
    expect(duplicateLookup).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledOnce()
  })

  it('invalidates prior approval when final validation adds a warning and succeeds only after renewed approval', async () => {
    const categories = importCategories.map((category) => ({ ...category }))
    let lookupCount = 0
    const duplicateLookup = vi.fn().mockImplementation(async () => {
      lookupCount += 1
      if (lookupCount === 2) categories[0].slugPattern = 'changed-YYYY-MM-DD'
      return { databaseCheck: 'complete' as const, referenceData: emptyReference }
    })
    const { save } = renderWorkflow({ categories, duplicateLookup })
    await analyze(); await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByText(/저장 직전 검증 상태가 변경되어 이전 승인을 무효화/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    const renewedApproval = screen.getByRole('checkbox', { name: /legacy 경고와 저장 가능한 모든 경고/ })
    expect(renewedApproval).not.toBeChecked()
    await userEvent.click(renewedApproval)
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument()
    expect(duplicateLookup).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenCalledOnce()
  })

  it('blocks save when final canonical validation becomes invalid', async () => {
    const categories = importCategories.map((category) => ({ ...category }))
    let lookupCount = 0
    const duplicateLookup = vi.fn().mockImplementation(async () => {
      lookupCount += 1
      if (lookupCount === 2) categories[0].enabled = false
      return { databaseCheck: 'complete' as const, referenceData: emptyReference }
    })
    const { save } = renderWorkflow({ categories, duplicateLookup })
    await analyze(); await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByText(/저장 직전 새 중복 또는 검증 오류/)).toBeInTheDocument()
    expect(screen.getByText(/POST_CATEGORY_INACTIVE/)).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('invalidates approval after a normalized save value changes and requires renewed review', async () => {
    const { save } = renderWorkflow()
    const user = await analyze(html.replace('<h1>', '<h1 style="color:red">'))
    await validate()
    await user.click(screen.getByRole('checkbox', { name: /legacy 경고와 저장 가능한 모든 경고/ }))
    await user.clear(screen.getByLabelText('제목'))
    await user.type(screen.getByLabelText('제목'), '승인 후 변경된 제목')
    expect(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' })).toBeDisabled()
    expect(save).not.toHaveBeenCalled()
    await validate()
    const renewedApproval = screen.getByRole('checkbox', { name: /legacy 경고와 저장 가능한 모든 경고/ })
    expect(renewedApproval).not.toBeChecked()
    await user.click(renewedApproval)
    await user.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument()
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][1].title).toBe('승인 후 변경된 제목')
  })

  it('performs an exact final duplicate recheck and blocks a newly appeared duplicate', async () => {
    const duplicateLookup = completeLookup()
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: emptyReference })
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: { ...emptyReference, posts: [{ categoryId: 'economy', title: '기존 글', slug: 'economy-briefing-2026-08-09', displayId: '#2026-08-09-ECO', seriesNo: null, briefingDate: '2026-08-09', publishedOn: '2026-08-09', wordpressUrl: null }] } })
    const { save } = renderWorkflow({ duplicateLookup })
    await analyze(); await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByText(/저장 직전 새 중복 또는 검증 오류/)).toBeInTheDocument()
    expect(duplicateLookup).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })

  it('saves once after confirmation, fixes no client provenance, and excludes news tracking persistence', async () => {
    const { save, duplicateLookup } = renderWorkflow()
    await analyze(html.replace('</div>', '<section id="issue-1"><h2>뉴스</h2></section></div>'))
    expect(screen.getByText(/뉴스 추적 추출 미리보기/)).toBeInTheDocument()
    await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument()
    expect(duplicateLookup).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][1].newsTracking).toBeNull()
    expect(JSON.stringify(save.mock.calls[0][1])).not.toContain('sourceImportType')
  })

  it('retains preview and exact raw HTML after failure without automatic retry', async () => {
    const save = vi.fn().mockRejectedValue(new WordPressManualRepositoryError('안전한 오류'))
    renderWorkflow({ save })
    await analyze(); await validate()
    await userEvent.click(screen.getByRole('button', { name: '확인 후 WordPress 글 한 건 저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('안전한 오류')
    expect(screen.getByRole('heading', { name: 'WordPress HTML 구조 미리보기 및 편집' })).toBeInTheDocument()
    expect(screen.getByLabelText('WordPress HTML 원문')).toHaveValue(html)
    expect(save).toHaveBeenCalledOnce()
  })

  it('raw HTML edits and reset invalidate all prior analysis without saving', async () => {
    const { save } = renderWorkflow()
    await analyze(); await validate()
    fireEvent.change(screen.getByLabelText('WordPress HTML 원문'), { target: { value: `${html}\n` } })
    expect(screen.queryByRole('heading', { name: 'WordPress HTML 구조 미리보기 및 편집' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '확인 후 WordPress 글 한 건 저장' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '붙여넣기 초기화' }))
    expect(screen.getByLabelText('WordPress HTML 원문')).toHaveValue('')
    expect(save).not.toHaveBeenCalled()
  })

  it('never logs pasted raw HTML', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderWorkflow()
    await analyze(`${html}<!-- PRIVATE_RAW_MARKER -->`)
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_RAW_MARKER')
    expect(JSON.stringify(error.mock.calls)).not.toContain('PRIVATE_RAW_MARKER')
    log.mockRestore(); error.mockRestore()
  })
})
