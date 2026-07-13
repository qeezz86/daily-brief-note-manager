import {
  CONTENT_IMPORT_SCHEMA_VERSION,
  forbiddenImportKeys,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_NESTING_DEPTH,
  MAX_IMPORT_STRING_LENGTH,
} from './importValidation.constants'

export class ImportInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path = '$',
  ) {
    super(message)
  }
}

function inspectJsonValue(value: unknown, path: string, depth: number): void {
  if (depth > MAX_IMPORT_NESTING_DEPTH) {
    throw new ImportInputError(
      'BUNDLE_NESTING_TOO_DEEP',
      `JSON 중첩 깊이는 ${MAX_IMPORT_NESTING_DEPTH}단계를 넘을 수 없습니다.`,
      path,
    )
  }
  if (typeof value === 'string' && value.length > MAX_IMPORT_STRING_LENGTH) {
    throw new ImportInputError(
      'BUNDLE_STRING_TOO_LONG',
      'JSON에 허용 범위를 넘는 긴 문자열이 포함되어 있습니다.',
      path,
    )
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenImportKeys.has(key)) {
      throw new ImportInputError(
        'BUNDLE_FORBIDDEN_KEY',
        `보안을 위해 ${key} 키를 사용할 수 없습니다.`,
        `${path}.${key}`,
      )
    }
    inspectJsonValue(child, `${path}.${key}`, depth + 1)
  }
}

export function parseImportJsonText(text: string): unknown {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (!withoutBom.trim()) {
    throw new ImportInputError('BUNDLE_EMPTY_INPUT', '검증할 JSON을 입력해 주세요.')
  }
  if (new TextEncoder().encode(withoutBom).byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new ImportInputError(
      'BUNDLE_FILE_TOO_LARGE',
      `JSON은 최대 ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB까지 검증할 수 있습니다.`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(withoutBom)
  } catch {
    throw new ImportInputError('BUNDLE_JSON_INVALID', '올바른 JSON 형식이 아닙니다.')
  }
  inspectJsonValue(parsed, '$', 0)
  return parsed
}

export function isSupportedImportSchemaVersion(value: unknown): value is number {
  return value === CONTENT_IMPORT_SCHEMA_VERSION
}
