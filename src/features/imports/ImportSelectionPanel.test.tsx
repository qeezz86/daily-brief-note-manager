import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyImportReferenceData, importCategories, validImportBundle, validNewsPost, validNewsTracking } from './imports.fixtures'
import { ImportSelectionPanel } from './ImportSelectionPanel'
import { defaultImportSelection, importItemClientKey } from './importSelection'
import { validateImportBundle } from './validateImportBundle'

function resultWithReadyAndWarning() {
  return validateImportBundle(validImportBundle([
    validNewsPost(),
    validNewsPost({ externalKey: 'warning', title: '경고 경제 뉴스', slug: 'economy-briefing-2026-07-13', briefingDate: '2026-07-13', publishedOn: '2026-07-13', displayId: '#2026-07-13-ECO', wordpressUrl: 'https://example.org/economy-2026-07-13', newsTracking: validNewsTracking('warning-topic'), seo: { ...validNewsPost().seo!, metaDescription: 'short' } }),
  ]), emptyImportReferenceData)
}

describe('ImportSelectionPanel', () => {
  it('shows selected and category counts with ready selected by default', () => {
    const result = resultWithReadyAndWarning()
    render(<ImportSelectionPanel result={result} categories={importCategories} selected={defaultImportSelection(result.items)} approvedWarnings={new Set()} disabled={false} onToggleSelected={vi.fn()} onToggleWarningApproval={vi.fn()} onSelectAllReady={vi.fn()} />)
    expect(screen.getByText('선택 1개')).toBeInTheDocument()
    expect(screen.getByText('경제 1')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Import 선택')[0]).toBeChecked()
    expect(screen.getAllByLabelText('Import 선택')[1]).toBeDisabled()
  })

  it('requires explicit warning approval before selection', async () => {
    const user = userEvent.setup(); const result = resultWithReadyAndWarning(); const approval = vi.fn(); const selection = vi.fn()
    render(<ImportSelectionPanel result={result} categories={importCategories} selected={new Set()} approvedWarnings={new Set()} disabled={false} onToggleSelected={selection} onToggleWarningApproval={approval} onSelectAllReady={vi.fn()} />)
    await user.click(screen.getByLabelText('경고 확인'))
    expect(approval).toHaveBeenCalledWith(importItemClientKey(result.items[1]), true)
    expect(selection).not.toHaveBeenCalled()
  })

  it('disables all controls while executing', () => {
    const result = resultWithReadyAndWarning()
    render(<ImportSelectionPanel result={result} categories={importCategories} selected={defaultImportSelection(result.items)} approvedWarnings={new Set()} disabled onToggleSelected={vi.fn()} onToggleWarningApproval={vi.fn()} onSelectAllReady={vi.fn()} />)
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeDisabled())
  })
  it('enables an approved warning selection control', () => {
    const result = resultWithReadyAndWarning(); const warningKey = importItemClientKey(result.items[1])
    render(<ImportSelectionPanel result={result} categories={importCategories} selected={new Set()} approvedWarnings={new Set([warningKey])} disabled={false} onToggleSelected={vi.fn()} onToggleWarningApproval={vi.fn()} onSelectAllReady={vi.fn()} />)
    expect(screen.getAllByLabelText('Import 선택')[1]).toBeEnabled(); expect(screen.getByLabelText('경고 확인')).toBeChecked()
  })
  it('calls ready-all selection for checking and unchecking', async () => {
    const user = userEvent.setup(); const result = resultWithReadyAndWarning(); const selectAll = vi.fn(); const readySelection = defaultImportSelection(result.items)
    const rendered = render(<ImportSelectionPanel result={result} categories={importCategories} selected={new Set()} approvedWarnings={new Set()} disabled={false} onToggleSelected={vi.fn()} onToggleWarningApproval={vi.fn()} onSelectAllReady={selectAll} />)
    await user.click(screen.getByLabelText('ready 전체 선택')); expect(selectAll).toHaveBeenCalledWith(true)
    rendered.rerender(<ImportSelectionPanel result={result} categories={importCategories} selected={readySelection} approvedWarnings={new Set()} disabled={false} onToggleSelected={vi.fn()} onToggleWarningApproval={vi.fn()} onSelectAllReady={selectAll} />)
    await user.click(screen.getByLabelText('ready 전체 선택')); expect(selectAll).toHaveBeenLastCalledWith(false)
  })
})
