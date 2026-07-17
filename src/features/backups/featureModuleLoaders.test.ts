import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  loadBackupGenerationModule,
  resetBackupGenerationLoaderForTests,
  type BackupGenerationImporter,
} from './backupGeneration.loader'
import {
  loadRestoreExecutionModule,
  resetRestoreExecutionLoaderForTests,
  type RestoreExecutionImporter,
} from './restoreExecution.loader'
import {
  loadRestorePlanModule,
  resetRestorePlanLoaderForTests,
  type RestorePlanImporter,
} from './restorePlan.loader'
import {
  loadRestoreValidationModule,
  resetRestoreValidationLoaderForTests,
  type RestoreValidationImporter,
} from './restoreValidation.loader'

afterEach(() => {
  resetBackupGenerationLoaderForTests()
  resetRestoreValidationLoaderForTests()
  resetRestorePlanLoaderForTests()
  resetRestoreExecutionLoaderForTests()
})

describe('backup and restore feature module loaders', () => {
  it('loads the backup module once and reuses the same concurrent promise', async () => {
    const module = { buildBackupBundle: vi.fn(), scanBackupForSecrets: vi.fn(), validateBackupRelationships: vi.fn() }
    const importer = vi.fn(() => Promise.resolve(module)) as unknown as BackupGenerationImporter

    const first = loadBackupGenerationModule(importer)
    const second = loadBackupGenerationModule(importer)

    expect(first).toBe(second)
    await expect(first).resolves.toBe(module)
    expect(importer).toHaveBeenCalledOnce()
  })

  it('clears a failed backup promise so the next action can retry', async () => {
    const module = { buildBackupBundle: vi.fn(), scanBackupForSecrets: vi.fn(), validateBackupRelationships: vi.fn() }
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce(module) as unknown as BackupGenerationImporter

    await expect(loadBackupGenerationModule(importer)).rejects.toThrow('chunk failed')
    await expect(loadBackupGenerationModule(importer)).resolves.toBe(module)
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('loads and caches restore validation independently', async () => {
    const module = { parseBackupFile: vi.fn(), parseBackupText: vi.fn(), validateBackupForRestore: vi.fn() }
    const importer = vi.fn(() => Promise.resolve(module)) as unknown as RestoreValidationImporter

    expect(loadRestoreValidationModule(importer)).toBe(loadRestoreValidationModule(importer))
    await expect(loadRestoreValidationModule(importer)).resolves.toBe(module)
    expect(importer).toHaveBeenCalledOnce()
  })

  it('retries restore validation after a failed import', async () => {
    const module = { parseBackupFile: vi.fn(), parseBackupText: vi.fn(), validateBackupForRestore: vi.fn() }
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(module) as unknown as RestoreValidationImporter

    await expect(loadRestoreValidationModule(importer)).rejects.toThrow('offline')
    await expect(loadRestoreValidationModule(importer)).resolves.toBe(module)
  })

  it('keeps validation, plan, and execution caches independent', async () => {
    const validationImporter = vi.fn(() => Promise.resolve({ parseBackupFile: vi.fn(), parseBackupText: vi.fn(), validateBackupForRestore: vi.fn() })) as unknown as RestoreValidationImporter
    const planImporter = vi.fn(() => Promise.resolve({ buildRestorePlan: vi.fn() })) as unknown as RestorePlanImporter
    const executionImporter = vi.fn(() => Promise.resolve({ parseBackupFile: vi.fn(), buildPreparedRestoreRecords: vi.fn(), prepareRestoreExecution: vi.fn(), validateRestoreExecution: vi.fn() })) as unknown as RestoreExecutionImporter

    await Promise.all([
      loadRestoreValidationModule(validationImporter),
      loadRestorePlanModule(planImporter),
      loadRestoreExecutionModule(executionImporter),
    ])

    expect(validationImporter).toHaveBeenCalledOnce()
    expect(planImporter).toHaveBeenCalledOnce()
    expect(executionImporter).toHaveBeenCalledOnce()
  })
})
