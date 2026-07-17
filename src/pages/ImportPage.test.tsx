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

vi.mock('../features/imports/importDuplicates.queries', () => ({
  useImportCategoriesQuery: () => ({ data: importCategories, isPending: false, isError: false }),
}))

vi.mock('../features/imports/importDuplicates.repository', () => ({
  collectImportDuplicateCandidates: () => ({ slugs: [], wordpressUrls: [], briefingDates: [], seriesNumbers: [], chineseOriginalUrls: [], newsTopicKeys: [] }),
  getImportDuplicateReferenceData: duplicateLookupMock,
}))

vi.mock('../features/imports/prepareImportJob', () => ({ prepareImportJob: prepareImportJobMock }))

const client = {} as DatabaseClient
const validText = JSON.stringify(validImportBundle())

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
})
