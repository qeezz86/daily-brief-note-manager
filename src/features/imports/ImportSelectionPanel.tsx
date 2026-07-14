import { importItemClientKey } from './importSelection'
import type { ImportCategory, ImportValidationResult } from './importValidation.types'

export function ImportSelectionPanel({ result, categories, selected, approvedWarnings, disabled, onToggleSelected, onToggleWarningApproval, onSelectAllReady }: {
  result: ImportValidationResult
  categories: ImportCategory[]
  selected: Set<string>
  approvedWarnings: Set<string>
  disabled: boolean
  onToggleSelected: (key: string, selected: boolean) => void
  onToggleWarningApproval: (key: string, approved: boolean) => void
  onSelectAllReady: (selected: boolean) => void
}) {
  const ready = result.items.filter((item) => item.status === 'ready')
  const selectedItems = result.items.filter((item) => selected.has(importItemClientKey(item)))
  const counts = categories.map((category) => ({ category, count: selectedItems.filter((item) => item.categoryId === category.id).length })).filter((entry) => entry.count)
  const allReadySelected = ready.length > 0 && ready.every((item) => selected.has(importItemClientKey(item)))
  return (
    <section className="import-panel" aria-labelledby="import-selection-title">
      <div className="import-panel__heading"><div><h2 id="import-selection-title">Import 대상 선택</h2><p>ready는 기본 선택됩니다. warning은 경고를 확인·승인한 뒤 선택할 수 있습니다.</p></div><label className="import-check"><input type="checkbox" checked={allReadySelected} disabled={disabled || ready.length === 0} onChange={(event) => onSelectAllReady(event.target.checked)} />ready 전체 선택</label></div>
      <div className="import-selection-summary"><strong>선택 {selectedItems.length}개</strong>{counts.map(({ category, count }) => <span key={category.id}>{category.name} {count}</span>)}</div>
      <ol className="import-selection-list">
        {result.items.map((item) => {
          const key = importItemClientKey(item)
          const selectable = item.status === 'ready' || (item.status === 'warning' && approvedWarnings.has(key))
          return <li key={key}>
            <div><strong>{item.title}</strong><small>{item.categoryId} · <span className={`import-status import-status--${item.status}`}>{item.status}</span></small></div>
            <div className="import-selection-actions">
              {item.status === 'warning' ? <label><input type="checkbox" checked={approvedWarnings.has(key)} disabled={disabled} onChange={(event) => onToggleWarningApproval(key, event.target.checked)} />경고 확인</label> : null}
              <label><input type="checkbox" checked={selected.has(key)} disabled={disabled || !selectable || item.status === 'invalid' || item.status === 'duplicate'} onChange={(event) => onToggleSelected(key, event.target.checked)} />Import 선택</label>
            </div>
          </li>
        })}
      </ol>
    </section>
  )
}
