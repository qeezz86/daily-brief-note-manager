export interface WordPressDraftPreparationGuard {
  planReady: boolean
  stale: boolean
  attemptsLoaded: boolean
  guarded: boolean
  pending: boolean
  submitted: boolean
}

export function canPrepareWordPressDraft(
  input: WordPressDraftPreparationGuard,
) {
  return input.planReady
    && !input.stale
    && input.attemptsLoaded
    && !input.guarded
    && !input.pending
    && !input.submitted
}
