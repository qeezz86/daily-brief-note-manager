import { describe, expect, it } from 'vitest'
import { newsFollowupQueryKeys } from './newsFollowups.queries'

describe('newsFollowupQueryKeys', () => {
  it('isolates list, topic, and detail caches by user', () => { expect(newsFollowupQueryKeys.list('user-a')).not.toEqual(newsFollowupQueryKeys.list('user-b')); expect(newsFollowupQueryKeys.topic('user-a', 'topic')).not.toEqual(newsFollowupQueryKeys.topic('user-b', 'topic')); expect(newsFollowupQueryKeys.detail('user-a', 'item')).not.toEqual(newsFollowupQueryKeys.detail('user-b', 'item')) })
})
