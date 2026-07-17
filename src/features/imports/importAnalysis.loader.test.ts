import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  loadImportAnalysisModule,
  resetImportAnalysisLoaderForTests,
  type ImportAnalysisImporter,
} from './importAnalysis.loader'

afterEach(resetImportAnalysisLoaderForTests)

describe('loadImportAnalysisModule', () => {
  it('loads once and reuses the same promise for concurrent calls', async () => {
    const module = {
      collectImportDuplicateCandidates: vi.fn(), ImportInputError: Error,
      parseImportJsonText: vi.fn(), prepareImportJob: vi.fn(),
      importInputErrorResult: vi.fn(), validateImportBundle: vi.fn(),
    }
    const importer = vi.fn(() => Promise.resolve(module)) as unknown as ImportAnalysisImporter

    const first = loadImportAnalysisModule(importer)
    const second = loadImportAnalysisModule(importer)

    expect(first).toBe(second)
    await expect(first).resolves.toBe(module)
    expect(importer).toHaveBeenCalledOnce()
  })

  it('allows retry after import failure', async () => {
    const module = {
      collectImportDuplicateCandidates: vi.fn(), ImportInputError: Error,
      parseImportJsonText: vi.fn(), prepareImportJob: vi.fn(),
      importInputErrorResult: vi.fn(), validateImportBundle: vi.fn(),
    }
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce(module) as unknown as ImportAnalysisImporter

    await expect(loadImportAnalysisModule(importer)).rejects.toThrow('chunk unavailable')
    await expect(loadImportAnalysisModule(importer)).resolves.toBe(module)
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
