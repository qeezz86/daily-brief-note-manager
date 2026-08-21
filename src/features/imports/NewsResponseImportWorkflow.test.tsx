import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import type { ImportCategory, ImportDuplicateLookupResult } from './importValidation.types'
import { NewsResponseImportWorkflow } from './NewsResponseImportWorkflow'
import { NEWS_RESPONSE_HEADINGS } from './newsResponseImport.types'

const categories: ImportCategory[] = [
  { id: 'economy', contentGroup: 'news', name: '경제', code: 'ECO', wrapperClass: 'daily-brief-note news-briefing economy', displayIdPattern: '#YYYY-MM-DD-ECO', slugPattern: 'economy-briefing-YYYY-MM-DD', enabled: true },
  { id: 'disabled-news', contentGroup: 'news', name: '비활성 뉴스', code: 'OFF', wrapperClass: 'daily-brief-note news-briefing disabled', displayIdPattern: '#YYYY-MM-DD-OFF', slugPattern: 'off-YYYY-MM-DD', enabled: false },
  { id: 'ai-column', contentGroup: 'ai', name: 'AI 칼럼', code: 'AI', wrapperClass: 'daily-brief-note ai-column', displayIdPattern: 'AI-###', slugPattern: 'ai-###', enabled: true },
]
const client = {} as DatabaseClient
const emptyReferences: ImportDuplicateLookupResult['referenceData'] = { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] }
type Props = ComponentProps<typeof NewsResponseImportWorkflow>
type DuplicateLookup = NonNullable<Props['duplicateLookup']>
type Save = NonNullable<Props['save']>

function response({ meta = '가'.repeat(120), htmlExtra = '', title = '경제 흐름 대표 제목' } = {}) {
  const sections = [title, '- 대안 하나\n- 대안 둘\n- 대안 셋\n- 대안 넷', meta, 'economy-briefing-2026-08-13', '경제 흐름', '- 금리\n- 환율\n- 물가\n- 산업\n- 정책', `\`\`\`html\n<div class="daily-brief-note news-briefing economy"><h1>${title}</h1>${htmlExtra}<section id="sources"><p data-source-name="한국은행" data-source-title="통화정책" data-checked-point="기준금리"><a href="https://example.com/report">통화정책</a></p></section></div>\n\`\`\``, '서울 금융 지구 편집 이미지', '서울 금융 지구', '- 제목 확인\n- 출처 확인']
  return NEWS_RESPONSE_HEADINGS.map((heading, index) => `${heading}\n${sections[index]}`).join('\n\n')
}
function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output> }
const getDbDuplicateStatus = () => within(
  screen.getByRole('region', { name: '뉴스 일반 응답 붙여넣기' }),
).getByText(/^DB 중복 검사:/u, { selector: '[role="status"]' })

function renderWorkflow(options: { duplicateLookup?: ReturnType<typeof vi.fn<DuplicateLookup>>; save?: ReturnType<typeof vi.fn<Save>>; settings?: ImportCategory[] } = {}) {
  const duplicateLookup = options.duplicateLookup ?? vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck: 'complete', referenceData: emptyReferences })
  const save = options.save ?? vi.fn<Save>().mockResolvedValue({ postId: '00000000-0000-4000-8000-000000000201', title: '경제 흐름 대표 제목', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-13', displayId: '#2026-08-13-ECO', publishedOn: '2026-08-13', wordpressUrl: null })
  const view = render(<MemoryRouter initialEntries={['/imports']}><NewsResponseImportWorkflow client={client} categories={options.settings ?? categories} duplicateLookup={duplicateLookup} save={save} /><LocationProbe /></MemoryRouter>)
  return { ...view, duplicateLookup, save }
}
async function parseAndValidate(text = response()) {
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('뉴스 카테고리'), 'economy')
  fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-13' } })
  fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: text } })
  await user.click(screen.getByRole('button', { name: '뉴스 10-section 분석' }))
  await user.click(screen.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }))
  const review = await screen.findByRole('region', { name: '뉴스 응답 검토 및 편집' })
  expect(await within(review).findByText('현재 revision의 complete 정확 중복 검사에 충돌이 없습니다.')).toBeInTheDocument()
  return user
}

describe('NewsResponseImportWorkflow', () => {
  it('starts inert, exposes only enabled news categories/date, and reports deterministic parse failure', async () => {
    const { save } = renderWorkflow()
    expect(screen.getByLabelText('뉴스 카테고리')).toHaveValue('')
    expect(screen.queryByRole('option', { name: 'AI 칼럼' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '비활성 뉴스' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: '1. fuzzy\n값' } })
    await userEvent.click(screen.getByRole('button', { name: '뉴스 10-section 분석' }))
    expect(screen.getByRole('alert')).toHaveTextContent('NEWS_UNKNOWN_STRUCTURAL_SECTION')
    expect(save).not.toHaveBeenCalled()
  })

  it('creates editable inert review without mounting pasted HTML or tracking content', async () => {
    renderWorkflow()
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: response({ htmlExtra: '<img src="https://untrusted.test/pixel.png">' }) } })
    await user.click(screen.getByRole('button', { name: '뉴스 10-section 분석' }))
    expect(screen.getByRole('heading', { name: '뉴스 응답 검토 및 편집' })).toBeInTheDocument()
    expect((screen.getByLabelText('뉴스 WordPress HTML inert preview') as HTMLTextAreaElement).value).toContain('<img')
    expect(document.querySelector('img[src="https://untrusted.test/pixel.png"]')).toBeNull()
    expect(document.querySelector('section#sources')).toBeNull()
  })

  it('binds warning acknowledgement, duplicate authority, and final confirmation to candidate revision', async () => {
    renderWorkflow()
    const user = await parseAndValidate(response({ meta: '짧은 설명' }))
    const acknowledgement = screen.getByLabelText('현재 revision의 검증 경고를 확인했으며 초안 저장을 계속합니다.')
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    await user.click(acknowledgement)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('#2026-08-13-ECO')
    await user.clear(screen.getByLabelText('이미지 ALT 문구'))
    await user.type(screen.getByLabelText('이미지 ALT 문구'), '수정된 ALT')
    expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '현재 revision의 검증 경고를 확인했으며 초안 저장을 계속합니다.' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(getDbDuplicateStatus()).toHaveTextContent('DB 중복 검사: 아직 중복 검사를 실행하지 않았습니다.')
  })

  it('marks category, date, and raw response mutations stale and requires explicit revalidation', async () => {
    renderWorkflow()
    const user = await parseAndValidate()
    await user.selectOptions(screen.getByLabelText('뉴스 카테고리'), '')
    expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('뉴스 카테고리'), 'economy')
    fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-14' } })
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: `${response()}\n` } })
    expect(getDbDuplicateStatus()).toHaveTextContent('DB 중복 검사: 아직 중복 검사를 실행하지 않았습니다.')
  })

  it.each(['partial', 'unavailable'] as const)('blocks %s duplicate authority', async (databaseCheck) => {
    const duplicateLookup = vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck, referenceData: emptyReferences })
    renderWorkflow({ duplicateLookup })
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('뉴스 카테고리'), 'economy')
    fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-13' } })
    fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: response() } })
    await user.click(screen.getByRole('button', { name: '뉴스 10-section 분석' }))
    await user.click(screen.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(databaseCheck)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it.each([
    [{ slug: 'economy-briefing-2026-08-13' }, 'slug'], [{ displayId: '#2026-08-13-ECO' }, 'display'],
    [{ briefingDate: '2026-08-13' }, 'date'], [{ title: '  경제\t흐름 대표 제목 ' }, 'title'],
  ] as const)('blocks exact duplicate independently: %s', async (...[override]) => {
    const duplicateLookup = vi.fn<DuplicateLookup>().mockResolvedValue({ databaseCheck: 'complete', referenceData: { ...emptyReferences, posts: [{ categoryId: 'economy', title: '다른 제목', slug: 'other', displayId: '#other', seriesNo: null, briefingDate: null, publishedOn: null, wordpressUrl: null, ...override }] } })
    renderWorkflow({ duplicateLookup })
    const user = userEvent.setup(); await user.selectOptions(screen.getByLabelText('뉴스 카테고리'), 'economy'); fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-13' } }); fireEvent.change(screen.getByLabelText('뉴스 canonical 10-section 응답 plain text'), { target: { value: response() } }); await user.click(screen.getByRole('button', { name: '뉴스 10-section 분석' })); await user.click(screen.getByRole('button', { name: '뉴스 재검증 및 DB 중복 검사' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('정규화 exact title 중복')
  })

  it('save-time rechecks, permits one active save, uses exact allowlist, blocks repeat, and navigates', async () => {
    let release: (() => void) | undefined
    const save = vi.fn<Save>().mockImplementation(() => new Promise((resolve) => { release = () => resolve({ postId: '00000000-0000-4000-8000-000000000201', title: '경제 흐름 대표 제목', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-13', displayId: '#2026-08-13-ECO', publishedOn: '2026-08-13', wordpressUrl: null }) }))
    const view = renderWorkflow({ save })
    const user = await parseAndValidate(); await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' })); await user.dblClick(screen.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1)); expect(view.duplicateLookup).toHaveBeenCalledTimes(2)
    const payload = save.mock.calls[0][1]
    expect(Object.keys(payload)).toEqual(['content', 'seo', 'image', 'sources', 'html_body'])
    expect(JSON.stringify(payload)).not.toMatch(/checklist|tracking|topic|owner|auth|session|status|provenance/iu)
    await act(async () => release?.())
    expect(await screen.findByText(/뉴스 애플리케이션 초안 한 건을 저장했습니다/u)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/content/00000000-0000-4000-8000-000000000201')
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
  })

  it('blocks save when fresh duplicate authority changes', async () => {
    const duplicateLookup = vi.fn<DuplicateLookup>().mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: emptyReferences }).mockResolvedValueOnce({ databaseCheck: 'unavailable', referenceData: emptyReferences })
    const { save } = renderWorkflow({ duplicateLookup })
    const user = await parseAndValidate(); await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' })); await user.click(screen.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable'); expect(save).not.toHaveBeenCalled()
  })

  it('blocks save when runtime category settings change while the save-time duplicate recheck is pending', async () => {
    let resolveRecheck: ((value: ImportDuplicateLookupResult) => void) | undefined
    const duplicateLookup = vi.fn<DuplicateLookup>()
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: emptyReferences })
      .mockImplementationOnce(() => new Promise<ImportDuplicateLookupResult>((resolve) => { resolveRecheck = resolve }))
    const view = renderWorkflow({ duplicateLookup })
    const user = await parseAndValidate()
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' }))
    await user.click(screen.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }))
    await waitFor(() => expect(duplicateLookup).toHaveBeenCalledTimes(2))

    const changedSettings = categories.map((item) => item.id === 'economy'
      ? { ...item, slugPattern: 'economy-news-YYYY-MM-DD' }
      : item)
    view.rerender(<MemoryRouter initialEntries={['/imports']}><NewsResponseImportWorkflow client={client} categories={changedSettings} duplicateLookup={duplicateLookup} save={view.save} /><LocationProbe /></MemoryRouter>)
    expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()

    await act(async () => resolveRecheck?.({ databaseCheck: 'complete', referenceData: emptyReferences }))
    await waitFor(() => expect(screen.queryByText('저장 중')).not.toBeInTheDocument())
    expect(view.save).not.toHaveBeenCalled()
    expect(duplicateLookup).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('retains candidate, redacts ambiguous failure, never auto-retries, and allows explicit manual retry', async () => {
    const save = vi.fn<Save>().mockRejectedValueOnce(new Error('private SQL owner RLS')).mockResolvedValueOnce({ postId: '00000000-0000-4000-8000-000000000201', title: '경제 흐름 대표 제목', categoryId: 'economy', status: 'draft', slug: 'economy-briefing-2026-08-13', displayId: '#2026-08-13-ECO', publishedOn: '2026-08-13', wordpressUrl: null })
    renderWorkflow({ save })
    const user = await parseAndValidate(); await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' })); await user.click(screen.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' }))
    const alert = await screen.findByRole('alert'); expect(alert).toHaveTextContent('초안 저장 결과를 확인하지 못했습니다. 자동 재시도하지 않았습니다. 미리보기와 후보는 유지됩니다. 결과를 확인한 뒤 수동으로 다시 시도하세요.'); expect(alert).not.toHaveTextContent('private SQL')
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1)); expect(screen.getByLabelText('SEO 대표 제목')).toHaveValue('경제 흐름 대표 제목')
    await user.click(screen.getByRole('button', { name: '최종 저장 확인 열기' })); await user.click(screen.getByRole('button', { name: '뉴스 초안 한 건 저장 확인' })); await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  })

  it('derives category/date/settings stale without effect-mirrored authority', async () => {
    const view = renderWorkflow(); const user = await parseAndValidate()
    fireEvent.change(screen.getByLabelText('브리핑 날짜'), { target: { value: '2026-08-14' } }); expect(screen.getByText(/오래된 검증/u)).toBeInTheDocument()
    view.rerender(<MemoryRouter><NewsResponseImportWorkflow client={client} categories={categories.map((item) => item.id === 'economy' ? { ...item, slugPattern: 'economy-news-YYYY-MM-DD' } : item)} duplicateLookup={view.duplicateLookup} save={view.save} /><LocationProbe /></MemoryRouter>)
    expect(screen.getByRole('button', { name: '최종 저장 확인 열기' })).toBeDisabled(); expect(view.save).not.toHaveBeenCalled(); expect(user).toBeDefined()
  })
})
