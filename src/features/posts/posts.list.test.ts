import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../../shared/supabase/database.types'
import { getPosts, type PostListOptions } from './posts.list'

const options: PostListOptions = { page: 1, categoryId: '', status: '', search: '' }

function setup(responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const response of responses) fetch.mockResolvedValueOnce(response)
  const client = createClient<Database>('https://example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  })
  return { client, fetch }
}

function response(count: number, rows: unknown[] = [{ id: 'post-1001' }]) {
  return new Response(JSON.stringify(rows), { headers: { 'Content-Range': `*/${count}` } })
}

describe('server content pages', () => {
  it('requests rows beyond 1,000 with exact count, stable order and filters', async () => {
    const { client, fetch } = setup([response(1001)])
    const result = await getPosts(client, { ...options, page: 51, categoryId: 'economy', status: 'draft' })
    const url = new URL(String(fetch.mock.calls[0][0]))
    expect(url.searchParams.get('offset')).toBe('1000')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('order')).toBe('updated_at.desc,id.desc')
    expect(url.searchParams.get('category_id')).toBe('eq.economy')
    expect(url.searchParams.get('content_status')).toBe('eq.draft')
    expect(url.searchParams.get('select')).not.toContain('html_body')
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Prefer')).toContain('count=exact')
    expect(result).toEqual({ posts: [{ id: 'post-1001' }], count: 1001, page: 51 })
  })

  it.each(['CCTV', '%_*', 'a,b).title.eq.attack', '"quote"\\path', '[a-z]+?^$|{2}.'])('escapes literal search %s', async (search) => {
    const { client, fetch } = setup([response(1)])
    await getPosts(client, { ...options, search: ` ${search} ` })
    const filter = new URL(String(fetch.mock.calls[0][0])).searchParams.get('or')!
    const match = /^\(title\.imatch\.("(?:\\.|[^"\\])*"),slug\.imatch\.("(?:\\.|[^"\\])*")\)$/.exec(filter)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(match![2])
    const pattern = JSON.parse(match![1]) as string
    const regex = new RegExp(pattern, 'i')
    expect(regex.test(`prefix ${search.toLowerCase()} suffix`)).toBe(true)
    expect(regex.test('unrelated text')).toBe(false)
    if (search === '%_*') expect(regex.test('%_anything')).toBe(false)
  })

  it.each([response(0, []), new Response(JSON.stringify({ code: 'PGRST103' }), { status: 416 })])('recovers a removed page with a single first-page read', async (empty) => {
    const { client, fetch } = setup([empty, response(1)])
    const result = await getPosts(client, { ...options, page: 3, search: 'CCTV' })
    expect(result.page).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    const first = new URL(String(fetch.mock.calls[0][0]))
    const second = new URL(String(fetch.mock.calls[1][0]))
    expect(second.searchParams.get('offset')).toBe('0')
    expect(second.searchParams.get('or')).toBe(first.searchParams.get('or'))
  })

  it('does not hide query errors or manufacture totals when count is absent', async () => {
    for (const failed of [new Response('[]'), new Response(JSON.stringify({ code: '42501', message: 'private detail' }), { status: 403 })]) {
      const { client, fetch } = setup([failed])
      await expect(getPosts(client, { ...options, page: 2 })).rejects.toThrow('콘텐츠 목록을 불러오지 못했습니다.')
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
})
