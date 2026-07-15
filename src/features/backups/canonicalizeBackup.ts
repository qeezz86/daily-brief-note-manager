import { canonicalizeJson } from '../../shared/json/canonicalizeJson'
export function canonicalizeBackup(value: unknown): string {
  return canonicalizeJson(value)
}
