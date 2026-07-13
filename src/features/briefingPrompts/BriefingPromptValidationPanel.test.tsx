import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildNewsBriefingPrompt } from './buildBriefingPrompt'
import { briefingPromptContextFixture as context } from './briefingPrompts.fixtures'
import { BriefingPromptValidationPanel } from './BriefingPromptValidationPanel'
import { validateBriefingPrompt } from './validateBriefingPrompt'

function result(prompt = buildNewsBriefingPrompt(context, 'standard')) {
  return validateBriefingPrompt({
    promptText: prompt,
    context,
    mode: 'standard',
    settings: { categoryId: 'economy', referenceDate: '2026-07-13', mode: 'standard', closedLookbackDays: 90 },
    promptTemplateVersion: 1,
  })
}

describe('BriefingPromptValidationPanel', () => {
  it('renders a valid status and summary counts', () => {
    render(<BriefingPromptValidationPanel result={result()} />)
    expect(screen.getByText('유효')).toBeInTheDocument()
    expect(screen.getByText('오류').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByText('통과', { selector: 'dt' }).nextElementSibling).not.toHaveTextContent('0')
  })
  it('renders an invalid status and regeneration guidance', () => {
    render(<BriefingPromptValidationPanel result={result('broken prompt')} />)
    expect(screen.getByText('오류 있음')).toBeInTheDocument()
    expect(screen.getByText(/프롬프트를 재생성해야 합니다/)).toBeInTheDocument()
  })
  it('renders stale validation as unusable', () => {
    render(<BriefingPromptValidationPanel result={result()} stale />)
    expect(screen.getByText('오래된 미리보기')).toBeInTheDocument()
    expect(screen.getByText(/검증 결과도 오래되었습니다/)).toBeInTheDocument()
  })
})
