import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../shared/supabase/client'
import { importCategories, validImportBundle } from '../features/imports/imports.fixtures'
import { ImportPageContent } from './ImportPage'

vi.mock('../features/imports/importDuplicates.queries', () => ({
  useImportCategoriesQuery: () => ({ data: importCategories, isPending: false, isError: false }),
}))

vi.mock('../features/imports/importDuplicates.repository', () => ({
  collectImportDuplicateCandidates: () => ({ slugs: [], wordpressUrls: [], briefingDates: [], seriesNumbers: [], chineseOriginalUrls: [], newsTopicKeys: [] }),
  getImportDuplicateReferenceData: () => Promise.resolve({ databaseCheck: 'complete', referenceData: { posts: [], chineseUrls: [], newsTopics: [], existingTagKeys: [] } }),
}))

const client = {} as DatabaseClient
const validText = JSON.stringify(validImportBundle())

async function switchToTextAndValidate(text = validText) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'JSON text' }))
  fireEvent.change(screen.getByLabelText('JSON text'), { target: { value: text } })
  await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
  return user
}

describe('ImportPageContent', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('Dry Run 안내와 입력 방식을 렌더링한다', () => {
    render(<ImportPageContent client={client} />)
    expect(screen.getByRole('heading', { name: '콘텐츠 가져오기' })).toBeInTheDocument()
    expect(screen.getByText('Dry Run 전용')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Import 실행/ })).not.toBeInTheDocument()
  })

  it('붙여넣은 JSON을 검증하고 요약을 표시한다', async () => {
    render(<ImportPageContent client={client} />)
    await switchToTextAndValidate()
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
    expect(screen.getByText('schema v1 · DB 중복 검사 완료')).toBeInTheDocument()
  })

  it('invalid JSON 오류를 표시한다', async () => {
    render(<ImportPageContent client={client} />)
    await switchToTextAndValidate('{')
    expect((await screen.findAllByText(/올바른 JSON 형식이 아닙니다\./)).length).toBeGreaterThan(0)
  })

  it('JSON 파일을 File API로 읽는다', async () => {
    const user = userEvent.setup()
    render(<ImportPageContent client={client} />)
    const file = new File([validText], 'import.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('JSON 파일'), file)
    expect(screen.getByText(/import.json/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
    expect(await screen.findByRole('heading', { name: 'Dry Run 요약' })).toBeInTheDocument()
  })

  it('json 확장자가 아닌 파일을 차단한다', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<ImportPageContent client={client} />)
    await user.upload(screen.getByLabelText('JSON 파일'), new File(['{}'], 'import.txt', { type: 'text/plain' }))
    await user.click(screen.getByRole('button', { name: 'Dry Run 검증' }))
    expect(screen.getByRole('alert')).toHaveTextContent('.json 확장자')
  })

  it('상태와 category 필터를 제공한다', async () => {
    render(<ImportPageContent client={client} />)
    const user = await switchToTextAndValidate()
    expect(screen.getByLabelText('상태')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('카테고리'), 'ai-column')
    expect(screen.getByText('검색 결과 0개')).toBeInTheDocument()
  })

  it('제목과 slug를 검색한다', async () => {
    render(<ImportPageContent client={client} />)
    const user = await switchToTextAndValidate()
    await user.type(screen.getByPlaceholderText('제목, slug, ID, series'), '없는 제목')
    expect(screen.getByText('검색 결과 0개')).toBeInTheDocument()
  })

  it('항목 상세에 정규화 preview를 표시하고 HTML 원문은 렌더링하지 않는다', async () => {
    render(<ImportPageContent client={client} />)
    const user = await switchToTextAndValidate()
    await user.click(screen.getByText(/1\. 경제 핵심 뉴스/))
    expect(screen.getByRole('heading', { name: '정규화 미리보기' })).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/HTML 원문은 표시하거나 복사하지 않습니다/)).toBeInTheDocument()
  })

  it('전체 결과 JSON을 복사한다', async () => {
    render(<ImportPageContent client={client} />)
    const user = await switchToTextAndValidate()
    await user.click(screen.getByRole('button', { name: '전체 결과 복사' }))
    expect(await screen.findByText('전체 Dry Run 결과를 복사했습니다.')).toBeInTheDocument()
  })

  it('입력이 변경되면 이전 결과를 초기화한다', async () => {
    render(<ImportPageContent client={client} />)
    await switchToTextAndValidate()
    fireEvent.change(screen.getByLabelText('JSON text'), { target: { value: '{}' } })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dry Run 요약' })).not.toBeInTheDocument())
  })

  it('입력 초기화가 text와 결과를 지운다', async () => {
    render(<ImportPageContent client={client} />)
    const user = await switchToTextAndValidate()
    await user.click(screen.getByRole('button', { name: '입력 초기화' }))
    expect(screen.getByLabelText('JSON text')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Dry Run 요약' })).not.toBeInTheDocument()
  })

  it('결과 JSON에는 원본 htmlBody가 포함되지 않는다', async () => {
    render(<ImportPageContent client={client} />)
    await switchToTextAndValidate()
    const output = screen.getByLabelText('다운로드용 검증 결과 JSON text')
    expect((output as HTMLTextAreaElement).value).not.toContain('<div class=')
    expect((output as HTMLTextAreaElement).value).toContain('checksum')
  })
})
