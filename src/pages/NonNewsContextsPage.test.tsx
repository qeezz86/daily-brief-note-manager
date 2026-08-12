import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../features/categories/categories.types'
import type { NonNewsContextItem } from '../features/nonNewsContexts/nonNewsContexts.types'
import type { DatabaseClient } from '../shared/supabase/client'
import { NonNewsContextsPageContent } from './NonNewsContextsPage'

const useNonNewsContextQueryMock = vi.hoisted(() => vi.fn())
const useActiveCategoriesQueryMock = vi.hoisted(() => vi.fn())

vi.mock('../features/nonNewsContexts/nonNewsContexts.queries', () => ({
  useNonNewsContextQuery: useNonNewsContextQueryMock,
}))

vi.mock('../features/categories/categories.queries', () => ({
  useActiveCategoriesQuery: useActiveCategoriesQueryMock,
}))

const client = {} as DatabaseClient
const item: NonNewsContextItem = {
  displayId: 'AI-001',
  seriesNo: 1,
  title: '기존 AI 글',
  slug: 'ai-001',
  summary: '요약',
  publishedOn: '2026-08-10',
  focusKeyword: 'AI',
  tags: ['인공지능'],
  fieldName: '기술',
  chineseMetadata: null,
}
const activeCategories: Category[] = [
  { id: 'ai-column', content_group: 'ai', name: 'AI 칼럼', sort_order: 60, display_id_pattern: 'AI-###', slug_pattern: 'ai-###', wrapper_class: 'daily-brief-note ai-column' },
  { id: 'info-db', content_group: 'info_db', name: '정보DB', sort_order: 70, display_id_pattern: '정보DB-###', slug_pattern: 'info-db-###', wrapper_class: 'daily-brief-note info-db' },
  { id: 'chinese-study', content_group: 'chinese', name: '중국어 학습', sort_order: 80, display_id_pattern: null, slug_pattern: 'cctv-chinese-news-###', wrapper_class: 'daily-brief-note chinese-study' },
]

function queryResult<T>(data: T | undefined, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  useNonNewsContextQueryMock.mockReset()
  useNonNewsContextQueryMock.mockReturnValue(queryResult([item]))
  useActiveCategoriesQueryMock.mockReset()
  useActiveCategoriesQueryMock.mockReturnValue(queryResult(activeCategories))
})

describe('NonNewsContextsPage', () => {
  it('offers exactly three frozen categories with deterministic AI default', () => {
    render(<NonNewsContextsPageContent client={client} />)
    const select = screen.getByLabelText('비뉴스 카테고리')
    expect(select).toHaveValue('ai-column')
    expect(screen.getAllByRole('option').map((option) => (option as HTMLOptionElement).value))
      .toEqual(['ai-column', 'info-db', 'chinese-study'])
    expect(useNonNewsContextQueryMock).toHaveBeenCalledWith(client, 'ai-column')
  })

  it('renders the loading state and withholds preview until data arrives', () => {
    useNonNewsContextQueryMock.mockReturnValue(queryResult(undefined, { isPending: true, isFetching: true }))
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByRole('status')).toHaveTextContent('컨텍스트 항목을 불러오고 있습니다.')
    expect(screen.queryByLabelText('복사용 비뉴스 컨텍스트')).not.toBeInTheDocument()
  })

  it('renders populated count and deterministic preview', () => {
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByLabelText('사용 항목 수')).toHaveTextContent('1최대 20개')
    expect(screen.getByText('사용 항목 1개 / 최대 20개')).toBeInTheDocument()
    expect((screen.getByLabelText('복사용 비뉴스 컨텍스트') as HTMLTextAreaElement).value)
      .toContain('제목: 기존 AI 글')
    expect(screen.getByRole('heading', { name: '비뉴스 새 글 작성 프롬프트' })).toBeInTheDocument()
  })

  it('renders an explicit empty state and copyable empty context', () => {
    useNonNewsContextQueryMock.mockReturnValue(queryResult([]))
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByRole('status')).toHaveTextContent('선택한 카테고리에 기존 글이 없습니다.')
    expect((screen.getByLabelText('복사용 비뉴스 컨텍스트') as HTMLTextAreaElement).value)
      .toContain('기존 글이 없습니다.')
    expect(screen.getByText('사용 항목 0개 / 최대 20개')).toBeInTheDocument()
  })

  it('renders a safe repository error without a preview', () => {
    useNonNewsContextQueryMock.mockReturnValue(queryResult(undefined, {
      isError: true,
      error: new Error('비뉴스 중복 방지 컨텍스트를 불러오지 못했습니다.'),
    }))
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByRole('alert')).toHaveTextContent('비뉴스 중복 방지 컨텍스트를 불러오지 못했습니다.')
    expect(screen.queryByLabelText('복사용 비뉴스 컨텍스트')).not.toBeInTheDocument()
  })

  it('reloads automatically with the selected category and correct maximum', async () => {
    const user = userEvent.setup()
    useNonNewsContextQueryMock.mockImplementation((_client, categoryId: string) => queryResult([
      { ...item, displayId: categoryId === 'info-db' ? '정보DB-001' : 'AI-001' },
    ]))
    render(<NonNewsContextsPageContent client={client} />)
    await user.selectOptions(screen.getByLabelText('비뉴스 카테고리'), 'info-db')
    expect(useNonNewsContextQueryMock).toHaveBeenLastCalledWith(client, 'info-db')
    expect(screen.getByText('사용 항목 1개 / 최대 30개')).toBeInTheDocument()
    expect((screen.getByLabelText('복사용 비뉴스 컨텍스트') as HTMLTextAreaElement).value)
      .toContain('카테고리: 정보DB (info-db)')
  })

  it('integrates the copy action without a persisted save action', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<NonNewsContextsPageContent client={client} />)
    await user.click(screen.getByRole('button', { name: '컨텍스트 복사' }))
    expect(writeText).toHaveBeenCalledWith((screen.getByLabelText('복사용 비뉴스 컨텍스트') as HTMLTextAreaElement).value)
    expect(await screen.findByText('컨텍스트를 복사했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument()
  })

  it('keeps the Phase 5I context and Phase 5J composer as coexisting separate steps', async () => {
    const user = userEvent.setup()
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByLabelText('복사용 비뉴스 컨텍스트')).toBeInTheDocument()
    await user.type(screen.getByLabelText('새 글 주제'), 'AI 에이전트 입문')
    await user.click(screen.getByRole('button', { name: '작성 프롬프트 생성' }))
    expect(screen.getByLabelText('복사용 비뉴스 작성 프롬프트')).toBeInTheDocument()
    expect(screen.getByLabelText('복사용 비뉴스 컨텍스트')).toBeInTheDocument()
  })

  it('marks an existing authoring preview stale after the page-owned category changes', async () => {
    const user = userEvent.setup()
    useNonNewsContextQueryMock.mockImplementation((_client, categoryId: string) => queryResult([
      { ...item, displayId: categoryId === 'info-db' ? '정보DB-001' : 'AI-001' },
    ]))
    render(<NonNewsContextsPageContent client={client} />)
    await user.type(screen.getByLabelText('새 글 주제'), '산업 AI')
    await user.click(screen.getByRole('button', { name: '작성 프롬프트 생성' }))
    await user.selectOptions(screen.getByLabelText('비뉴스 카테고리'), 'info-db')
    expect(screen.getByRole('status')).toHaveTextContent('오래된 미리보기')
    expect(screen.getByRole('button', { name: '작성 프롬프트 복사' })).toBeDisabled()
  })

  it('marks the preview stale when active settings and Phase 5I context reload', async () => {
    const user = userEvent.setup()
    let contextItems = [item]
    let categories = activeCategories
    useNonNewsContextQueryMock.mockImplementation(() => queryResult(contextItems))
    useActiveCategoriesQueryMock.mockImplementation(() => queryResult(categories))
    const view = render(<NonNewsContextsPageContent client={client} />)
    await user.type(screen.getByLabelText('새 글 주제'), '산업 AI')
    await user.click(screen.getByRole('button', { name: '작성 프롬프트 생성' }))
    contextItems = [{ ...item, title: '새로 불러온 기존 글' }]
    categories = activeCategories.map((category) => category.id === 'ai-column'
      ? { ...category, slug_pattern: 'ai-column-###' }
      : category)
    view.rerender(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByRole('status')).toHaveTextContent('오래된 미리보기')
    expect(screen.getByRole('button', { name: '작성 프롬프트 복사' })).toBeDisabled()
  })

  it('preserves the context workflow when active category settings fail', () => {
    useActiveCategoriesQueryMock.mockReturnValue(queryResult(undefined, {
      isError: true,
      error: new Error('카테고리를 불러오지 못했습니다.'),
    }))
    render(<NonNewsContextsPageContent client={client} />)
    expect(screen.getByLabelText('복사용 비뉴스 컨텍스트')).toBeInTheDocument()
    expect(screen.getByText('활성 카테고리 설정을 불러오지 못해 작성 프롬프트를 생성할 수 없습니다.')).toBeInTheDocument()
  })

  it('shows the existing Supabase configuration error state', () => {
    render(<NonNewsContextsPageContent client={null} />)
    expect(screen.getByRole('heading', { name: 'Supabase 연결이 설정되지 않았습니다' })).toBeInTheDocument()
  })
})
