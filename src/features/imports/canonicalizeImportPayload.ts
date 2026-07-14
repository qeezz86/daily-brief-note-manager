export type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson }

function normalize(value: unknown, inArray: boolean): CanonicalJson | undefined {
  if (value === null) return null
  if (value === undefined) return inArray ? null : undefined
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Fingerprint payload에는 유한한 숫자만 사용할 수 있습니다.')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, true) ?? null)
  if (typeof value === 'object') {
    const output: Record<string, CanonicalJson> = {}
    Object.keys(value as Record<string, unknown>).sort().forEach((key) => {
      const child = normalize((value as Record<string, unknown>)[key], false)
      if (child !== undefined) output[key] = child
    })
    return output
  }
  throw new TypeError('Fingerprint payload에 지원하지 않는 값이 있습니다.')
}

/** Object의 undefined는 제거하고 array의 undefined는 위치 보존을 위해 null로 정규화한다. */
export function canonicalizeImportPayload(value: unknown): string {
  const normalized = normalize(value, false)
  if (normalized === undefined) throw new TypeError('Fingerprint payload가 비어 있습니다.')
  return JSON.stringify(normalized)
}
