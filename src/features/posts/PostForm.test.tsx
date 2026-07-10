import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../categories/categories.types'
import { PostForm } from './PostForm'
import type { PostDetail } from './posts.types'

const categories: Category[] = [
  {
    id: 'economy',
    content_group: 'news',
    name: '경제',
    sort_order: 10,
    display_id_pattern: '#YYYY-MM-DD-ECO',
    slug_pattern: 'economy-briefing-YYYY-MM-DD',
    wrapper_class: 'daily-brief-note news-briefing economy',
  },
  {
    id: 'ai-column',
    content_group: 'ai',
    name: 'AI 칼럼',
    sort_order: 60,
    display_id_pattern: 'AI-###',
    slug_pattern: 'ai-###',
    wrapper_class: 'daily-brief-note ai-column',
  },
]

const post: PostDetail = {
  id: 'post-1',
  category_id: 'economy',
  display_id: '#2026-07-10-ECO',
  series_no: null,
  briefing_date: '2026-07-10',
  published_on: null,
  title: '경제 브리핑',
  summary: '경제 브리핑 요약',
  html_body: null,
  slug: 'economy-briefing-2026-07-10',
  content_status: 'draft',
  wordpress_url: null,
  created_at: '2026-07-10T01:00:00Z',
  updated_at: '2026-07-10T01:00:00Z',
}

function renderCreateForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <PostForm
      mode="create"
      categories={categories}
      isSaving={false}
      submitError={null}
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

describe('PostForm', () => {
  it('renders the new content fields with draft as the only create status', () => {
    renderCreateForm()

    expect(screen.getByLabelText('카테고리')).toBeInTheDocument()
    expect(screen.getByLabelText('제목')).toBeInTheDocument()
    expect(screen.getByLabelText('요약')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '초안' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '발행 준비' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '발행됨' })).not.toBeInTheDocument()
  })

  it('shows required field errors next to the inputs', async () => {
    const browserUser = userEvent.setup()
    renderCreateForm()

    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))

    expect(await screen.findByText('카테고리를 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('제목을 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('요약을 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('slug를 입력해 주세요.')).toBeInTheDocument()
  })

  it('shows a slug format error before submit', async () => {
    const browserUser = userEvent.setup()
    renderCreateForm()

    await browserUser.selectOptions(screen.getByLabelText('카테고리'), 'ai-column')
    await browserUser.type(screen.getByLabelText('제목'), 'AI 칼럼')
    await browserUser.type(screen.getByLabelText('요약'), 'AI 칼럼 요약')
    await browserUser.type(screen.getByLabelText('Slug'), 'Bad--Slug')
    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))

    expect(
      await screen.findByText('slug는 영문 소문자, 숫자, 단일 하이픈만 사용할 수 있습니다.'),
    ).toBeInTheDocument()
  })

  it('requires a briefing date after selecting a news category', async () => {
    const browserUser = userEvent.setup()
    renderCreateForm()

    await browserUser.selectOptions(screen.getByLabelText('카테고리'), 'economy')
    await browserUser.type(screen.getByLabelText('제목'), '경제 브리핑')
    await browserUser.type(screen.getByLabelText('요약'), '경제 브리핑 요약')
    await browserUser.type(screen.getByLabelText('Slug'), 'economy-briefing')
    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))

    expect(
      await screen.findByText('뉴스 브리핑에는 브리핑 날짜가 필요합니다.'),
    ).toBeInTheDocument()
  })

  it('prevents a bodyless post from changing to ready or published', async () => {
    const browserUser = userEvent.setup()
    render(
      <PostForm
        mode="edit"
        categories={categories}
        post={post}
        isSaving={false}
        submitError={null}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await browserUser.selectOptions(screen.getByLabelText('상태'), 'ready')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))

    expect(
      await screen.findByText('본문을 작성한 후 상태를 변경할 수 있습니다.'),
    ).toBeInTheDocument()

    await browserUser.selectOptions(screen.getByLabelText('상태'), 'published')
    await browserUser.type(screen.getByLabelText('발행일'), '2026-07-10')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(screen.getByText('본문을 작성한 후 상태를 변경할 수 있습니다.')).toBeInTheDocument()
  })

  it('keeps identity fields locked on edit', () => {
    render(
      <PostForm
        mode="edit"
        categories={categories}
        post={post}
        isSaving={false}
        submitError={null}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByLabelText('카테고리')).toBeDisabled()
    expect(screen.getByLabelText('브리핑 날짜')).toBeDisabled()
    expect(screen.queryByLabelText('시리즈 번호')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('표시 ID')).not.toBeInTheDocument()
  })
})
