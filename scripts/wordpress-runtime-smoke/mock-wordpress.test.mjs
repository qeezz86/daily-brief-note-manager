import { afterEach, describe, expect, it } from 'vitest'

import { startMockWordPress } from './mock-wordpress.mjs'

let mock

afterEach(async () => {
  await mock?.close()
  mock = undefined
})

function authorization(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

describe('runtime smoke Mock WordPress server', () => {
  it('requires the exact Basic Authorization value without storing it in the audit', async () => {
    mock = await startMockWordPress({ username: 'mock-user', applicationPassword: 'mock-password' })
    const url = `http://127.0.0.1:${mock.port}/wp-json/`
    await expect(fetch(url)).resolves.toMatchObject({ status: 401 })
    await expect(fetch(url, { headers: { Authorization: authorization('mock-user', 'wrong') } })).resolves.toMatchObject({ status: 401 })
    await expect(fetch(url, { headers: { Authorization: authorization('mock-user', 'mock-password') } })).resolves.toMatchObject({ status: 200 })

    const serialized = JSON.stringify(mock.audit)
    expect(serialized).not.toContain('mock-user')
    expect(serialized).not.toContain('mock-password')
    expect(serialized).not.toContain('Basic ')
    expect(mock.audit.map((entry) => entry.authorizationValid)).toEqual([false, false, true])
  })

  it('rejects writes and arbitrary query keys while auditing only safe metadata', async () => {
    mock = await startMockWordPress({ username: 'mock-user', applicationPassword: 'mock-password' })
    const headers = { Authorization: authorization('mock-user', 'mock-password') }
    const root = `http://127.0.0.1:${mock.port}`
    await expect(fetch(`${root}/wp-json/`, { method: 'POST', headers })).resolves.toMatchObject({ status: 405 })
    await expect(fetch(`${root}/wp-json/wp/v2/types?context=edit&redirect_to=private`, { headers })).resolves.toMatchObject({ status: 404 })
    expect(mock.audit).toMatchObject([
      { method: 'POST', pathname: '/wp-json/', queryKeys: [], status: 405 },
      { method: 'GET', pathname: '/wp-json/wp/v2/types', queryKeys: ['context', 'redirect_to'], status: 404 },
    ])
  })

  it('closes idempotently even with an open keep-alive connection', async () => {
    mock = await startMockWordPress({ username: 'mock-user', applicationPassword: 'mock-password' })
    const response = await fetch(`http://127.0.0.1:${mock.port}/wp-json/`, {
      headers: { Authorization: authorization('mock-user', 'mock-password') },
    })
    expect(response.status).toBe(200)
    await expect(mock.close()).resolves.toBeUndefined()
    await expect(mock.close()).resolves.toBeUndefined()
    mock = undefined
  })
})
