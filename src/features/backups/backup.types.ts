import type { z } from 'zod'
import type {
  backupBundleSchema,
  backupEstimateSchema,
  backupSnapshotSchema,
} from './backup.schema'

export type BackupProfile = 'core' | 'full'
export type BackupEstimate = z.infer<typeof backupEstimateSchema>
export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>
export type BackupBundle = z.infer<typeof backupBundleSchema>
export type BackupData = BackupSnapshot['data']

export type BackupValidationIssue = {
  code: string
  section: string
  message: string
}

export type BackupValidationResult = {
  valid: boolean
  issues: BackupValidationIssue[]
}

export type BackupSecretIssue = {
  code: 'forbidden-key' | 'token-pattern'
  path: string
  message: string
}

export type BuiltBackup = {
  bundle: BackupBundle
  canonicalPayload: string
  json: string
  byteSize: number
  fileName: string
  sizeWarning: boolean
  relationshipValidation: BackupValidationResult
}
