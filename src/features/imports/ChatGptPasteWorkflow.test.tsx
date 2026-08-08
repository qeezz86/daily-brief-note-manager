import { StrictMode, useState, type ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import { ChatGptPasteWorkflow } from './ChatGptPasteWorkflow'
import { parseChatGptPaste } from './parseChatGptPaste'

function pasteText({ title = '경제 브리핑', tracking = false } = {}) {
  return `[CONTENT_META_JSON]\n${JSON.stringify({ contentGroup: 'news', category: 'economy', displayId: '#2026-08-01-ECO', title, slug: 'economy-briefing-2026-08-01', publishedOn: '2026-08-01', publishedAt: null })}\n[/CONTENT_META_JSON]\n[SEO_JSON]\n${JSON.stringify({ representativeTitle: '대표 제목', alternativeTitles: ['1', '2', '3', '4'], metaDescription: '가'.repeat(120), focusKeyword: '경제', tags: ['금리', '환율', '물가', '산업', '정책'] })}\n[/SEO_JSON]\n[IMAGE_PROMPT_JSON]\n{"prompt":"장면","alt":"장면"}\n[/IMAGE_PROMPT_JSON]\n[SOURCES_JSON]\n[{"sourceName":"기관","sourceTitle":"원문","sourceUrl":"https://example.com/a","sourcePublishedAt":null,"checkedPoint":"확인"}]\n[/SOURCES_JSON]\n[WORDPRESS_HTML]\n<div class="daily-brief-note news-briefing economy"><h1>${title}</h1><p>&lt;script&gt;text&lt;/script&gt;</p></div>\n[/WORDPRESS_HTML]${tracking ? '\n[NEWS_TRACKING_JSON]\n{"updates":[],"followups":[]}\n[/NEWS_TRACKING_JSON]' : ''}`
}

const saved = {
  postId: '11111111-1111-4111-8111-111111111111', title: '경제 브리핑', categoryId: 'economy', status: 'draft',
  slug: 'economy-briefing-2026-08-01', displayId: '#2026-08-01-ECO', publishedOn: '2026-08-01', wordpressUrl: null,
}

type WorkflowProps = ComponentProps<typeof ChatGptPasteWorkflow>
type RenderWorkflowOptions = Pick<WorkflowProps, 'save'> & { client?: DatabaseClient }

function WorkflowRoutes(props: WorkflowProps) {
  return <Routes>
    <Route path="/imports" element={<ChatGptPasteWorkflow {...props} />} />
    <Route path="/content/:postId" element={<h1>저장된 콘텐츠 상세</h1>} />
  </Routes>
}

function UnmountableWorkflow(props: WorkflowProps) {
  const [visible, setVisible] = useState(true)
  const location = useLocation()
  return <>
    <output aria-label="현재 경로">{location.pathname}</output>
    <button type="button" onClick={() => setVisible(false)}>워크플로 언마운트</button>
    <Routes>
      <Route path="/imports" element={visible ? <ChatGptPasteWorkflow {...props} /> : <p>워크플로 제거됨</p>} />
      <Route path="/content/:postId" element={<h1>저장된 콘텐츠 상세</h1>} />
    </Routes>
  </>
}

function renderWorkflow(options: RenderWorkflowOptions = {}) {
  const client = Object.hasOwn(options, 'client') ? options.client : {} as DatabaseClient
  const save = options.save ?? vi.fn().mockResolvedValue(saved)
  const view = render(<MemoryRouter initialEntries={['/imports']}><Routes>
    <Route path="/imports" element={<ChatGptPasteWorkflow client={client ?? null} save={save} />} />
    <Route path="/content/:postId" element={<h1>저장된 콘텐츠 상세</h1>} />
  </Routes></MemoryRouter>)
  return { ...view, save }
}

async function pasteAndPreview(text = pasteText()) {
  const user = userEvent.setup()
  const textarea = screen.getByLabelText('구조화 ChatGPT 응답 plain text')
  await user.click(textarea)
  await user.paste(text)
  expect(textarea).toHaveValue(text)
  await user.click(screen.getByRole('button', { name: '로컬 미리보기 생성' }))
  return user
}

describe('ChatGptPasteWorkflow', () => {
  it('keeps asynchronous parse completion visible after StrictMode effect replay', async () => {
    const parse = vi.fn(parseChatGptPaste)
    const save = vi.fn().mockResolvedValue(saved)
    render(<MemoryRouter initialEntries={['/imports']}>
      <StrictMode><WorkflowRoutes client={{} as DatabaseClient} parse={parse} save={save} /></StrictMode>
    </MemoryRouter>)

    fireEvent.change(screen.getByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: pasteText() } })
    fireEvent.click(screen.getByRole('button', { name: '로컬 미리보기 생성' }))

    expect(await screen.findByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toBeInTheDocument()
    expect(parse).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
  })

  it('completes one asynchronous save after StrictMode effect replay', async () => {
    let resolveSave!: (value: typeof saved) => void
    const pendingSave = new Promise<typeof saved>((resolve) => { resolveSave = resolve })
    const save = vi.fn(() => pendingSave)
    const onSaved = vi.fn()
    render(<MemoryRouter initialEntries={['/imports']}>
      <StrictMode><WorkflowRoutes client={{} as DatabaseClient} save={save} onSaved={onSaved} /></StrictMode>
    </MemoryRouter>)
    const user = await pasteAndPreview()

    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    expect(save).toHaveBeenCalledOnce()
    await act(async () => {
      resolveSave(saved)
      await pendingSave
    })

    expect(await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument()
    expect(save).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('blocks pending completion state and navigation after actual unmount', async () => {
    let rejectSave!: (reason: unknown) => void
    const pendingSave = new Promise<typeof saved>((_resolve, reject) => { rejectSave = reject })
    const save = vi.fn(() => pendingSave)
    const onSaved = vi.fn()
    render(<MemoryRouter initialEntries={['/imports']}>
      <UnmountableWorkflow client={{} as DatabaseClient} save={save} onSaved={onSaved} />
    </MemoryRouter>)
    const user = await pasteAndPreview()

    fireEvent.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    expect(save).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '워크플로 언마운트' }))
    await act(async () => {
      rejectSave(new Error('private backend detail'))
      await pendingSave.catch(() => undefined)
    })

    expect(screen.getByText('워크플로 제거됨')).toBeInTheDocument()
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/imports')
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '저장된 콘텐츠 상세' })).not.toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledOnce()
  })

  it('pastes plain text and creates an inert local preview without saving', async () => {
    const { save } = renderWorkflow()
    await pasteAndPreview()
    expect(screen.getByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toBeInTheDocument()
    expect(screen.getByText('경제 브리핑')).toBeInTheDocument()
    expect(screen.getByLabelText('WordPress HTML inert preview')).toHaveTextContent('<script>text</script>')
    expect(document.querySelector('script')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('blocks confirmation when required data is missing', async () => {
    renderWorkflow()
    await pasteAndPreview(pasteText({ title: '' }))
    expect(screen.getByRole('alert')).toHaveTextContent('차단 오류')
    expect(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })).toBeDisabled()
  })

  it('requires explicit warning acknowledgement before confirmation', async () => {
    renderWorkflow()
    await pasteAndPreview(pasteText({ tracking: true }))
    const confirm = screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })
    expect(confirm).toBeDisabled()
    await userEvent.click(screen.getByLabelText('저장에서 제외되는 항목과 모든 경고를 확인했습니다.'))
    expect(confirm).toBeEnabled()
  })

  it('confirms exactly once and sends no raw paste', async () => {
    const save = vi.fn().mockResolvedValue(saved)
    renderWorkflow({ save })
    const user = await pasteAndPreview()
    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })
    expect(save).toHaveBeenCalledOnce()
    expect(JSON.stringify(save.mock.calls[0][1])).not.toContain('[CONTENT_META_JSON]')
  })

  it('prevents a second active request on double confirmation', async () => {
    let resolveSave!: (value: typeof saved) => void
    const save = vi.fn(() => new Promise<typeof saved>((resolve) => { resolveSave = resolve }))
    renderWorkflow({ save })
    await pasteAndPreview()
    const confirm = screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(save).toHaveBeenCalledOnce()
    resolveSave(saved)
    await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })
  })

  it('reset clears transient input and preview without saving', async () => {
    const { save } = renderWorkflow()
    const user = await pasteAndPreview()
    await user.click(screen.getByRole('button', { name: '붙여넣기 초기화' }))
    expect(screen.getByLabelText('구조화 ChatGPT 응답 plain text')).toHaveValue('')
    expect(screen.queryByRole('heading', { name: '구조화 붙여넣기 미리보기' })).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('input edits invalidate stale preview and clear parse state', async () => {
    renderWorkflow()
    await pasteAndPreview()
    fireEvent.change(screen.getByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: `${pasteText()} ` } })
    expect(screen.queryByRole('heading', { name: '구조화 붙여넣기 미리보기' })).not.toBeInTheDocument()
  })

  it('retains the preview after failure and permits exactly one manual retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('private backend')).mockResolvedValueOnce(saved)
    renderWorkflow({ save })
    const user = await pasteAndPreview()
    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('private backend')
    expect(screen.getByRole('heading', { name: '구조화 붙여넣기 미리보기' })).toBeInTheDocument()
    expect(save).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '수동으로 다시 저장' }))
    await screen.findByRole('heading', { name: '저장된 콘텐츠 상세' })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('clears stale save errors when input changes', async () => {
    const save = vi.fn().mockRejectedValue(new Error('private'))
    renderWorkflow({ save })
    const user = await pasteAndPreview()
    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('구조화 ChatGPT 응답 plain text'), { target: { value: 'changed' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not save on unmount or navigation before confirmation', async () => {
    const { save, unmount } = renderWorkflow()
    await pasteAndPreview()
    unmount()
    await Promise.resolve()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps local preview available offline and redacts unavailable persistence errors', async () => {
    renderWorkflow({ client: undefined })
    const user = await pasteAndPreview()
    expect(screen.getByText('경제 브리핑')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('수동으로 다시 시도')
    expect(screen.getByRole('button', { name: '수동으로 다시 저장' })).toBeEnabled()
  })

  it('navigates only after the successful result returns', async () => {
    const save = vi.fn().mockResolvedValue(saved)
    renderWorkflow({ save })
    const user = await pasteAndPreview()
    expect(screen.queryByRole('heading', { name: '저장된 콘텐츠 상세' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '미리보기 확인 후 한 건 저장' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '저장된 콘텐츠 상세' })).toBeInTheDocument())
  })
})
