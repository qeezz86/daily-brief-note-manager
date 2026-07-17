export type BackupGenerationModule = typeof import('./backupGeneration.module')
export type BackupGenerationImporter = () => Promise<BackupGenerationModule>

const defaultImporter: BackupGenerationImporter = () => import('./backupGeneration.module')
let modulePromise: Promise<BackupGenerationModule> | null = null

export function loadBackupGenerationModule(
  importer: BackupGenerationImporter = defaultImporter,
): Promise<BackupGenerationModule> {
  if (modulePromise) return modulePromise

  const pending = importer()
  modulePromise = pending
  void pending.catch(() => {
    if (modulePromise === pending) modulePromise = null
  })
  return pending
}

export function resetBackupGenerationLoaderForTests() {
  modulePromise = null
}
