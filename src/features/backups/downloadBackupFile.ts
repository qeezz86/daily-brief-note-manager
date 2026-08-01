function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string,
  browser: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  const blob = new Blob([content], { type: mimeType })
  const url = browser.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    setTimeout(() => {
      anchor.remove()
      browser.revokeObjectURL(url)
    }, 0)
  }
  return blob
}

export function downloadBackupFile(
  json: string,
  fileName: string,
  browser: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  return downloadTextFile(json, fileName, 'application/json;charset=utf-8', browser)
}

export function downloadBackupCsvFile(
  csv: string,
  fileName: string,
  browser: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  return downloadTextFile(csv, fileName, 'text/csv;charset=utf-8', browser)
}
