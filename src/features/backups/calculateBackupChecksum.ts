import { canonicalizeBackup } from './canonicalizeBackup'

export class BackupChecksumUnavailableError extends Error {
  constructor() {
    super('이 브라우저에서는 안전한 SHA-256 checksum을 만들 수 없습니다.')
  }
}

export async function calculateBackupChecksum(
  payloadWithoutChecksum: unknown,
  cryptoApi: Crypto | undefined = globalThis.crypto,
): Promise<string> {
  if (!cryptoApi?.subtle) throw new BackupChecksumUnavailableError()
  const canonical = canonicalizeBackup(payloadWithoutChecksum)
  const digest = await cryptoApi.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyBackupChecksum(
  bundle: { checksum: { value: string }; [key: string]: unknown },
  cryptoApi: Crypto | undefined = globalThis.crypto,
): Promise<boolean> {
  const { checksum, ...payload } = bundle
  const actual = await calculateBackupChecksum(payload, cryptoApi)
  return actual === checksum.value
}
