export function preserveText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ')
}

export function comparisonKey(value: string): string {
  return preserveText(value).toLowerCase()
}

export function taxonomyLocalKey(value: string): string {
  return comparisonKey(value)
}

export function uniqueSortedIntegers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]))
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
