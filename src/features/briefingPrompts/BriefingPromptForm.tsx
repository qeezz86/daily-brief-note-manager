import type { FormEvent } from 'react'
import type { Category } from '../categories/categories.types'
import { briefingPromptModeLabels, briefingPromptModes, type BriefingPromptSettings } from './briefingPrompts.types'

export function BriefingPromptForm({
  categories, value, disabled, configurationError, onChange, onSubmit,
}: {
  categories: Category[]
  value: BriefingPromptSettings
  disabled: boolean
  configurationError?: string | null
  onChange: (value: BriefingPromptSettings) => void
  onSubmit: () => void
}) {
  const validLookback = Number.isInteger(value.closedLookbackDays) && value.closedLookbackDays >= 1 && value.closedLookbackDays <= 180
  function submit(event: FormEvent) { event.preventDefault(); if (value.categoryId && validLookback && !configurationError) onSubmit() }
  return <form className="prompt-settings" onSubmit={submit}>
    <fieldset className="post-form__section"><legend>설정</legend>
      <div className="post-form__field"><label htmlFor="prompt-category">뉴스 카테고리</label><select id="prompt-category" value={value.categoryId} onChange={(event) => onChange({ ...value, categoryId: event.target.value })} required><option value="">선택</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div className="post-form__field"><label htmlFor="prompt-reference-date">작성 기준일</label><input id="prompt-reference-date" type="date" value={value.referenceDate} onChange={(event) => onChange({ ...value, referenceDate: event.target.value })} required /></div>
      <div className="post-form__field"><label htmlFor="prompt-mode">프롬프트 모드</label><select id="prompt-mode" value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as BriefingPromptSettings['mode'] })}>{briefingPromptModes.map((mode) => <option key={mode} value={mode}>{briefingPromptModeLabels[mode]}</option>)}</select></div>
      <div className="post-form__field"><label htmlFor="prompt-lookback">종료 뉴스 조회 기간</label><input id="prompt-lookback" type="number" min="1" max="180" value={value.closedLookbackDays} aria-invalid={!validLookback} onChange={(event) => onChange({ ...value, closedLookbackDays: event.target.valueAsNumber })} /><p className="field-help">작성 기준일로부터 1~180일, 기본 90일</p>{!validLookback ? <p className="field-error">1~180 사이의 정수를 입력해 주세요.</p> : null}</div>
    </fieldset>
    <button className="primary-button" type="submit" disabled={disabled || !value.categoryId || !value.referenceDate || !validLookback || Boolean(configurationError)}>{disabled ? '집계 중' : '프롬프트 생성'}</button>
  </form>
}
