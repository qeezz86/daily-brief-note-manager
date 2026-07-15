export function formatBackupBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
