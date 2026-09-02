import type { DatabaseClient } from '../../shared/supabase/client'

import {
  WordPressPostStatusPanel,
  type WordPressPostStatusAttempt,
} from './WordPressPostStatusPanel'

interface WordPressPostStatusDeferredProps {
  client: DatabaseClient | null
  contentId: string
  attempts: WordPressPostStatusAttempt[]
}

export function WordPressPostStatusDeferred(props: WordPressPostStatusDeferredProps) {
  return <WordPressPostStatusPanel {...props} autoStart />
}
