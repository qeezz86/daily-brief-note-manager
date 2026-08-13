import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { DatabaseClient } from '../shared/supabase/client'
import * as importAnalysisModule from '../features/imports/importAnalysis.module'
import { importCategories, validImportBundle } from '../features/imports/imports.fixtures'
import { ImportPageContent } from './ImportPage'

const prepareImportJobMock = vi.hoisted(() => vi.fn())
const duplicateLookupMock = vi.hoisted(() => vi.fn())
const saveChatGptPastePostMock = vi.hoisted(() => vi.fn())
const saveWordPressManualPostMock = vi.hoisted(() => vi.fn())

vi.mock('../features/imports/importDuplicates.queries', () => ({
  useImportCategoriesQuery: () => ({ data: importCategories, isPending: false, isError: false }),
}))

vi.mock('../features/imports/importDuplicates.repository', () => ({
  collectImportDuplicateCandidates: () => ({ slugs: [], wordpressUrls: [], briefingDates: [], seriesNumbers: [], chineseOriginalUrls: [], newsTopicKeys: [] }),
  getImportDuplicateReferenceData: duplicateLookupMock,
}))

vi.mock('../features/imports/prepareImportJob', () => ({ prepareImportJob: prepareImportJobMock }))

vi.mock('../features/imports/chatGptPaste.repository', () => ({ saveChatGptPastePost: saveChatGptPastePostMock }))
vi.mock('../features/imports/wordPressManual.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/imports/wordPressManual.repository')>()
  return { ...actual, saveWordPressManualPost: saveWordPressManualPostMock }
})

const client = {} as DatabaseClient
const validText = JSON.stringify(validImportBundle())
const validPasteText = `[CONTENT_META_JSON]\n{"contentGroup":"news","category":"economy","displayId":"#2026-08-01-ECO","title":"경제 브리핑","slug":"economy-briefing-2026-08-01","publishedOn":"2026-08-01","publishedAt":null}\n[/CONTENT_META_JSON]\n[SEO_JSON]\n{"representativeTitle":"대표 제목","alternativeTitles":["1","2","3","4"],"metaDescription":"${'가'.repeat(120)}","focusKeyword":"경제","tags":["금리","환율","물가","산업","정책"]}\n[/SEO_JSON]\n[IMAGE_PROMPT_JSON]\n{"prompt":"장면","alt":"장면"}\n[/IMAGE_PROMPT_JSON]\n[SOURCES_JSON]\n[]\n[/SOURCES_JSON]\n[WORDPRESS_HTML]\n<div class="daily-brief-note news-briefing economy"><h1>경제 브리핑</h1></div>\n[/WORDPRESS_HTML]`

function renderPage(loadAnalysisModule: () => Promise<typeof importAnalysisModule> = () => Promise.resolve(importAnalysisModule)) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { ...render(<QueryClientProvider client={queryClient}><MemoryRouter><ImportPageContent client={client} userId="owner" loadAnalysisModule={loadAnalysisModule} /></MemoryRouter></QueryClientProvider>), queryClient }
}

async function switchToTextAndValidate(text = validText) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'JSON text' }))
  fireEvent.change(screen.getByLabelText('JSON text'), { target: { value: text } })
  await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
  return user
}

describe('ImportPageContent', () => {
  beforeEach(() => {
    duplicateLookupMock.mockReset().mockResolvedValue({ databaseCheck: 'complete', referenceData: { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] } })
    prepareImportJobMock.mockReset().mockResolvedValue({ jobId: '00000000-0000-0000-0000-000000000001', isExisting: false, status: 'ready', sourceFingerprint: 'a'.repeat(64) })
    saveChatGptPastePostMock.mockReset()
    saveWordPressManualPostMock.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('Dry Run 안내와 입력 방식을 렌더링한다', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: '콘텐츠 가져오기' })).toBeInTheDocument()
    expect(screen.getByText('Phase 4A-4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import 작업 만들기' })).not.toBeInTheDocument()
  })

  it('붙여넣은 JSON을 검증하고 요약을 표시한다', async () => {
    renderPage()
    await switchToTextAndValidate()
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    expect(screen.getByText('schema v1 · DB 중복 검사 완료')).toBeInTheDocument()
  })
  it('초기 렌더에서는 analysis module을 불러오지 않고 Dry Run에서 로딩한다', async () => {
    let resolve!: (value: typeof importAnalysisModule) => void
    const loadAnalysisModule = vi.fn(() => new Promise<typeof importAnalysisModule>((done) => { resolve = done }))
    renderPage(loadAnalysisModule)
    expect(loadAnalysisModule).not.toHaveBeenCalled()

    const validation = switchToTextAndValidate()
    expect(await screen.findByRole('status')).toHaveTextContent('가져오기 분석 도구를 불러오는 중입니다.')
    expect(screen.getByRole('button', { name: '검증 중' })).toBeDisabled()
    await act(async () => { resolve(importAnalysisModule) })
    await validation
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    expect(loadAnalysisModule).toHaveBeenCalledOnce()
  })
  it('analysis module 오류를 안전하게 표시하고 입력을 유지한 채 재시도한다', async () => {
    const loadAnalysisModule = vi.fn()
      .mockRejectedValueOnce(new Error('/assets/private-import.js'))
      .mockResolvedValueOnce(importAnalysisModule)
    renderPage(loadAnalysisModule)
    await switchToTextAndValidate()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('IMPORT_MODULE_LOAD_FAILED')
    expect(alert).not.toHaveTextContent('private-import')
    expect(screen.getByLabelText('JSON text')).toHaveValue(validText)
    await userEvent.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    expect(loadAnalysisModule).toHaveBeenCalledTimes(2)
  })

  it('invalid JSON 오류를 표시한다', async () => {
    renderPage()
    await switchToTextAndValidate('{')
    expect((await screen.findAllByText(/올바른 JSON 형식이 아닙니다\./)).length).toBeGreaterThan(0)
  })

  it('JSON 파일을 File API로 읽는다', async () => {
    const user = userEvent.setup()
    renderPage()
    const file = new File([validText], 'import.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('JSON 파일'), file)
    expect(screen.getByText(/import.json/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
  })

  it('json 확장자가 아닌 파일을 차단한다', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderPage()
    await user.upload(screen.getByLabelText('JSON 파일'), new File(['{}'], 'import.txt', { type: 'text/plain' }))
    await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
    expect(screen.getByRole('alert')).toHaveTextContent('.json 확장자')
  })

  it('상태와 category 필터를 제공한다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    expect(screen.getByLabelText('상태')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'ai-column')
    expect(screen.getByText('검색 결과 0개')).toBeInTheDocument()
  })

  it('제목과 slug를 검색한다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    await user.type(screen.getByPlaceholderText('제목, slug, ID, series'), '없는 제목')
    expect(screen.getByText('검색 결과 0개')).toBeInTheDocument()
  })

  it('항목 상세에 정규화 preview를 표시하고 HTML 원문은 렌더링하지 않는다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    await user.click(screen.getByText(/1\. 경제 핵심 뉴스/))
    expect(screen.getByRole('heading', { name: '정규화 미리보기' })).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/HTML 원문은 표시하거나 복사하지 않습니다/)).toBeInTheDocument()
  })

  it('전체 결과 JSON을 복사한다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    await user.click(screen.getByRole('button', { name: '전체 결과 복사' }))
    expect(await screen.findByText('전체 Dry Run 결과를 복사했습니다.')).toBeInTheDocument()
  })

  it('입력이 변경되면 이전 결과를 초기화한다', async () => {
    renderPage()
    await switchToTextAndValidate()
    fireEvent.change(screen.getByLabelText('JSON text'), { target: { value: '{}' } })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dry Run 요약' })).not.toBeInTheDocument())
  })

  it('입력 초기화가 text와 결과를 지운다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    await user.click(screen.getByRole('button', { name: '입력 초기화' }))
    expect(screen.getByLabelText('JSON text')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Dry Run 요약' })).not.toBeInTheDocument()
  })

  it('결과 JSON에는 원본 htmlBody가 포함되지 않는다', async () => {
    renderPage()
    await switchToTextAndValidate()
    const output = screen.getByLabelText('다운로드용 검증 결과 JSON text')
    expect((output as HTMLTextAreaElement).value).not.toContain('<div class=')
    expect((output as HTMLTextAreaElement).value).toContain('checksum')
  })

  it('ready 항목을 기본 선택하고 complete 상태에서 Import를 허용한다', async () => {
    renderPage(); await switchToTextAndValidate()
    expect(await screen.findByRole('button', { name: 'Import 작업 만들기' })).toBeEnabled()
    expect(screen.getByText('선택 1개')).toBeInTheDocument()
  })

  it('최종 확인을 취소하면 RPC를 호출하지 않는다', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    renderPage(); const user = await switchToTextAndValidate(); await user.click(await screen.findByRole('button', { name: 'Import 작업 만들기' }))
    expect(await screen.findByText('Import 작업 생성을 취소했습니다.')).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
  })

  it('직전 중복 재검사 후 영구 job snapshot을 준비한다', async () => {
    renderPage(); const user = await switchToTextAndValidate(); await user.click(await screen.findByRole('button', { name: 'Import 작업 만들기' }))
    await waitFor(() => expect(prepareImportJobMock).toHaveBeenCalledTimes(1))
    expect(prepareImportJobMock).toHaveBeenCalledWith(client, expect.objectContaining({ format: 'daily-brief-note-content-import', schemaVersion: 1 }))
  })

  it('warning은 승인 전 기본 미선택이며 승인 후 개별 선택한다', async () => {
    const warningText = JSON.stringify(validImportBundle([{ ...validImportBundle().posts[0], seo: { ...validImportBundle().posts[0].seo!, metaDescription: 'short' } }]))
    renderPage(); const user = await switchToTextAndValidate(warningText)
    const importButton = await screen.findByRole('button', { name: 'Import 작업 만들기' })
    expect(importButton).toBeDisabled()
    await user.click(screen.getByLabelText('경고 확인'))
    const selection = screen.getByLabelText('Import 선택'); expect(selection).toBeEnabled(); await user.click(selection)
    expect(importButton).toBeEnabled()
  })

  it.each(['partial', 'unavailable'] as const)('%s DB lookup이면 실제 Import를 차단한다', async (databaseCheck) => {
    duplicateLookupMock.mockResolvedValueOnce({ databaseCheck, referenceData: { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] } })
    renderPage(); await switchToTextAndValidate()
    expect(await screen.findByRole('button', { name: 'Import 작업 만들기' })).toBeDisabled()
    expect(screen.getByText(/DB 중복 검사가 complete가 아니므로 작업을 만들 수 없습니다/)).toBeInTheDocument()
  })

  it('Import 직전 새 duplicate를 발견하면 RPC 없이 건너뛴다', async () => {
    duplicateLookupMock
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] } })
      .mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: { posts: [{ categoryId: 'economy', title: '기존', slug: 'economy-briefing-2026-07-12', displayId: null, seriesNo: null, briefingDate: null, publishedOn: null, wordpressUrl: null }], chineseUrls: [], newsTopics: [], existingTagKeys: [] } })
    renderPage(); const user = await switchToTextAndValidate(); await user.click(await screen.findByRole('button', { name: 'Import 작업 만들기' }))
    expect(await screen.findByText(/Import 직전 새 중복 또는 검증 오류/)).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
  })

  it('Import 직전 duplicate 재조회 실패 시 저장을 중단한다', async () => {
    duplicateLookupMock.mockResolvedValueOnce({ databaseCheck: 'complete', referenceData: { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] } }).mockRejectedValueOnce(new Error('network raw error'))
    renderPage(); const user = await switchToTextAndValidate(); await user.click(await screen.findByRole('button', { name: 'Import 작업 만들기' }))
    expect(await screen.findByText(/Import 작업 준비에 실패했습니다/)).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
  })

  it('확인 dialog에 rollback·기존 글·뉴스 추적 안내를 표시한다', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    renderPage(); const user = await switchToTextAndValidate(); await user.click(await screen.findByRole('button', { name: 'Import 작업 만들기' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('영구 Import 작업'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('별도 transaction'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('tracking 실패 시 콘텐츠는 유지'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('작업 생성 후 상세 화면'))
  })

  it('세션 실행 결과 대신 영구 작업 이력 링크를 제공한다', async () => {
    renderPage(); await switchToTextAndValidate()
    expect(screen.getByRole('link', { name: '작업 이력' })).toHaveAttribute('href', '/imports/history')
    expect(screen.queryByRole('button', { name: '결과 복사' })).not.toBeInTheDocument()
  })

  it('기존 JSON, ChatGPT, WordPress HTML과 새 비뉴스 응답을 접근 가능한 additive mode로 제공하고 JSON을 기본 유지한다', () => {
    renderPage()
    expect(screen.getByRole('radio', { name: '기존 JSON Import' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '비뉴스 일반 응답 붙여넣기' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'WordPress HTML 붙여넣기' })).not.toBeChecked()
    expect(screen.getByRole('group', { name: '가져오기 방식' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ChatGPT 구조화 응답 붙여넣기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'WordPress HTML 붙여넣기' })).not.toBeInTheDocument()
  })

  it('붙여넣기 mode 전환만으로 persistence를 호출하지 않는다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }))
    expect(await screen.findByRole('heading', { name: 'ChatGPT 구조화 응답 붙여넣기' })).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
    expect(saveChatGptPastePostMock).not.toHaveBeenCalled()
  })

  it('비뉴스 일반 응답 mode를 기존 /imports 경계에서 lazy 렌더링하고 전환만으로 저장하지 않는다', async () => {
    renderPage()
    expect(screen.queryByLabelText('비뉴스 canonical 10-section 응답 plain text')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '비뉴스 일반 응답 붙여넣기' }))
    expect(await screen.findByRole('heading', { name: '비뉴스 일반 응답 붙여넣기' })).toBeInTheDocument()
    expect(screen.getByLabelText('카테고리')).toBeInTheDocument()
    expect(screen.getByLabelText('시리즈 번호')).toBeInTheDocument()
    expect(screen.getByLabelText('비뉴스 canonical 10-section 응답 plain text')).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
    expect(saveChatGptPastePostMock).not.toHaveBeenCalled()
    expect(saveWordPressManualPostMock).not.toHaveBeenCalled()
  })

  it('WordPress workflow를 mode 선택 시에만 lazy 렌더링하고 전환만으로 저장하지 않는다', async () => {
    renderPage()
    expect(screen.queryByLabelText('WordPress HTML 원문')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'WordPress HTML 붙여넣기' }))
    expect(await screen.findByRole('heading', { name: 'WordPress HTML 붙여넣기' })).toBeInTheDocument()
    expect(screen.getByLabelText('WordPress HTML 원문')).toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
    expect(saveChatGptPastePostMock).not.toHaveBeenCalled()
    expect(saveWordPressManualPostMock).not.toHaveBeenCalled()
  })

  it('네 mode의 UI state와 persistence 경계를 서로 격리한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: 'WordPress HTML 붙여넣기' }))
    fireEvent.change(await screen.findByLabelText('WordPress HTML 원문'), { target: { value: '<div>draft</div>' } })
    await user.click(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }))
    expect(await screen.findByLabelText('구조화 ChatGPT 응답 plain text')).toBeInTheDocument()
    expect(screen.queryByLabelText('WordPress HTML 원문')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '기존 JSON Import' }))
    expect(screen.getByLabelText('JSON 파일')).toBeInTheDocument()
    expect(screen.queryByLabelText('구조화 ChatGPT 응답 plain text')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '비뉴스 일반 응답 붙여넣기' }))
    expect(await screen.findByLabelText('비뉴스 canonical 10-section 응답 plain text')).toBeInTheDocument()
    expect(screen.queryByLabelText('JSON 파일')).not.toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
    expect(saveChatGptPastePostMock).not.toHaveBeenCalled()
    expect(saveWordPressManualPostMock).not.toHaveBeenCalled()
  })

  it('붙여넣기 parser workflow에서 차단 상태와 valid save 상태를 구분한다', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }))
    fireEvent.change(await screen.findByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: '[CONTENT_META_JSON]\n{}\n[/CONTENT_META_JSON]' } })
    await user.click(screen.getByRole('button', { name: '로컬 미리보기 생성' }))
    expect(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '붙여넣기 초기화' }))
    fireEvent.change(screen.getByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: validPasteText } })
    await user.click(screen.getByRole('button', { name: '로컬 미리보기 생성' }))
    expect(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })).toBeEnabled()
  })

  it('mode를 왕복해도 기존 JSON Dry Run과 붙여넣기 오류가 서로 제출되지 않는다', async () => {
    renderPage()
    const user = await switchToTextAndValidate()
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }))
    fireEvent.change(await screen.findByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: 'invalid' } })
    await user.click(screen.getByRole('button', { name: '로컬 미리보기 생성' }))
    expect(screen.getByRole('alert')).toHaveTextContent('차단 오류')
    await user.click(screen.getByRole('radio', { name: '기존 JSON Import' }))
    expect(screen.getByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    expect(screen.queryByText(/구조화 section 밖/)).not.toBeInTheDocument()
    expect(prepareImportJobMock).not.toHaveBeenCalled()
  })

  it('모바일에서도 사용할 explicit input, preview, reset label을 제공한다', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('radio', { name: 'ChatGPT 구조화 붙여넣기' }))
    expect(await screen.findByLabelText('구조화 ChatGPT 응답 plain text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로컬 미리보기 생성' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '붙여넣기 초기화' })).toBeInTheDocument()
  })
})
