export const RESTORE_PLAN_FORMAT = 'daily-brief-note-restore-plan' as const
export const RESTORE_PLAN_SCHEMA_VERSION = 1 as const
export const RESTORE_PLAN_VERSION = 1 as const
export const RESTORE_PLAN_CHECKSUM_ALGORITHM = 'SHA-256' as const

// This namespace is application-owned and must remain stable across restore plan versions.
export const RESTORE_UUID_NAMESPACE = '0f53d9b2-c6bb-5c5f-9bd4-63cdd62bb807' as const

export const RESTORE_ENTITY_SECTIONS = [
  'posts', 'tags', 'sources', 'newsTopics', 'newsStatusHistory', 'newsUpdates',
  'newsFollowups', 'generatedPrompts', 'importJobs', 'importJobItems',
  'importJobItemAttempts', 'wordpressTaxonomyMappings',
] as const

export const RESTORE_EXECUTION_STAGE_ORDER = [
  'wordpressTaxonomyMappings', 'tags', 'posts', 'metadata', 'postTags', 'seriesCounters', 'newsTopics',
  'newsStatusHistory', 'newsUpdates', 'newsUpdatePreviousLinks', 'sources',
  'newsFollowups', 'generatedPrompts', 'importJobs', 'importJobItems',
  'importJobItemAttempts',
] as const
