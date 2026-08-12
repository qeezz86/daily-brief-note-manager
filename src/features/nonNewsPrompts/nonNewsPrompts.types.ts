import type { Category } from '../categories/categories.types'
import type {
  NonNewsContextBuildResult,
  SupportedNonNewsCategoryId as ContextCategoryId,
} from '../nonNewsContexts/nonNewsContexts.types'

export type SupportedNonNewsCategoryId = ContextCategoryId

export type NonNewsAuthoringPromptTemplateVersion =
  'non-news-authoring-prompt-v1'

export type NonNewsPromptCategorySettings = Pick<
  Category,
  | 'id'
  | 'content_group'
  | 'name'
  | 'display_id_pattern'
  | 'slug_pattern'
  | 'wrapper_class'
>

export interface NonNewsAuthoringPromptInput {
  templateVersion: NonNewsAuthoringPromptTemplateVersion
  category: SupportedNonNewsCategoryId
  topic: string
  angleOrFocus: string
  additionalInstruction: string
  context: NonNewsContextBuildResult
  categorySettings: NonNewsPromptCategorySettings
}

export interface NonNewsAuthoringPromptBuildResult {
  text: string
  templateVersion: NonNewsAuthoringPromptTemplateVersion
  category: SupportedNonNewsCategoryId
  contextItemCount: number
  contextLimit: number
}

export type NonNewsPromptValidationStatus = 'valid' | 'warning' | 'invalid'

export type AdditionalInstructionConflictClass =
  | 'hierarchy-bypass'
  | 'mandatory-output-change'
  | 'category-settings-override'
  | 'chinese-id-generation'
  | 'protected-data-disclosure'
  | 'raw-html-context-insertion'
  | 'copyright-source-fabrication'
  | 'image-storage-or-html-prompt'
  | 'external-write-or-publication'
  | 'external-api-or-model-execution'

export interface NonNewsPromptValidationError {
  code: string
  message: string
  section: string
  conflictClass?: AdditionalInstructionConflictClass
}

export interface NonNewsPromptValidationWarning {
  code: string
  message: string
  section: string
}

export interface NonNewsPromptValidationCheck {
  code: string
  message: string
  section: string
}

export interface NonNewsPromptValidationMetrics {
  characterCount: number
  lineCount: number
  sectionCount: number
  contextItemCount: number
  contextLimit: number
}

export interface NonNewsPromptValidationResult {
  validationVersion: 1
  status: NonNewsPromptValidationStatus
  errors: NonNewsPromptValidationError[]
  warnings: NonNewsPromptValidationWarning[]
  checks: NonNewsPromptValidationCheck[]
  metrics: NonNewsPromptValidationMetrics
}

export interface ValidateNonNewsAuthoringPromptInput
  extends NonNewsAuthoringPromptInput {
  promptText: string
}
