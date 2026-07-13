import type {
  BriefingPromptMode,
  BriefingPromptSettings,
  NewsBriefingPromptContext,
} from './briefingPrompts.types'

export const BRIEFING_PROMPT_VALIDATION_VERSION = 1 as const

export type BriefingPromptValidationStatus = 'valid' | 'warning' | 'invalid'
export type BriefingPromptValidationSeverity = 'error' | 'warning' | 'check'

export interface BriefingPromptValidationIssue {
  code: string
  severity: BriefingPromptValidationSeverity
  message: string
  section: string
  relatedKey?: string
  detail?: string
}

export interface BriefingPromptValidationResult {
  validationVersion: typeof BRIEFING_PROMPT_VALIDATION_VERSION
  status: BriefingPromptValidationStatus
  errors: BriefingPromptValidationIssue[]
  warnings: BriefingPromptValidationIssue[]
  checks: BriefingPromptValidationIssue[]
  metrics: {
    characterCount: number
    lineCount: number
    sectionCount: number
  }
}

export interface BriefingPromptValidationSummary {
  status: Exclude<BriefingPromptValidationStatus, 'invalid'>
  errorCount: 0
  warningCount: number
  checkCount: number
}

export interface ValidateBriefingPromptInput {
  promptText: string
  context: NewsBriefingPromptContext
  mode: BriefingPromptMode
  settings: BriefingPromptSettings
  promptTemplateVersion: number
}

export function summarizeBriefingPromptValidation(
  result: BriefingPromptValidationResult,
): BriefingPromptValidationSummary | null {
  if (result.status === 'invalid') return null
  return {
    status: result.status,
    errorCount: 0,
    warningCount: result.warnings.length,
    checkCount: result.checks.length,
  }
}
