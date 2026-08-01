import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { DatabaseClient } from '../shared/supabase/client'
import * as backupGenerationModule from '../features/backups/backupGeneration.module'
import { backupSnapshotFixture } from '../features/backups/backups.fixtures'
import type { BackupSnapshot } from '../features/backups/backup.types'
import { BackupPageContent } from './BackupPage'

const getSnapshotMock = vi.hoisted(() => vi.fn())
const estimateMock = vi.hoisted(() => ({
  data: { profile: 'core', sectionCounts: { posts: 1, generatedPrompts: 1 }, totalRecords: 2, categoryManifestCount: 1, includesOperationalHistory: false, includesNormalizedPayload: false },
  isPending: false,
  isError: false,
}))

vi.mock('../features/backups/backup.repository', () => ({ getBackupSnapshot: getSnapshotMock }))
vi.mock('../features/backups/backup.queries', () => ({ useBackupEstimateQuery: () => estimateMock }))

const client = {} as DatabaseClient
const csvButtonNames = [
  'posts CSV 다운로드',
  'news topics CSV 다운로드',
  'follow-ups CSV 다운로드',
  'sources CSV 다운로드',
] as const

let anchorClickSpy: MockInstance
let clipboardDescriptor: PropertyDescriptor | undefined
let createObjectUrlDescriptor: PropertyDescriptor | undefined
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined

function restoreOwnProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}

function emptyBackupSnapshot(): BackupSnapshot {
  const snapshot = backupSnapshotFixture()
  snapshot.data = {
    posts: [], seoData: [], tags: [], postTags: [], sources: [], aiMetadata: [],
    infoDbMetadata: [], chineseMetadata: [], seriesCounters: [], newsTopics: [],
    newsStatusHistory: [], newsUpdates: [], newsFollowups: [], generatedPrompts: [],
    wordpressTaxonomyMappings: [],
  }
  snapshot.sectionCounts = Object.fromEntries(Object.keys(snapshot.data).map((key) => [key, 0]))
  snapshot.totalRecords = 0
  return snapshot
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(new Error('CSV blob을 읽지 못했습니다.')))
    reader.readAsText(blob)
  })
}

describe('BackupPageContent', () => {
  beforeEach(() => {
    getSnapshotMock.mockReset().mockResolvedValue(backupSnapshotFixture())
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
    anchorClickSpy.mockRestore()
    restoreOwnProperty(navigator, 'clipboard', clipboardDescriptor)
    restoreOwnProperty(URL, 'createObjectURL', createObjectUrlDescriptor)
    restoreOwnProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor)
  })

  function view() {
    return render(<BackupPageContent client={client} userId="owner" loadGenerationModule={() => Promise.resolve(backupGenerationModule)} />)
  }

  it('백업 페이지 설명을 렌더링한다', () => {
    view()
    expect(screen.getByRole('heading', { name: '백업' })).toBeInTheDocument()
    expect(screen.getByText('Phase 4B-1')).toBeInTheDocument()
  })
  it('core를 기본 선택한다', () => {
    view()
    expect(screen.getByRole('radio', { name: /^핵심 데이터/ })).toBeChecked()
  })
  it('full 프로필을 선택하고 용량 안내를 표시한다', async () => {
    view()
    await userEvent.click(screen.getByRole('radio', { name: /^전체 데이터/ }))
    expect(screen.getByText(/Import job snapshot과 실행 이력/)).toBeInTheDocument()
  })
  it('예상 count를 표시한다', () => {
    view()
    expect(screen.getByText('예상 전체:')).toBeInTheDocument()
    expect(screen.getByText('2 records')).toBeInTheDocument()
  })
  it('초기 렌더에서는 생성 module을 불러오지 않고 클릭 시 한 번만 불러온다', async () => {
    let resolve!: (value: typeof backupGenerationModule) => void
    const loadModule = vi.fn(() => new Promise<typeof backupGenerationModule>((done) => { resolve = done }))
    render(<BackupPageContent client={client} userId="owner" loadGenerationModule={loadModule} />)

    expect(loadModule).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(loadModule).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('백업 도구를 불러오는 중입니다.')
    expect(screen.getByRole('button', { name: '백업 도구 불러오는 중' })).toBeDisabled()

    await act(async () => { resolve(backupGenerationModule) })
    expect(await screen.findByRole('heading', { name: '백업 manifest' })).toBeInTheDocument()
  })
  it('생성 module load 오류를 안전하게 표시하고 다음 클릭에서 재시도한다', async () => {
    const loadModule = vi.fn()
      .mockRejectedValueOnce(new Error('private chunk url'))
      .mockResolvedValueOnce(backupGenerationModule)
    render(<BackupPageContent client={client} userId="owner" loadGenerationModule={loadModule} />)

    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('BACKUP_MODULE_LOAD_FAILED')
    expect(alert).not.toHaveTextContent('private chunk')

    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('heading', { name: '백업 manifest' })).toBeInTheDocument()
    expect(loadModule).toHaveBeenCalledTimes(2)
  })
  it('생성 진행 단계와 완료 manifest를 표시한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('heading', { name: '백업 manifest' })).toBeInTheDocument()
    expect(screen.getByText('파일 준비 완료')).toHaveAttribute('aria-current', 'step')
  })
  it('section count와 byte size를 표시한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByText(/bytes|KB/)).toBeInTheDocument()
    expect(screen.getAllByText('posts').length).toBeGreaterThan(0)
  })
  it('관계와 checksum 검증 성공을 표시한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByText('검증 완료')).toBeInTheDocument()
    expect(screen.getByText('통과')).toBeInTheDocument()
  })
  it('checksum을 표시하고 복사한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'checksum 복사' }))
    expect(await screen.findByText('checksum을 복사했습니다.')).toBeInTheDocument()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/))
  })
  it('manifest JSON을 복사한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'manifest JSON 복사' }))
    expect(await screen.findByText('manifest JSON을 복사했습니다.')).toBeInTheDocument()
  })
  it('JSON 다운로드 버튼으로 최종 내용을 다운로드한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    const downloadButton = await screen.findByRole('button', { name: 'JSON 다운로드' })
    vi.useFakeTimers()
    try {
      act(() => downloadButton.click())
      expect(URL.createObjectURL).toHaveBeenCalledOnce()
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      act(() => vi.runOnlyPendingTimers())
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })
  it('verified snapshot에서 고유한 네 CSV control과 기존 JSON action을 표시한다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await screen.findByRole('heading', { name: '백업 manifest' })
    for (const name of csvButtonNames) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }
    expect(new Set(csvButtonNames).size).toBe(4)
    expect(screen.getByRole('button', { name: 'JSON 다운로드' })).toBeEnabled()
  })
  it('snapshot이 검증되기 전에는 CSV export를 제공하지 않는다', () => {
    view()
    for (const name of csvButtonNames) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
  it('snapshot validation pending 중에는 CSV export를 제공하지 않는다', async () => {
    getSnapshotMock.mockReturnValue(new Promise(() => undefined))
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(screen.getByRole('button', { name: '백업 생성 중' })).toBeDisabled()
    for (const name of csvButtonNames) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
  it('snapshot validation 실패 시 CSV export를 제공하지 않는다', async () => {
    const invalid = backupSnapshotFixture()
    invalid.data.newsFollowups[0].topicId = crypto.randomUUID()
    getSnapshotMock.mockResolvedValue(invalid)
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('무결성 검증에 실패')
    for (const name of csvButtonNames) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  })
  it('검증된 empty dataset에서도 네 header-only CSV를 다운로드할 수 있다', async () => {
    getSnapshotMock.mockResolvedValue(emptyBackupSnapshot())
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await screen.findByRole('heading', { name: '백업 manifest' })
    for (const name of csvButtonNames) expect(screen.getByRole('button', { name })).toBeEnabled()
  })
  it('각 CSV control은 한 번 클릭할 때 정확한 filename으로 한 파일을 만든다', async () => {
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloads.push(this.download)
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await screen.findByRole('heading', { name: '백업 manifest' })
    for (const name of csvButtonNames) await userEvent.click(screen.getByRole('button', { name }))
    expect(downloads[0]).toMatch(/^daily-brief-note-posts-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u)
    expect(downloads[1]).toMatch(/^daily-brief-note-news-topics-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u)
    expect(downloads[2]).toMatch(/^daily-brief-note-follow-ups-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u)
    expect(downloads[3]).toMatch(/^daily-brief-note-sources-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u)
    const timestampSuffix = downloads[0].replace('daily-brief-note-posts-', '')
    expect(downloads.slice(1).every((name) => name.endsWith(timestampSuffix))).toBe(true)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(4)
  })
  it('CSV download lifecycle을 한 deferred browser task에서 정리한다', async () => {
    const downloadedBlobs: Blob[] = []
    let clickedDownload: string | undefined
    vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new Error('CSV Blob이 아닙니다.')
      downloadedBlobs.push(blob)
      return 'blob:lifecycle'
    })
    const anchorClick = vi.mocked(HTMLAnchorElement.prototype.click)
    anchorClick.mockImplementation(function captureAnchor(this: HTMLAnchorElement) {
      clickedDownload = this.download
    })

    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    const downloadButton = await screen.findByRole('button', { name: 'posts CSV 다운로드' })
    expect(screen.getByRole('button', { name: 'JSON 다운로드' })).toBeEnabled()

    vi.useFakeTimers()
    try {
      expect(anchorClick).not.toHaveBeenCalled()
      act(() => downloadButton.click())
      expect(downloadedBlobs).toHaveLength(1)
      expect(downloadedBlobs[0].type).toBe('text/csv;charset=utf-8')
      expect(URL.createObjectURL).toHaveBeenCalledOnce()
      expect(anchorClick).toHaveBeenCalledOnce()
      expect(clickedDownload).toMatch(/^daily-brief-note-posts-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/u)
      if (clickedDownload === undefined) throw new Error('클릭된 CSV download 값이 없습니다.')
      const expectedDownload = clickedDownload
      const matchingAnchors = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a[download]'))
        .filter((anchor) => anchor.download === expectedDownload)
      if (matchingAnchors.length !== 1) {
        throw new Error(`클릭된 CSV anchor 후보가 정확히 하나가 아닙니다: ${matchingAnchors.length}`)
      }
      expect(matchingAnchors).toHaveLength(1)
      const clickedAnchor = matchingAnchors[0]
      if (clickedAnchor === undefined) throw new Error('클릭된 CSV anchor를 찾지 못했습니다.')
      expect(clickedAnchor).toBeInstanceOf(HTMLAnchorElement)
      expect(document.body.contains(clickedAnchor)).toBe(true)
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      act(() => vi.runOnlyPendingTimers())
      expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle')
      expect(document.body.contains(clickedAnchor)).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })
  it('CSV failure는 redacted하고 JSON과 다른 CSV action을 계속 사용할 수 있다', async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error('private snapshot payload') })
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'posts CSV 다운로드' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('posts CSV 다운로드를 준비하지 못했습니다.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('private snapshot payload')
    expect(screen.getByRole('button', { name: 'JSON 다운로드' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'sources CSV 다운로드' })).toBeEnabled()
  })
  it('같은 CSV button의 수동 retry 성공 시 stale error를 지운다', async () => {
    vi.mocked(URL.createObjectURL)
      .mockImplementationOnce(() => { throw new Error('raw failure') })
      .mockReturnValue('blob:retry')
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    const postsButton = await screen.findByRole('button', { name: 'posts CSV 다운로드' })
    await userEvent.click(postsButton)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(postsButton)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)
  })
  it('DB 재조회 없이 supplied verified snapshot의 row를 CSV에 사용한다', async () => {
    const snapshot = backupSnapshotFixture()
    snapshot.data.posts[0].title = 'CSV snapshot 전용 제목'
    getSnapshotMock.mockResolvedValue(snapshot)
    const downloadedBlobs: Blob[] = []
    vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
      if (!(blob instanceof Blob)) throw new Error('CSV Blob이 아닙니다.')
      downloadedBlobs.push(blob)
      return 'blob:captured'
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await userEvent.click(await screen.findByRole('button', { name: 'posts CSV 다운로드' }))
    expect(getSnapshotMock).toHaveBeenCalledOnce()
    expect(downloadedBlobs).toHaveLength(1)
    expect(downloadedBlobs[0].type).toBe('text/csv;charset=utf-8')
    expect(await readBlobText(downloadedBlobs[0])).toContain('CSV snapshot 전용 제목')
  })
  it('생성 중 중복 실행을 차단한다', async () => {
    let resolve!: (value: ReturnType<typeof backupSnapshotFixture>) => void
    getSnapshotMock.mockReturnValue(new Promise((done) => { resolve = done }))
    view()
    const button = screen.getByRole('button', { name: '백업 생성' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: '백업 생성 중' })).toBeDisabled()
    expect(getSnapshotMock).toHaveBeenCalledOnce()
    resolve(backupSnapshotFixture())
    await screen.findByRole('heading', { name: '백업 manifest' })
  })
  it('생성 오류를 안전한 문구로 표시한다', async () => {
    getSnapshotMock.mockRejectedValue(new Error('raw database secret'))
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('무결성 검증에 실패')
    expect(screen.getByRole('alert')).not.toHaveTextContent('raw database')
  })
  it('Supabase 미설정 상태를 표시하고 생성을 차단한다', () => {
    render(<BackupPageContent client={null} userId="owner" />)
    expect(screen.getByText(/Supabase가 설정되지 않아/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '백업 생성' })).toBeDisabled()
  })
  it('프로필 변경 시 이전 생성 결과를 지운다', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: '백업 생성' }))
    await screen.findByRole('heading', { name: '백업 manifest' })
    await userEvent.click(screen.getByRole('radio', { name: /^전체 데이터/ }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '백업 manifest' })).not.toBeInTheDocument())
  })
})
