import { useMemo, useRef, useState } from 'react'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import type { NonNewsContextBuildResult } from '../nonNewsContexts/nonNewsContexts.types'
import { buildNonNewsAuthoringPrompt } from './buildNonNewsAuthoringPrompt'
import {
  findAdditionalInstructionConflicts,
  NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION,
  normalizeNonNewsPromptInput,
} from './nonNewsPromptRules'
import type {
  NonNewsAuthoringPromptBuildResult,
  NonNewsAuthoringPromptInput,
  NonNewsPromptCategorySettings,
  NonNewsPromptValidationResult,
  SupportedNonNewsCategoryId,
} from './nonNewsPrompts.types'
import { validateNonNewsAuthoringPrompt } from './validateNonNewsAuthoringPrompt'

type CopyState = 'success' | 'error' | null

interface GeneratedPreview {
  build: NonNewsAuthoringPromptBuildResult
  validation: NonNewsPromptValidationResult
  triggerSignature: string
}

interface NonNewsPromptComposerProps {
  category: SupportedNonNewsCategoryId
  context: NonNewsContextBuildResult | null
  categorySettings: NonNewsPromptCategorySettings | null
  unavailableReason?: string | null
}

function triggerSignature(
  category: SupportedNonNewsCategoryId,
  topic: string,
  angleOrFocus: string,
  additionalInstruction: string,
  context: NonNewsContextBuildResult | null,
  categorySettings: NonNewsPromptCategorySettings | null,
): string {
  return JSON.stringify({
    templateVersion: NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION,
    category,
    topic,
    angleOrFocus,
    additionalInstruction,
    context: context
      ? {
          text: context.text,
          actualCount: context.actualCount,
          maxCount: context.maxCount,
        }
      : null,
    categorySettings: categorySettings
      ? {
          wrapper: categorySettings.wrapper_class,
          displayIdPattern: categorySettings.display_id_pattern,
          slugPattern: categorySettings.slug_pattern,
          contentGroup: categorySettings.content_group,
        }
      : null,
  })
}

export function NonNewsPromptComposer({
  category,
  context,
  categorySettings,
  unavailableReason = null,
}: NonNewsPromptComposerProps) {
  const [topic, setTopic] = useState('')
  const [angleOrFocus, setAngleOrFocus] = useState('')
  const [additionalInstruction, setAdditionalInstruction] = useState('')
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<GeneratedPreview | null>(null)
  const [copyState, setCopyState] = useState<CopyState>(null)
  const copyOperation = useRef(0)
  const currentSignature = useMemo(
    () => triggerSignature(
      category,
      topic,
      angleOrFocus,
      additionalInstruction,
      context,
      categorySettings,
    ),
    [
      additionalInstruction,
      angleOrFocus,
      category,
      categorySettings,
      context,
      topic,
    ],
  )
  const isStale = Boolean(
    preview && preview.triggerSignature !== currentSignature,
  )
  const canCopy = Boolean(
    preview
      && !isStale
      && preview.validation.errors.length === 0
      && (preview.validation.status === 'valid'
        || preview.validation.status === 'warning'),
  )

  function updateField(setter: (value: string) => void, value: string): void {
    setter(value)
    setFormErrors([])
    setCopyState(null)
  }

  function generatePrompt(): void {
    setCopyState(null)
    const nextErrors: string[] = []
    if (!normalizeNonNewsPromptInput(topic)) {
      nextErrors.push('새 글 주제를 입력해 주세요.')
    }
    if (!context) {
      nextErrors.push('Phase 5I 컨텍스트가 준비될 때까지 기다려 주세요.')
    }
    if (!categorySettings) {
      nextErrors.push('활성 카테고리 설정을 불러올 수 없습니다.')
    }
    const conflicts = findAdditionalInstructionConflicts(additionalInstruction)
    nextErrors.push(...conflicts.map((conflict) => conflict.message))
    if (nextErrors.length > 0 || !context || !categorySettings) {
      setFormErrors(nextErrors)
      return
    }

    const input: NonNewsAuthoringPromptInput = {
      templateVersion: NON_NEWS_AUTHORING_PROMPT_TEMPLATE_VERSION,
      category,
      topic,
      angleOrFocus,
      additionalInstruction,
      context,
      categorySettings,
    }
    try {
      const build = buildNonNewsAuthoringPrompt(input)
      const validation = validateNonNewsAuthoringPrompt({
        ...input,
        promptText: build.text,
      })
      setPreview({ build, validation, triggerSignature: currentSignature })
      setFormErrors([])
    } catch (error) {
      setFormErrors([
        error instanceof Error
          ? error.message
          : '작성 프롬프트를 생성하지 못했습니다.',
      ])
    }
  }

  async function copyPrompt(): Promise<void> {
    if (!preview || !canCopy) return
    const currentOperation = ++copyOperation.current
    setCopyState(null)
    try {
      await copyTextToClipboard(preview.build.text)
      if (copyOperation.current === currentOperation) setCopyState('success')
    } catch {
      if (copyOperation.current === currentOperation) setCopyState('error')
    }
  }

  const statusLabel = preview
    ? isStale
      ? '오래된 미리보기'
      : preview.validation.status === 'valid'
        ? '유효'
        : preview.validation.status === 'warning'
          ? '경고 있음'
          : '오류 있음'
    : null

  return (
    <section className="non-news-composer" aria-labelledby="non-news-composer-title">
      <div className="non-news-composer__heading">
        <div>
          <p className="dashboard__eyebrow">Authoring prompt composer</p>
          <h2 id="non-news-composer-title">비뉴스 새 글 작성 프롬프트</h2>
          <p>위 중복 방지 컨텍스트를 그대로 사용해 별도의 작성 프롬프트를 만듭니다.</p>
        </div>
        <span className="status-badge">{categorySettings?.name ?? category}</span>
      </div>

      {unavailableReason ? (
        <div className="content-state content-state--error" aria-live="polite">
          <p>{unavailableReason}</p>
        </div>
      ) : null}

      <div className="non-news-composer__form">
        <div className="post-form__field post-form__field--wide">
          <label htmlFor="non-news-prompt-topic">새 글 주제</label>
          <input
            id="non-news-prompt-topic"
            value={topic}
            aria-invalid={formErrors.includes('새 글 주제를 입력해 주세요.')}
            onChange={(event) => updateField(setTopic, event.target.value)}
          />
        </div>
        <div className="post-form__field post-form__field--wide">
          <label htmlFor="non-news-prompt-angle">각도 또는 초점 (선택)</label>
          <textarea
            id="non-news-prompt-angle"
            value={angleOrFocus}
            onChange={(event) => updateField(setAngleOrFocus, event.target.value)}
          />
        </div>
        <div className="post-form__field post-form__field--wide">
          <label htmlFor="non-news-prompt-additional">사용자 추가 지시 (선택)</label>
          <textarea
            id="non-news-prompt-additional"
            value={additionalInstruction}
            onChange={(event) => updateField(setAdditionalInstruction, event.target.value)}
          />
          <p className="field-help">독자·어조·강조점·예시·깊이·출처 선호를 지정할 수 있으며 고정 규칙은 바꿀 수 없습니다.</p>
        </div>
        <div className="non-news-composer__actions">
          <button
            className="primary-button"
            type="button"
            disabled={Boolean(unavailableReason)}
            onClick={generatePrompt}
          >
            {preview ? '프롬프트 다시 생성' : '작성 프롬프트 생성'}
          </button>
        </div>
      </div>

      {formErrors.length > 0 ? (
        <div className="form-alert" role="alert">
          <strong>프롬프트를 생성할 수 없습니다.</strong>
          <ul>{formErrors.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : null}

      {preview ? (
        <div className="prompt-results">
          <section className={`prompt-panel prompt-validation prompt-validation--${isStale ? 'stale' : preview.validation.status}`} aria-labelledby="non-news-prompt-validation-title">
            <div className="prompt-panel__heading">
              <div>
                <h3 id="non-news-prompt-validation-title">작성 프롬프트 검증</h3>
                <p className="prompt-validation__status" role="status">{statusLabel}</p>
              </div>
              <dl className="prompt-validation__summary">
                <div><dt>오류</dt><dd>{preview.validation.errors.length}</dd></div>
                <div><dt>경고</dt><dd>{preview.validation.warnings.length}</dd></div>
                <div><dt>통과</dt><dd>{preview.validation.checks.length}</dd></div>
              </dl>
            </div>
            {isStale ? (
              <p className="form-alert">입력·설정 또는 컨텍스트가 변경되어 현재 미리보기가 오래되었습니다. 명시적으로 다시 생성해 주세요.</p>
            ) : null}
            {!isStale && preview.validation.errors.length > 0 ? (
              <ul className="non-news-composer__issues">
                {preview.validation.errors.map((error) => (
                  <li key={`${error.code}:${error.message}`}>{error.message}</li>
                ))}
              </ul>
            ) : null}
            {!isStale && preview.validation.warnings.length > 0 ? (
              <ul className="non-news-composer__warnings">
                {preview.validation.warnings.map((warning) => (
                  <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
                ))}
              </ul>
            ) : null}
            <p className="field-help">검증 v{preview.validation.validationVersion} · 사용 항목 {preview.validation.metrics.contextItemCount}개 / 최대 {preview.validation.metrics.contextLimit}개</p>
          </section>

          <section className="prompt-panel" aria-labelledby="non-news-authoring-preview-title">
            <div className="prompt-panel__heading">
              <div>
                <h3 id="non-news-authoring-preview-title">작성 프롬프트 미리보기</h3>
                <p>생성된 프롬프트는 저장되지 않습니다.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={!canCopy}
                onClick={() => void copyPrompt()}
              >
                작성 프롬프트 복사
              </button>
            </div>
            <textarea
              className="prompt-preview"
              aria-label="복사용 비뉴스 작성 프롬프트"
              value={preview.build.text}
              readOnly
            />
            {copyState ? (
              <p className={copyState === 'success' ? 'form-success' : 'form-alert'} role={copyState === 'error' ? 'alert' : 'status'}>
                {copyState === 'success'
                  ? '작성 프롬프트를 복사했습니다.'
                  : '작성 프롬프트를 복사하지 못했습니다.'}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  )
}
