import type { BackupProfile } from './backup.types'

export function createBackupFileName(profile: BackupProfile, date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `daily-brief-note-backup-${profile}-${part('year')}-${part('month')}-${part('day')}-${part('hour')}${part('minute')}${part('second')}.json`
}
