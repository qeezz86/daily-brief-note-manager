import { canonicalizeImportPayload } from './canonicalizeImportPayload'

export class ImportFingerprintUnavailableError extends Error {
  constructor() { super('이 브라우저에서는 안전한 SHA-256 fingerprint를 만들 수 없습니다.') }
}

export async function createImportFingerprint(value: unknown, cryptoApi: Crypto | undefined = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new ImportFingerprintUnavailableError()
  const bytes = new TextEncoder().encode(canonicalizeImportPayload(value))
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
