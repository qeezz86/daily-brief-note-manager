import type { RestorePlan } from './restorePlan.types'

export function createRestorePlanFileName(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `daily-brief-note-restore-plan-${part('year')}-${part('month')}-${part('day')}-${part('hour')}${part('minute')}${part('second')}.json`
}

export function serializeRestorePlan(plan: RestorePlan) { return `${JSON.stringify(plan, null, 2)}\n` }

export function downloadRestorePlan(
  plan: RestorePlan,
  browser: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  const blob = new Blob([serializeRestorePlan(plan)], { type: 'application/json;charset=utf-8' })
  const url = browser.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = createRestorePlanFileName(new Date(plan.createdAt)); anchor.style.display = 'none'
  document.body.append(anchor)
  try { anchor.click() } finally { anchor.remove(); browser.revokeObjectURL(url) }
  return blob
}

export function restorePlanIssuesText(plan: RestorePlan) {
  return plan.issues.filter((issue) => issue.severity !== 'info').map((issue) => `[${issue.severity}] ${issue.code} · ${issue.section} · ${issue.message}`).join('\n') || '문제 없음'
}

export function restoreIdMapSummaryText(plan: RestorePlan) {
  return plan.recordActions.filter((action) => action.action === 'remap_id').map((action) => `${action.section} · ${action.safeDisplay} · deterministic UUID v5 remap`).join('\n') || 'ID remap 없음'
}

