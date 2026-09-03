import { describe, expect, it } from 'vitest'
import { parsePostStatusRequest } from './requestSchema'

const request = { action: 'check-post-status', contentId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222' }
describe('post status request schema', () => {
  it('accepts only the bounded request', () => expect(parsePostStatusRequest(request)).toEqual(request))
  it('rejects invalid actions, IDs, and browser remote fields', () => {
    for (const value of [{ ...request, action: 'other' }, { ...request, contentId: 'bad' }, { ...request, wordpressPostId: 1 }, { ...request, remoteUrl: 'https://example.com' }, { ...request, authorization: 'secret' }]) expect(() => parsePostStatusRequest(value)).toThrow()
  })
})
