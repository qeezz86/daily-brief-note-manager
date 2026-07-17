export type ImportAnalysisModule = typeof import('./importAnalysis.module')
export type ImportAnalysisImporter = () => Promise<ImportAnalysisModule>

const defaultImporter: ImportAnalysisImporter = () => import('./importAnalysis.module')
let modulePromise: Promise<ImportAnalysisModule> | null = null

export function loadImportAnalysisModule(
  importer: ImportAnalysisImporter = defaultImporter,
): Promise<ImportAnalysisModule> {
  if (modulePromise) return modulePromise

  const pending = importer()
  modulePromise = pending
  void pending.catch(() => {
    if (modulePromise === pending) modulePromise = null
  })
  return pending
}

export function resetImportAnalysisLoaderForTests() {
  modulePromise = null
}
