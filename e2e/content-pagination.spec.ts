import { expect, test } from '@playwright/test'
import { SUPABASE_ORIGIN, USER_ID } from './fixtures/wordpress-publication'

test('pages and searches all content including records beyond 1,000 on desktop and mobile', async ({ page, baseURL }) => {
  await page.addInitScript((userId) => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_')
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test',
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-09-16T00:00:00Z' }
    localStorage.setItem('sb-e2e-auth-token', JSON.stringify({
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: 4102444800 })}.e2e-signature`,
      refresh_token: 'e2e-refresh-token', token_type: 'bearer', expires_in: 2_000_000_000, expires_at: 4102444800, user,
    }))
  }, USER_ID)
  const posts = Array.from({ length: 1001 }, (_, index) => ({
    id: `post-${index}`, category_id: index < 980 ? 'economy' : 'technology', display_id: null, series_no: null,
    briefing_date: '2026-09-16', published_on: null, title: index < 980 ? `최신 글 ${index + 1}` : `오래된 글 ${index + 1}`,
    summary: null, slug: index === 1000 ? 'literal-%_*' : `post-${index}`, content_status: index === 1000 ? 'published' : 'draft',
    wordpress_url: null, updated_at: new Date(Date.UTC(2026, 8, 16) - index * 1000).toISOString(),
  }))
  const requests: URL[] = []
  const forbidden: string[] = []
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL!).origin && request.method() === 'GET') return route.continue()
    if (url.origin !== SUPABASE_ORIGIN || request.method() !== 'GET') {
      forbidden.push(request.url())
      return route.abort('blockedbyclient')
    }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: { user: { id: USER_ID, email: 'admin@example.test' } } })
    if (url.pathname === '/rest/v1/categories') return route.fulfill({ json: [
      { id: 'economy', name: '경제', content_group: 'news', sort_order: 1 },
      { id: 'technology', name: '과학기술', content_group: 'news', sort_order: 2 },
    ] })
    if (url.pathname !== '/rest/v1/posts') {
      forbidden.push(request.url())
      return route.abort('blockedbyclient')
    }
    requests.push(url)
    expect(request.headers().prefer).toContain('count=exact')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('order')).toBe('updated_at.desc,id.desc')
    let matches = posts.filter((post) =>
      (!url.searchParams.has('category_id') || `eq.${post.category_id}` === url.searchParams.get('category_id')) &&
      (!url.searchParams.has('content_status') || `eq.${post.content_status}` === url.searchParams.get('content_status')))
    const search = url.searchParams.get('or')
    if (search) {
      const quoted = search.slice('(title.imatch.'.length).split(',slug.imatch.')[0]
      const regex = new RegExp(JSON.parse(quoted) as string, 'i')
      matches = matches.filter((post) => regex.test(post.title) || regex.test(post.slug))
    }
    const start = Number(url.searchParams.get('offset'))
    const rows = matches.slice(start, start + 20)
    return route.fulfill({ json: rows, headers: {
      'access-control-expose-headers': 'content-range',
      'content-range': rows.length ? `${start}-${start + rows.length - 1}/${matches.length}` : `*/${matches.length}`,
    } })
  })
  await page.goto('/content')
  await expect(page.getByLabel('전체 글 1001개')).toBeVisible()
  const list = page.getByRole('list', { name: '콘텐츠 목록' })
  await expect(list.getByRole('listitem')).toHaveCount(20)
  await expect(page.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
  await page.getByRole('button', { name: '다음 페이지' }).click()
  await expect(page.getByText('2 / 51 페이지', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '최신 글 21', exact: true })).toBeVisible()
  await page.getByLabel('제목·slug 검색').fill('오래된')
  await expect(page.getByLabel('검색 결과 21개')).toBeVisible()
  await expect(page.getByText('1 / 2 페이지', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '다음 페이지' }).click()
  await expect(page.getByRole('heading', { name: '오래된 글 1001' })).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
  await page.getByLabel('상태', { exact: true }).selectOption('published')
  await expect(page.getByText('1 / 1 페이지', { exact: true })).toBeVisible()
  await expect(page.getByLabel('검색 결과 1개')).toBeVisible()
  await page.getByLabel('제목·slug 검색').fill('%_*')
  await expect(page.getByRole('heading', { name: '오래된 글 1001' })).toBeVisible()
  await page.getByLabel('카테고리', { exact: true }).selectOption('economy')
  await expect(page.getByRole('heading', { name: '조건에 맞는 콘텐츠가 없습니다' })).toBeVisible()
  await expect(page.getByLabel('검색 결과 0개')).toBeVisible()
  expect(requests.some((url) => url.searchParams.get('offset') === '20')).toBe(true)
  expect(forbidden).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
