const chunkLoadErrorPatterns = [
  /chunkloaderror/i,
  /loading (?:css )?chunk [\d-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
]

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false

  return chunkLoadErrorPatterns.some((pattern) => pattern.test(`${error.name} ${error.message}`))
}
