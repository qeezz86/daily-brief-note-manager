import { RESTORE_UUID_NAMESPACE } from './restorePlan.constants'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uuidBytes(value: string): Uint8Array {
  if (!UUID_PATTERN.test(value)) throw new Error('RESTORE_UUID_NAMESPACE_INVALID')
  const hex = value.replaceAll('-', '')
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
}

function formatUuid(bytes: Uint8Array) {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export async function createDeterministicRestoreId(
  backupChecksum: string,
  section: string,
  originalId: string,
  options: { cryptoApi?: Crypto; saltVersion?: number } = {},
): Promise<string> {
  const cryptoApi = options.cryptoApi ?? globalThis.crypto
  if (!cryptoApi?.subtle) throw new Error('RESTORE_UUID_CRYPTO_UNAVAILABLE')
  const name = `${backupChecksum}:${section}:${originalId}:v${options.saltVersion ?? 1}`
  const nameBytes = new TextEncoder().encode(name)
  const input = new Uint8Array(16 + nameBytes.length)
  input.set(uuidBytes(RESTORE_UUID_NAMESPACE)); input.set(nameBytes, 16)
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-1', input))
  const output = digest.slice(0, 16)
  output[6] = (output[6] & 0x0f) | 0x50
  output[8] = (output[8] & 0x3f) | 0x80
  const id = formatUuid(output)
  if (id.toLowerCase() === originalId.toLowerCase()) throw new Error('RESTORE_UUID_EQUALS_SOURCE')
  return id
}

