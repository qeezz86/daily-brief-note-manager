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
    id: 'technology', content_group: 'news', name: '과학기술', sort_order: 30,
    display_id_pattern: '#YYYY-MM-DD-TEC', slug_pattern: 'technology-briefing-YYYY-MM-DD',
    wrapper_class: 'daily-brief-note news-briefing technology',
  },
  {
    id: 'climate-energy', content_group: 'news', name: '환경·에너지', sort_order: 50,
    display_id_pattern: '#YYYY-MM-DD-ENV', slug_pattern: 'climate-energy-briefing-YYYY-MM-DD',
    wrapper_class: 'daily-brief-note news-briefing climate-energy',
  },
  {
    id: 'info-db', content_group: 'info_db', name: '정보DB', sort_order: 70,
    display_id_pattern: '정보DB-###', slug_pattern: 'info-db-###', wrapper_class: 'daily-brief-note info-db',
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
  {
    id: 'chinese-study', content_group: 'chinese', name: '중국어 학습', sort_order: 80,
    display_id_pattern: null, slug_pattern: 'cctv-chinese-news-###',
    wrapper_class: 'daily-brief-note chinese-study',
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
  image_prompt: null,
  image_alt: null,
  image_prompt_version: 1,
  image_prompt_updated_at: null,
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
  it('shows AI and information-DB metadata only for their content groups', () => {
    render(<PostForm mode="edit" categories={categories} post={{ ...post, category_id: 'ai-column', display_id: 'AI-001', series_no: 1, briefing_date: null }} isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByRole('group', { name: 'AI 칼럼 정보' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '정보DB 정보' })).not.toBeInTheDocument()
    render(<PostForm mode="edit" categories={categories} post={{ ...post, category_id: 'info-db', display_id: '정보DB-001', series_no: 1, briefing_date: null }} isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByRole('group', { name: '정보DB 정보' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('기준일')).toHaveLength(1)
  })
  it('shows Chinese metadata fields only for the Chinese study category', () => {
    render(
      <PostForm mode="edit" categories={categories} post={{ ...post, category_id: 'chinese-study', display_id: null, series_no: 1, briefing_date: null }}
        isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    expect(screen.getByRole('group', { name: '중국어 학습 정보' })).toBeInTheDocument()
    expect(screen.getByLabelText('학습 주제')).toBeInTheDocument()
    expect(screen.getByLabelText('본편 목록 포함 여부')).toHaveValue('')

    render(
      <PostForm mode="edit" categories={categories} post={post}
        isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    expect(screen.getAllByLabelText('학습 주제')).toHaveLength(1)
  })

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

  it.each([
    ['technology', 'technology-briefing-2026-07-16'],
    ['climate-energy', 'climate-energy-briefing-2026-07-16'],
  ])('%s 선택과 날짜 변경 시 slug 미리보기를 갱신한다', async (categoryId, expected) => {
    const browserUser = userEvent.setup()
    renderCreateForm()
    await browserUser.selectOptions(screen.getByLabelText('카테고리'), categoryId)
    await browserUser.type(screen.getByLabelText('브리핑 날짜'), '2026-07-16')
    expect(screen.getByLabelText('Slug')).toHaveValue(expected)
    expect(screen.getByText(new RegExp(`미리보기: ${expected}`))).toBeInTheDocument()
  })

  it('중국어 학습 current slug 형식 예시를 표시하고 이전 pattern을 거부한다', async () => {
    const browserUser = userEvent.setup()
    renderCreateForm()
    await browserUser.selectOptions(screen.getByLabelText('카테고리'), 'chinese-study')
    expect(screen.getByText(/형식 예시: cctv-chinese-news-001/)).toBeInTheDocument()
    await browserUser.type(screen.getByLabelText('제목'), '중국어 학습')
    await browserUser.type(screen.getByLabelText('요약'), '중국어 학습 요약')
    await browserUser.type(screen.getByLabelText('Slug'), 'cctv-chinese-news-study-001')
    await browserUser.click(screen.getByRole('button', { name: '콘텐츠 저장' }))
    expect(await screen.findByText(/cctv-chinese-news-###/)).toBeInTheDocument()
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
      await screen.findByText('발행 준비 또는 발행됨 상태에는 WordPress 본문 HTML이 필요합니다.'),
    ).toBeInTheDocument()

    await browserUser.selectOptions(screen.getByLabelText('상태'), 'published')
    await browserUser.type(screen.getByLabelText('발행일'), '2026-07-10')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(screen.getByText('발행 준비 또는 발행됨 상태에는 WordPress 본문 HTML이 필요합니다.')).toBeInTheDocument()
  })

  it('renders HTML, SEO, and image fields on edit', () => {
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

    expect(screen.getByLabelText('HTML 본문')).toBeInTheDocument()
    expect(screen.getByLabelText('SEO 대표 제목')).toBeInTheDocument()
    expect(screen.getByLabelText('대안 제목 4')).toBeInTheDocument()
    expect(screen.getByLabelText('메타 설명')).toBeInTheDocument()
    expect(screen.getByLabelText('포커스 키워드')).toBeInTheDocument()
    expect(screen.getByLabelText('이미지 프롬프트')).toBeInTheDocument()
    expect(screen.getByLabelText('이미지 ALT 문구')).toBeInTheDocument()
  })

  it('allows a draft to save with empty HTML, SEO, and image fields', async () => {
    const browserUser = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <PostForm
        mode="edit"
        categories={categories}
        post={post}
        isSaving={false}
        submitError={null}
        onSubmit={onSubmit}
      />,
    )

    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ htmlBody: '', contentStatus: 'draft' }),
    )
  })

  it('기존 legacy slug는 unrelated save에서 보존하고 slug 변경에는 current pattern을 요구한다', async () => {
    const browserUser = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const legacyPost = { ...post, category_id: 'technology', slug: 'science-tech-briefing-2026-07-10' }
    render(<PostForm mode="edit" categories={categories} post={legacyPost} isSaving={false} submitError={null} onSubmit={onSubmit} />)

    await browserUser.type(screen.getByLabelText('요약'), ' 수정')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ slug: legacyPost.slug }))

    await browserUser.clear(screen.getByLabelText('Slug'))
    await browserUser.type(screen.getByLabelText('Slug'), 'science-tech-briefing-2026-07-11')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))
    expect(await screen.findByText(/technology-briefing-YYYY-MM-DD/)).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('runs strict validation when a draft contains HTML', async () => {
    const browserUser = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <PostForm
        mode="edit"
        categories={categories}
        post={post}
        isSaving={false}
        submitError={null}
        onSubmit={onSubmit}
      />,
    )

    await browserUser.type(screen.getByLabelText('HTML 본문'), '<h1>wrapper 없음</h1>')
    await browserUser.click(screen.getByRole('button', { name: '변경 사항 저장' }))

    expect(await screen.findByText('HTML을 수정해 주세요')).toBeInTheDocument()
    expect(screen.getAllByText('최상위 wrapper가 없습니다.').length).toBeGreaterThan(0)
    expect(onSubmit).not.toHaveBeenCalled()
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

  it('adds normalized tags with Enter, shows the count, and removes them accessibly', async () => {
    const browserUser = userEvent.setup()
    render(
      <PostForm mode="edit" categories={categories} post={post} isSaving={false}
        submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    const input = screen.getByLabelText('태그 추가')
    await browserUser.type(input, '  AI   기술  {Enter}')
    expect(screen.getByText('현재 1개 · 발행 준비·발행됨은 5~8개')).toBeInTheDocument()
    expect(screen.getByText('AI 기술')).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'AI 기술 태그 삭제' }))
    expect(screen.getByText('등록된 태그가 없습니다.')).toBeInTheDocument()
  })

  it('immediately blocks duplicate, brand, and category-name tags', async () => {
    const browserUser = userEvent.setup()
    render(
      <PostForm mode="edit" categories={categories} post={post} postTags={[{ id: 'tag-1', name: 'AI 기술' }]}
        isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    const input = screen.getByLabelText('태그 추가')
    await browserUser.type(input, ' ai   기술 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('동일한 태그')
    await browserUser.clear(input)
    await browserUser.type(input, 'DailyBriefNote{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Daily Brief Note')
    await browserUser.clear(input)
    await browserUser.type(input, '경제{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('카테고리명')
  })

  it('blocks separator-only duplicates and shows conservative near-duplicate guidance without auto-fixing', async () => {
    const browserUser = userEvent.setup()
    render(
      <PostForm mode="edit" categories={categories} post={post} postTags={[
        { id: 'tag-1', name: 'AI 도구' },
        { id: 'tag-2', name: '워드프레스 연동' },
        { id: 'tag-3', name: '워드프레스 연동법' },
      ]} isSaving={false} submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('가능한 근접 중복')
    expect(screen.getByRole('status')).toHaveTextContent('워드프레스 연동')
    expect(screen.queryByRole('button', { name: /자동 수정|병합/ })).not.toBeInTheDocument()
    const input = screen.getByLabelText('태그 추가')
    await browserUser.type(input, 'AI도구{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('정규화하면')
    expect(screen.getByText('AI 도구')).toBeInTheDocument()
  })

  it('adds, reorders, and removes source rows', async () => {
    const browserUser = userEvent.setup()
    render(
      <PostForm mode="edit" categories={categories} post={post} isSaving={false}
        submitError={null} onSubmit={vi.fn().mockResolvedValue(undefined)} />,
    )
    await browserUser.click(screen.getByRole('button', { name: '출처 추가' }))
    await browserUser.click(screen.getByRole('button', { name: '출처 추가' }))
    const names = screen.getAllByLabelText('출처명')
    await browserUser.type(names[0], '첫 번째')
    await browserUser.type(names[1], '두 번째')
    await browserUser.click(screen.getByRole('button', { name: '출처 2 위로 이동' }))
    expect(screen.getAllByLabelText('출처명')[0]).toHaveValue('두 번째')
    await browserUser.click(screen.getByRole('button', { name: '출처 1 삭제' }))
    expect(screen.getByText('현재 1개 · 발행 준비·발행됨은 1개 이상')).toBeInTheDocument()
  })
})
