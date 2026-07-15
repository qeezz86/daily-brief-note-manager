export function downloadBackupFile(
  json: string,
  fileName: string,
  browser: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = browser.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    browser.revokeObjectURL(url)
  }
  return blob
}
