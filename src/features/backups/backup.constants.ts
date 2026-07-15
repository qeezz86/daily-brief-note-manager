import type { BackupProfile } from './backup.types'

export const BACKUP_FORMAT = 'daily-brief-note-backup' as const
export const BACKUP_SCHEMA_VERSION = 1 as const
export const BACKUP_SNAPSHOT_SCHEMA_VERSION = 1 as const
export const BACKUP_CHECKSUM_ALGORITHM = 'SHA-256' as const

export const BACKUP_WARNING_BYTES = 20 * 1024 * 1024
export const BACKUP_HARD_LIMIT_BYTES = 100 * 1024 * 1024

export const CORE_BACKUP_SECTIONS = [
  'posts',
  'seoData',
  'tags',
  'postTags',
  'sources',
  'aiMetadata',
  'infoDbMetadata',
  'chineseMetadata',
  'seriesCounters',
  'newsTopics',
  'newsStatusHistory',
  'newsUpdates',
  'newsFollowups',
  'generatedPrompts',
] as const

export const OPERATIONAL_BACKUP_SECTIONS = [
  'importJobs',
  'importJobItems',
  'importJobItemAttempts',
] as const

export const BACKUP_SECTIONS_BY_PROFILE = {
  core: CORE_BACKUP_SECTIONS,
  full: [...CORE_BACKUP_SECTIONS, ...OPERATIONAL_BACKUP_SECTIONS],
} as const satisfies Record<BackupProfile, readonly string[]>

export const BACKUP_GENERATION_STEPS = [
  '데이터 snapshot 조회',
  '관계 무결성 검증',
  '민감정보 검사',
  'canonical JSON 생성',
  'checksum 계산·검증',
  '파일 준비 완료',
] as const
