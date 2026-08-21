import { describe, expect, it, vi } from 'vitest'
import type { DatabaseClient } from '../../shared/supabase/client'
import {
  collectImportDuplicateCandidates,
  getImportDuplicateReferenceData,
  queryImportCandidatesInChunks,
} from './importDuplicates.repository'
import type { ImportDuplicateCandidates } from './importValidation.types'

const emptyCandidates = (): ImportDuplicateCandidates => ({
  slugs: [],
  displayIds: [],
  normalizedTitles: [],
  wordpressUrls: [],
  briefingDates: [],
  seriesNumbers: [],
  chineseOriginalUrls: [],
  newsTopicKeys: [],
})

type QueryCall = { table: string; projection: string; column: string; values: unknown[]; filter?: string }

function createClient(resolve: (call: QueryCall, index: number) => { data: unknown[]; error: unknown }) {
  const calls: QueryCall[] = []
  const from = vi.fn((table: string) => ({
    select: vi.fn((projection: string) => ({
      in: vi.fn((column: string, values: unknown[]) => {
        const call = { table, projection, column, values }
        calls.push(call)
        return Promise.resolve(resolve(call, calls.length - 1))
      }),
      or: vi.fn((filter: string) => {
        const call = { table, projection, column: 'or', values: [], filter }
        calls.push(call)
        return Promise.resolve(resolve(call, calls.length - 1))
      }),
    })),
  }))
  return { client: { from } as unknown as DatabaseClient, calls, from }
}

describe('collectImportDuplicateCandidates', () => {
  it('후보를 trim하고 빈 값과 중복을 제거한다', () => {
    const result = collectImportDuplicateCandidates({ posts: [
      { title: ' Same\tTitle ', displayId: ' ID-1 ', slug: ' same ', wordpressUrl: ' ', briefingDate: ' 2026-07-13 ', seriesNo: 7, metadata: { originalUrl: ' HTTPS://NEWS.CCTV.COM/a/#part ' }, newsTracking: { topics: [{ topicKey: ' Topic-Key ' }] } },
      { title: 'same title', displayId: 'ID-1', slug: 'same', wordpressUrl: ' https://example.com/post ', briefingDate: '2026-07-13', seriesNo: 7, metadata: { originalUrl: 'https://news.cctv.com/a' }, newsTracking: { topics: [{ topicKey: 'topic-key' }] } },
      { slug: '', wordpressUrl: '', briefingDate: '', seriesNo: null, metadata: { originalUrl: '' }, newsTracking: { topics: [{ topicKey: '' }] } },
    ] })
    expect(result).toEqual({
      slugs: ['same'],
      displayIds: ['ID-1'],
      normalizedTitles: ['same title'],
      wordpressUrls: ['https://example.com/post'],
      briefingDates: ['2026-07-13'],
      seriesNumbers: [7],
      chineseOriginalUrls: ['https://news.cctv.com/a'],
      newsTopicKeys: ['topic-key'],
    })
  })
})

describe('queryImportCandidatesInChunks', () => {
  it.each([
    [0, 0],
    [1, 1],
    [100, 1],
    [101, 2],
    [250, 3],
  ])('%i개 후보를 %i개 chunk로 조회한다', async (candidateCount, expectedChunks) => {
    const chunks: number[][] = []
    await queryImportCandidatesInChunks(
      Array.from({ length: candidateCount }, (_, index) => index),
      async (chunk) => {
        chunks.push(chunk)
        return { data: chunk, error: null }
      },
    )
    expect(chunks).toHaveLength(expectedChunks)
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true)
  })

  it('중간 chunk 실패를 기록하고 나머지 chunk를 순차 처리한다', async () => {
    const started: number[] = []
    const result = await queryImportCandidatesInChunks(
      Array.from({ length: 250 }, (_, index) => index),
      async (chunk) => {
        started.push(chunk[0])
        return chunk[0] === 100 ? { data: null, error: { message: 'secret' } } : { data: chunk, error: null }
      },
    )
    expect(started).toEqual([0, 100, 200])
    expect(result.successfulChunks).toBe(2)
    expect(result.failedChunks).toBe(1)
    expect(result.rows).toHaveLength(150)
  })
})

describe('getImportDuplicateReferenceData', () => {
  it('0개 후보는 DB query 없이 complete다', async () => {
    const { client, from } = createClient(() => ({ data: [], error: null }))
    const result = await getImportDuplicateReferenceData(client, emptyCandidates())
    expect(from).not.toHaveBeenCalled()
    expect(result.databaseCheck).toBe('complete')
  })

  it('250개 후보를 item별 N+1 없이 3개 batch query로 조회한다', async () => {
    const { client, calls, from } = createClient(() => ({ data: [], error: null }))
    const candidates = emptyCandidates()
    candidates.slugs = Array.from({ length: 250 }, (_, index) => `slug-${index}`)
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(from).toHaveBeenCalledTimes(3)
    expect(calls).toHaveLength(3)
    expect(calls.every((call) => call.values.length <= 100)).toBe(true)
    expect(calls.every((call) => call.projection !== '*' && !call.projection.includes('owner_id'))).toBe(true)
    expect(result.databaseCheck).toBe('complete')
  })

  it('display ID를 chunked IN으로, normalized exact title을 escaped ilike prefilter 뒤 client exact match로 조회한다', async () => {
    const exact = { category_id: 'economy', title: '  동일\t제목  ', slug: 'existing', display_id: '#2026-08-13-ECO', series_no: null, briefing_date: '2026-08-13', published_on: '2026-08-13', wordpress_url: null }
    const fuzzy = { ...exact, title: '동일 제목 추가', slug: 'fuzzy', display_id: '#other' }
    const { client, calls } = createClient((call) => call.column === 'display_id' || call.column === 'or' ? { data: [exact, fuzzy], error: null } : { data: [], error: null })
    const candidates = emptyCandidates()
    candidates.displayIds = ['#2026-08-13-ECO']
    candidates.normalizedTitles = ['동일 제목 (100%_확정), "인용"']
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(calls.find((call) => call.column === 'display_id')?.values).toEqual(['#2026-08-13-ECO'])
    expect(calls.find((call) => call.column === 'or')?.filter).toContain('\\%\\_')
    expect(calls.find((call) => call.column === 'or')?.filter).toContain('\\(100')
    expect(result.referenceData.posts.map((post) => post.slug)).toEqual(['existing', 'fuzzy'])
  })

  it('briefing date query가 category ID를 보존해 category/date duplicate authority를 제공한다', async () => {
    const matching = { category_id: 'economy', title: '기존 경제 브리핑', slug: 'existing-economy', display_id: '#2026-08-13-ECO', series_no: null, briefing_date: '2026-08-13', published_on: '2026-08-13', wordpress_url: null }
    const { client, calls } = createClient((call) => call.column === 'briefing_date' ? { data: [matching], error: null } : { data: [], error: null })
    const candidates = emptyCandidates()
    candidates.briefingDates = ['2026-08-13']

    const result = await getImportDuplicateReferenceData(client, candidates)
    const categoryDateQuery = calls.find((call) => call.column === 'briefing_date')

    expect(categoryDateQuery).toEqual(expect.objectContaining({ table: 'posts', column: 'briefing_date', values: ['2026-08-13'] }))
    expect(categoryDateQuery?.projection).toContain('category_id')
    expect(result.databaseCheck).toBe('complete')
    expect(result.referenceData.posts).toContainEqual(expect.objectContaining({ categoryId: 'economy', briefingDate: '2026-08-13', slug: 'existing-economy' }))
  })

  it('normalizes titles by trim, Unicode whitespace collapse, and en-US lowercase without fuzzy matching', async () => {
    const exact = { category_id: 'economy', title: ' SAME\nTitle ', slug: 'exact', display_id: null, series_no: null, briefing_date: null, published_on: null, wordpress_url: null }
    const fuzzy = { ...exact, title: 'same title extra', slug: 'fuzzy' }
    const { client } = createClient((call) => call.column === 'or' ? { data: [fuzzy, exact], error: null } : { data: [], error: null })
    const candidates = emptyCandidates()
    candidates.normalizedTitles = ['same title']
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(result.referenceData.posts.map((post) => post.slug)).toEqual(['exact'])
  })

  it('chunks display IDs and title prefilters and marks any failed authority partial', async () => {
    const { client, calls } = createClient((_call, index) => ({ data: [], error: index === 1 ? { message: 'private' } : null }))
    const candidates = emptyCandidates()
    candidates.displayIds = Array.from({ length: 101 }, (_, index) => `ID-${index}`)
    candidates.normalizedTitles = Array.from({ length: 101 }, (_, index) => `title ${index}`)
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(calls.filter((call) => call.column === 'display_id')).toHaveLength(2)
    expect(calls.filter((call) => call.column === 'or')).toHaveLength(2)
    expect(result.databaseCheck).toBe('partial')
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('chunk 결과를 중복 없이 결정적으로 병합한다', async () => {
    const rowA = { category_id: 'economy', title: 'A', slug: 'a', display_id: null, series_no: null, briefing_date: '2026-07-12', published_on: '2026-07-12', wordpress_url: null }
    const rowB = { category_id: 'economy', title: 'B', slug: 'b', display_id: null, series_no: null, briefing_date: '2026-07-13', published_on: '2026-07-13', wordpress_url: null }
    const { client } = createClient((call) => call.column === 'slug'
      ? { data: [rowB, rowA], error: null }
      : { data: [rowA], error: null })
    const candidates = emptyCandidates()
    candidates.slugs = ['a', 'b']
    candidates.wordpressUrls = ['https://example.com/a']
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(result.referenceData.posts.map((post) => post.slug)).toEqual(['a', 'b'])
  })

  it('하나의 중간 chunk가 실패하면 partial이고 성공 결과는 유지한다', async () => {
    const { client } = createClient((_call, index) => ({
      data: index === 1 ? [] : [{ category_id: 'economy', title: String(index), slug: String(index), display_id: null, series_no: null, briefing_date: null, published_on: null, wordpress_url: null }],
      error: index === 1 ? { message: 'constraint secret' } : null,
    }))
    const candidates = emptyCandidates()
    candidates.slugs = Array.from({ length: 250 }, (_, index) => `slug-${index}`)
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(result.databaseCheck).toBe('partial')
    expect(result.referenceData.posts).toHaveLength(2)
  })

  it('모든 chunk가 실패하면 unavailable이다', async () => {
    const { client } = createClient(() => ({ data: [], error: { message: 'constraint secret' } }))
    const candidates = emptyCandidates()
    candidates.slugs = ['a']
    const result = await getImportDuplicateReferenceData(client, candidates)
    expect(result.databaseCheck).toBe('unavailable')
    expect(result.referenceData.posts).toEqual([])
  })
})
