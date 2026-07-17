export type RestorePlanModule = typeof import('./restorePlan.module')
export type RestorePlanImporter = () => Promise<RestorePlanModule>

const defaultImporter: RestorePlanImporter = () => import('./restorePlan.module')
let modulePromise: Promise<RestorePlanModule> | null = null

export function loadRestorePlanModule(
  importer: RestorePlanImporter = defaultImporter,
): Promise<RestorePlanModule> {
  if (modulePromise) return modulePromise

  const pending = importer()
  modulePromise = pending
  void pending.catch(() => {
    if (modulePromise === pending) modulePromise = null
  })
  return pending
}

export function resetRestorePlanLoaderForTests() {
  modulePromise = null
}
