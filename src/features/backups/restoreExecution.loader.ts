export type RestoreExecutionModule = typeof import('./restoreExecution.module')
export type RestoreExecutionImporter = () => Promise<RestoreExecutionModule>

const defaultImporter: RestoreExecutionImporter = () => import('./restoreExecution.module')
let modulePromise: Promise<RestoreExecutionModule> | null = null

export function loadRestoreExecutionModule(
  importer: RestoreExecutionImporter = defaultImporter,
): Promise<RestoreExecutionModule> {
  if (modulePromise) return modulePromise

  const pending = importer()
  modulePromise = pending
  void pending.catch(() => {
    if (modulePromise === pending) modulePromise = null
  })
  return pending
}

export function resetRestoreExecutionLoaderForTests() {
  modulePromise = null
}
