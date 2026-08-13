import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { mapChatGptPasteRepositoryError } from './chatGptPaste.repository'
import type { ImportCategory, ImportDuplicateLookupResult } from './importValidation.types'
import { NonNewsResponseImportWorkflow } from './NonNewsResponseImportWorkflow'
import { NON_NEWS_RESPONSE_HEADINGS } from './nonNewsResponseImport.types'

const categories: ImportCategory[] = [
  { id: 'ai-column', contentGroup: 'ai', name: 'AI 칼럼', code: 'AI', wrapperClass: 'daily-brief-note ai-column', displayIdPattern: 'AI-###', slugPattern: 'ai-###', enabled: true },
  { id: 'info-db', contentGroup: 'info_db', name: '정보DB', code: 'INFO', wrapperClass: 'daily-brief-note info-db', displayIdPattern: '정보DB-###', slugPattern: 'info-db-###', enabled: true },
  { id: 'chinese-study', contentGroup: 'chinese', name: '중국어 학습', code: 'CHINESE', wrapperClass: 'daily-brief-note chinese-study', displayIdPattern: null, slugPattern: 'cctv-chinese-news-###', enabled: true },
  { id: 'disabled', contentGroup: 'ai', name: '비활성', code: 'OFF', wrapperClass: 'daily-brief-note disabled', displayIdPattern: 'OFF-###', slugPattern: 'off-###', enabled: false },
]
const client = {} as DatabaseClient
const emptyReferences: ImportDuplicateLookupResult['referenceData'] = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }
type WorkflowProps = ComponentProps<typeof NonNewsResponseImportWorkflow>
type DuplicateLookup = NonNullable<WorkflowProps['duplicateLookup']>
type SaveFunction = NonNullable<WorkflowProps['save']>
type DuplicateLookupMock = ReturnType<typeof vi.fn<DuplicateLookup>>
type SaveMock = ReturnType<typeof vi.fn<SaveFunction>>

function response({ category = 'ai-column', title = '새로운 업무 설계', meta = '가'.repeat(120) } = {}) {
  const setting = categories.find((item) => item.id === category)!
  const sections = [
    title,
    '- 대안 제목 하나\n- 대안 제목 둘\n- 대안 제목 셋\n- 대안 제목 넷',
    meta,
    setting.slugPattern,
    '업무 설계',
    '- 인공지능\n- 업무혁신\n- 생산성\n- 자동화\n- 디지털전환',
    `\`\`\`html\n<div class="${setting.wrapperClass}"><h1>${title}</h1><section id="sources"><p data-source-name="기관" data-checked-point="핵심 확인"><a href="https://example.com/article">원문</a></p></section></div>\n\`\`\``,
    '사무실에서 협업하는 사람들의 미니멀한 대표 이미지',
    '사무실에서 협업하는 사람들',
    '- 제목 확인\n- 출처 확인',
  ]
  return NON_NEWS_RESPONSE_HEADINGS.map((heading, index) => `${heading}\n${sections[index]}`).join('\n\n')
}

function renderWorkflow(options: {
  duplicateLookup?: DuplicateLookupMock
  save?: SaveMock
  settings?: ImportCategory[]
} = {}) {
  const duplicateLookup = options.duplicateLookup ?? vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck: 'complete', referenceData: emptyReferences })
  const save = options.save ?? vi.fn<SaveFunction>().mockResolvedValue({ postId: '00000000-0000-4000-8000-000000000101', title: '새로운 업무 설계', categoryId: 'ai-column', status: 'draft', slug: 'ai-001', displayId: 'AI-001', publishedOn: null, wordpressUrl: null })
  const view = render(<MemoryRouter><NonNewsResponseImportWorkflow client={client} categories={options.settings ?? categories} duplicateLookup={duplicateLookup} save={save} /></MemoryRouter>)
  return { ...view, duplicateLookup, save }
}

async function parseAndValidate(user = userEvent.setup(), input = response(), category = 'ai-column', series = '1') {
  await user.selectOptions(screen.getByLabelText('카테고리'), category)
  await user.type(screen.getByLabelText('시리즈 번호'), series)
  fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: input } })
  await user.click(screen.getByRole('button', { name: '10-section 분석' }))
  await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
  await screen.findByText(/정확한 DB 중복 검사가 complete/u)
  return user
}

describe('NonNewsResponseImportWorkflow', () => {
  it('exposes only active supported categories, explicit series input, paste, and editable inert review', async () => {
    const { save } = renderWorkflow()
    const user = userEvent.setup()
    expect(screen.queryByRole('option', { name: '비활성' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'info-db')
    await user.type(screen.getByLabelText('시리즈 번호'), '9')
    fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: response({ category: 'info-db' }) } })
    await user.click(screen.getByRole('button', { name: '10-section 분석' }))
    expect(screen.getByRole('heading', { name: '비뉴스 응답 검토 및 편집' })).toBeInTheDocument()
    expect((screen.getByLabelText('비뉴스 WordPress HTML inert preview') as HTMLTextAreaElement).value).toContain('<div')
    expect(document.querySelector('section#sources')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('renders stable parse blockers and blocks save for unresolved Chinese numbering', async () => {
    renderWorkflow()
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: '1. 잘못된 제목\n값' } })
    await user.click(screen.getByRole('button', { name: '10-section 분석' }))
    expect(screen.getByRole('alert')).toHaveTextContent('NON_NEWS_UNKNOWN_STRUCTURAL_SECTION')

    fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: response({ category: 'chinese-study', title: 'CCTV 뉴스로 배우는 중국어 #[번호]' }) } })
    await user.selectOptions(screen.getByLabelText('카테고리'), 'chinese-study')
    await user.click(screen.getByRole('button', { name: '10-section 분석' }))
    await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
    expect(screen.getByText(/NON_NEWS_REQUIRED_IDENTIFIER_UNRESOLVED/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it('requires warning acknowledgement and resets it with stale duplicate state after a relevant edit', async () => {
    renderWorkflow()
    const user = await parseAndValidate(userEvent.setup(), response({ meta: '짧은 설명' }))
    const acknowledgement = screen.getByLabelText('현재 검증 경고를 확인했으며 초안 저장을 계속합니다.')
    expect(acknowledgement).not.toBeChecked()
    await user.click(acknowledgement)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeEnabled()
    await user.clear(screen.getByLabelText('SEO 대표 제목'))
    await user.type(screen.getByLabelText('SEO 대표 제목'), '수정된 SEO 제목')
    expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()
    expect(acknowledgement).not.toBeChecked()
    expect(screen.getByText(/아직 중복 검사를 실행하지 않았습니다/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it('re-resolves a retained Chinese placeholder candidate after the explicit series number changes', async () => {
    renderWorkflow()
    const user = await parseAndValidate(userEvent.setup(), response({ category: 'chinese-study', title: 'CCTV 뉴스로 배우는 중국어 #[번호]' }), 'chinese-study', '1')
    await user.clear(screen.getByLabelText('시리즈 번호'))
    await user.type(screen.getByLabelText('시리즈 번호'), '2')
    expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
    await screen.findByText(/정확한 DB 중복 검사가 complete/u)
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    const dialog = screen.getByRole('dialog', { name: '초안 한 건 저장 최종 확인' })
    expect(dialog).toHaveTextContent('CCTV 뉴스로 배우는 중국어 #2')
    expect(dialog).toHaveTextContent('cctv-chinese-news-002')
  })

  it.each(['partial', 'unavailable'] as const)('treats a %s duplicate lookup as blocking, never clear', async (databaseCheck) => {
    const duplicateLookup = vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck, referenceData: emptyReferences })
    renderWorkflow({ duplicateLookup })
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'ai-column')
    await user.type(screen.getByLabelText('시리즈 번호'), '1')
    fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: response() } })
    await user.click(screen.getByRole('button', { name: '10-section 분석' }))
    await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(databaseCheck)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it('blocks an exact slug or category-series duplicate', async () => {
    const duplicateLookup = vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck: 'complete', referenceData: { ...emptyReferences, posts: [{ categoryId: 'ai-column', title: '기존', slug: 'ai-001', displayId: 'AI-001', seriesNo: 1, briefingDate: null, publishedOn: null, wordpressUrl: null }] } })
    renderWorkflow({ duplicateLookup })
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'ai-column')
    await user.type(screen.getByLabelText('시리즈 번호'), '1')
    fireEvent.change(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text'), { target: { value: response() } })
    await user.click(screen.getByRole('button', { name: '10-section 분석' }))
    await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('정확한 중복')
  })

  it('shows final category/title/slug/draft confirmation and save-time rechecks before one allowlisted save', async () => {
    let release: (() => void) | undefined
    const save = vi.fn<SaveFunction>().mockImplementation(() => new Promise((resolve) => { release = () => resolve({ postId: '00000000-0000-4000-8000-000000000101', title: '새로운 업무 설계', categoryId: 'ai-column', status: 'draft', slug: 'ai-001', displayId: 'AI-001', publishedOn: null, wordpressUrl: null }) }))
    const view = renderWorkflow({ save })
    const user = await parseAndValidate()
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    const dialog = screen.getByRole('dialog', { name: '초안 한 건 저장 최종 확인' })
    expect(dialog).toHaveTextContent('AI 칼럼')
    expect(dialog).toHaveTextContent('새로운 업무 설계')
    expect(dialog).toHaveTextContent('ai-001')
    expect(dialog).toHaveTextContent('draft')
    const confirm = screen.getByRole('button', { name: '초안 한 건 저장 확인' })
    await user.dblClick(confirm)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(view.duplicateLookup).toHaveBeenCalledTimes(2)
    const payload = save.mock.calls[0][1]
    expect(Object.keys(payload)).toEqual(['content', 'seo', 'image', 'sources', 'html_body'])
    expect(JSON.stringify(payload)).not.toMatch(/10-section|checklist|owner|auth|session|status|provenance/iu)
    await act(async () => release?.())
    expect(await screen.findByText(/애플리케이션 초안 한 건을 저장했습니다/u)).toBeInTheDocument()
    view.rerender(<MemoryRouter><NonNewsResponseImportWorkflow client={client} categories={categories.map((category) => category.id === 'ai-column' ? { ...category, slugPattern: 'ai-column-###' } : category)} duplicateLookup={view.duplicateLookup} save={save} /></MemoryRouter>)
    expect(screen.getByText(/애플리케이션 초안 한 건을 저장했습니다/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it('aborts when the save-time duplicate recheck becomes uncertain', async () => {
    const duplicateLookup = vi.fn<DuplicateLookup>()
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: emptyReferences })
      .mockResolvedValueOnce({ databaseCheck: 'unavailable', referenceData: emptyReferences })
    const { save } = renderWorkflow({ duplicateLookup })
    const user = await parseAndValidate()
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    await user.click(screen.getByRole('button', { name: '초안 한 건 저장 확인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
    expect(save).not.toHaveBeenCalled()
  })

  it('redacts backend failure details, retains review, and never auto-retries', async () => {
    const save = vi.fn<SaveFunction>().mockRejectedValue(mapChatGptPasteRepositoryError({ code: 'XX000', message: 'private SQL RLS owner raw response' }))
    const { duplicateLookup } = renderWorkflow({ save })
    const user = await parseAndValidate()
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    await user.click(screen.getByRole('button', { name: '초안 한 건 저장 확인' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('자동 재시도하지 않았습니다')
    expect(alert).not.toHaveTextContent('private SQL RLS owner raw response')
    expect(screen.getByRole('heading', { name: '비뉴스 응답 검토 및 편집' })).toBeInTheDocument()
    expect(screen.getByLabelText('SEO 대표 제목')).toHaveValue('새로운 업무 설계')
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    await user.click(screen.getByRole('button', { name: '초안 한 건 저장 확인' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(duplicateLookup).toHaveBeenCalledTimes(3)
  })

  it('marks a retained preview stale when active category settings change', async () => {
    let releaseRefreshedDuplicateLookup: (() => void) | undefined
    const duplicateLookup = vi.fn<DuplicateLookup>()
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: emptyReferences })
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseRefreshedDuplicateLookup = () => resolve({ databaseCheck: 'complete', referenceData: emptyReferences })
      }))
    const view = renderWorkflow({ duplicateLookup })
    const user = await parseAndValidate(userEvent.setup(), response({ meta: '짧은 설명' }))
    const acknowledgement = screen.getByLabelText('현재 검증 경고를 확인했으며 초안 저장을 계속합니다.')
    await user.click(acknowledgement)
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    expect(screen.getByRole('dialog', { name: '초안 한 건 저장 최종 확인' })).toBeInTheDocument()

    const refreshedCategories = categories.map((category) => category.id === 'ai-column' ? { ...category, slugPattern: 'ai-column-###' } : category)
    view.rerender(<MemoryRouter><NonNewsResponseImportWorkflow client={client} categories={refreshedCategories} duplicateLookup={duplicateLookup} /></MemoryRouter>)
    expect(await screen.findByText(/오래된 검증/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    expect(screen.getByText(/아직 중복 검사를 실행하지 않았습니다/u)).toBeInTheDocument()
    expect(screen.queryByText(/현재 값의 정확한 DB 중복 검사가 complete/u)).not.toBeInTheDocument()
    expect(acknowledgement).not.toBeChecked()
    expect(acknowledgement).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: '초안 한 건 저장 최종 확인' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Canonical 재검증 및 DB 중복 검사' }))
    expect(screen.queryByText(/오래된 검증/u)).not.toBeInTheDocument()
    expect(screen.getByText(/아직 중복 검사를 실행하지 않았습니다/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    expect(duplicateLookup).toHaveBeenCalledTimes(2)

    await act(async () => releaseRefreshedDuplicateLookup?.())
    expect(await screen.findByText(/정확한 DB 중복 검사가 complete/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    await user.click(acknowledgement)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeEnabled()
  })
})
