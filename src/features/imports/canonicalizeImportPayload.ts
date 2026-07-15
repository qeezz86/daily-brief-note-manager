import { canonicalizeJson } from '../../shared/json/canonicalizeJson'

export type { CanonicalJson } from '../../shared/json/canonicalizeJson'

/** Object의 undefined는 제거하고 array의 undefined는 위치 보존을 위해 null로 정규화한다. */
export function canonicalizeImportPayload(value: unknown): string {
  return canonicalizeJson(value)
}
