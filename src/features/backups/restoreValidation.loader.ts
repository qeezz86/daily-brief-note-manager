export type RestoreValidationModule = typeof import('./restoreValidation.module')
export type RestoreValidationImporter = () => Promise<RestoreValidationModule>

const defaultImporter: RestoreValidationImporter = () => import('./restoreValidation.module')
let modulePromise: Promise<RestoreValidationModule> | null = null

export function loadRestoreValidationModule(
  importer: RestoreValidationImporter = defaultImporter,
): Promise<RestoreValidationModule> {
  if (modulePromise) return modulePromise

  const pending = importer()
  modulePromise = pending
  void pending.catch(() => {
    if (modulePromise === pending) modulePromise = null
  })
  return pending
}

export function resetRestoreValidationLoaderForTests() {
  modulePromise = null
}
