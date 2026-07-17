import { useMutation } from '@tanstack/react-query'

import type { DatabaseClient } from '../../shared/supabase/client'
import { diagnoseWordPress } from './wordpressDiagnostics.service'

export const wordpressDiagnosticsQueryKeys = {
  all: ['wordpress-diagnostics'] as const,
  diagnose: () => [...wordpressDiagnosticsQueryKeys.all, 'diagnose'] as const,
}

export function useWordPressDiagnosticsMutation(client: DatabaseClient | null) {
  return useMutation({
    mutationKey: wordpressDiagnosticsQueryKeys.diagnose(),
    mutationFn: () => diagnoseWordPress(client),
  })
}
