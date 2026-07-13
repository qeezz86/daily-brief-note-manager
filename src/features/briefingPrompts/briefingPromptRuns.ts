import type {
  BriefingPromptRun,
  BriefingPromptRunFilters,
} from './briefingPrompts.types'

export function filterPromptRuns(
  runs: BriefingPromptRun[],
  filters: BriefingPromptRunFilters,
): BriefingPromptRun[] {
  return runs.filter((run) => (
    (!filters.categoryId || run.categoryId === filters.categoryId)
    && (!filters.promptMode || run.promptMode === filters.promptMode)
    && (filters.pin === 'all'
      || (filters.pin === 'pinned' ? run.isPinned : !run.isPinned))
  ))
}

export function formatPromptRunDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function summarizePromptText(value: string): string {
  const line = value.split('\n').find((item) => item.startsWith('작업:'))
    ?? value.split('\n').find((item) => item.trim() && !item.startsWith('[BEGIN_'))
    ?? value
  return line.length > 140 ? `${line.slice(0, 140)}…` : line
}
