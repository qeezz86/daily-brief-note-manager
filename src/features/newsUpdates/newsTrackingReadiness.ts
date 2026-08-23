export const newsTrackingReadinessStates = [
  'NOT_APPLICABLE',
  'NOT_RECORDED',
  'RECORDED',
] as const

export type NewsTrackingReadiness = (typeof newsTrackingReadinessStates)[number]

export function deriveNewsTrackingReadiness(
  contentGroup: string | null | undefined,
  linkedUpdateCount: number,
): NewsTrackingReadiness {
  if (contentGroup !== 'news') return 'NOT_APPLICABLE'
  return linkedUpdateCount > 0 ? 'RECORDED' : 'NOT_RECORDED'
}
