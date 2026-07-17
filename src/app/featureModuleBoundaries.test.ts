import { describe, expect, it } from 'vitest'

import appLayoutSource from '../layouts/AppLayout.tsx?raw'
import backupPageSource from '../pages/BackupPage.tsx?raw'
import importHistoryPageSource from '../pages/ImportHistoryPage.tsx?raw'
import importJobDetailPageSource from '../pages/ImportJobDetailPage.tsx?raw'
import importPageSource from '../pages/ImportPage.tsx?raw'
import loginPageSource from '../pages/LoginPage.tsx?raw'
import restoreExecutePageSource from '../pages/BackupRestoreExecutePage.tsx?raw'
import restoreJobDetailPageSource from '../pages/BackupRestoreJobDetailPage.tsx?raw'
import restoreJobsPageSource from '../pages/BackupRestoreJobsPage.tsx?raw'
import restorePageSource from '../pages/BackupRestorePage.tsx?raw'
import authProviderSource from '../features/auth/AuthProvider.tsx?raw'
import backupLoaderSource from '../features/backups/backupGeneration.loader.ts?raw'
import restoreExecutionLoaderSource from '../features/backups/restoreExecution.loader.ts?raw'
import restorePlanLoaderSource from '../features/backups/restorePlan.loader.ts?raw'
import restoreValidationLoaderSource from '../features/backups/restoreValidation.loader.ts?raw'
import importLoaderSource from '../features/imports/importAnalysis.loader.ts?raw'

describe('feature module boundaries', () => {
  it('keeps heavy Backup, Restore, and Import engines out of page static imports', () => {
    expect(backupPageSource).not.toContain("from '../features/backups/buildBackupBundle'")
    expect(restorePageSource).not.toContain("from '../features/backups/validateBackupForRestore'")
    expect(restorePageSource).not.toContain("from '../features/backups/buildRestorePlan'")
    expect(restoreExecutePageSource).not.toMatch(/^import \{.*from '\.\.\/features\/backups\/validateRestoreExecution'/m)
    expect(restoreExecutePageSource).toContain("import type { RestoreExecutionValidation } from '../features/backups/validateRestoreExecution'")
    expect(importPageSource).not.toContain("from '../features/imports/importSchema'")
    expect(importPageSource).not.toContain("from '../features/imports/validateImportBundle'")
    expect(importPageSource).not.toContain("from '../features/imports/prepareImportJob'")
  })

  it('uses static literal imports in every feature loader', () => {
    expect(backupLoaderSource).toContain("import('./backupGeneration.module')")
    expect(restoreValidationLoaderSource).toContain("import('./restoreValidation.module')")
    expect(restorePlanLoaderSource).toContain("import('./restorePlan.module')")
    expect(restoreExecutionLoaderSource).toContain("import('./restoreExecution.module')")
    expect(importLoaderSource).toContain("import('./importAnalysis.module')")
    for (const source of [backupLoaderSource, restoreValidationLoaderSource, restorePlanLoaderSource, restoreExecutionLoaderSource, importLoaderSource]) {
      expect(source).not.toMatch(/import\(`|import\([^'"]/)
    }
  })

  it('keeps job list and detail pages independent from analysis and plan engines', () => {
    for (const source of [importHistoryPageSource, importJobDetailPageSource]) {
      expect(source).not.toContain('importAnalysis')
      expect(source).not.toContain('validateImportBundle')
    }
    for (const source of [restoreJobsPageSource, restoreJobDetailPageSource]) {
      expect(source).not.toContain('restorePlan.loader')
      expect(source).not.toContain('buildRestorePlan')
      expect(source).not.toContain('restoreExecution.loader')
    }
  })

  it('keeps auth, shell, and login independent from feature engines', () => {
    for (const source of [authProviderSource, appLayoutSource, loginPageSource]) {
      expect(source).not.toMatch(/features\/(?:backups|imports)/)
      expect(source).not.toContain('GenerationModule')
      expect(source).not.toContain('AnalysisModule')
    }
  })
})
