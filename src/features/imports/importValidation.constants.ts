export const CONTENT_IMPORT_FORMAT = 'daily-brief-note-content-import'
export const CONTENT_IMPORT_SCHEMA_VERSION = 1
export const IMPORT_VALIDATION_VERSION = 1
export const IMPORT_DUPLICATE_QUERY_CHUNK_SIZE = 100
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024
export const MAX_IMPORT_POSTS = 2_000
export const MAX_IMPORT_NESTING_DEPTH = 30
export const MAX_IMPORT_STRING_LENGTH = 5 * 1024 * 1024
export const IMPORT_LIST_RENDER_LIMIT = 200

export const forbiddenImportKeys = new Set([
  '__proto__',
  'constructor',
  'prototype',
])
