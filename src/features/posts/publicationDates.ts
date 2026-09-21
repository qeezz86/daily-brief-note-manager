import { isOfficialCctvArticleUrl } from './publicationFields'

export type PublicationTimeZone = 'Asia/Seoul' | 'Asia/Shanghai'

export function sourceTimeZone(url: string): PublicationTimeZone {
  return isOfficialCctvArticleUrl(url) ? 'Asia/Shanghai' : 'Asia/Seoul'
}

function localParts(date: Date, timeZone: PublicationTimeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`
}

/** Interpret wall-clock input in the specified zone, never in the browser's zone. */
export function publicationTimestamp(value: string | null | undefined, timeZone: PublicationTimeZone): string | null {
  const text = value?.trim().replace(' ', 'T')
  if (!text) return null
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text)
  if (!match) throw new Error('올바른 게시·업데이트 시각을 입력해 주세요.')
  const wall = `${match[1]}:${match[2] ?? '00'}`
  const wallMillis = Date.parse(`${wall}Z`)
  if (!Number.isFinite(wallMillis) || new Date(wallMillis).toISOString().slice(0, 19) !== wall) {
    throw new Error('올바른 게시·업데이트 시각을 입력해 주세요.')
  }
  if (match[4]) {
    if (!Number.isFinite(Date.parse(text))) throw new Error('올바른 게시·업데이트 시각을 입력해 주세요.')
    return text
  }

  // Resolve with IANA rules, including historical offsets; reject nonexistent local times.
  let instant = wallMillis
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const difference = wallMillis - Date.parse(`${localParts(new Date(instant), timeZone)}Z`)
    if (difference === 0) return `${new Date(instant).toISOString().slice(0, 19)}${match[3] ?? ''}Z`
    instant += difference
  }
  throw new Error('해당 시간대에 존재하지 않는 시각입니다.')
}

export function isPublicationTimestamp(value: string, timeZone: PublicationTimeZone): boolean {
  try { publicationTimestamp(value, timeZone); return true } catch { return false }
}

/** datetime-local supports milliseconds; finer stored precision is retained on unchanged saves. */
export function publicationDateTimeInput(value: string | null | undefined, timeZone: PublicationTimeZone): string {
  const timestamp = publicationTimestamp(value, timeZone)
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const local = localParts(date, timeZone)
  const fraction = String(date.getUTCMilliseconds()).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${local}.${fraction}` : local.endsWith(':00') ? local.slice(0, -3) : local
}

export function preservePublicationTimestamp(value: string, original: string | null | undefined, timeZone: PublicationTimeZone): string {
  const timestamp = publicationTimestamp(value, timeZone)
  return timestamp && original && publicationDateTimeInput(timestamp, timeZone) === publicationDateTimeInput(original, timeZone)
    ? original : value
}
