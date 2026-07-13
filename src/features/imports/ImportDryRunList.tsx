import { useMemo, useState } from 'react'
import { IMPORT_LIST_RENDER_LIMIT } from './importValidation.constants'
import { ImportDryRunDetail } from './ImportDryRunDetail'
import type { ImportCategory, ImportItemStatus, ImportValidationResult } from './importValidation.types'

export function ImportDryRunList({ result, categories }: { result: ImportValidationResult; categories: ImportCategory[] }) {
  const [status, setStatus] = useState<ImportItemStatus | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ko-KR')
    return result.items.filter((item) => {
      const preview = item.normalizedPreview
      const identity = [item.title, preview.slug, preview.displayId ?? '', preview.seriesNo == null ? '' : String(preview.seriesNo)].join(' ').toLocaleLowerCase('ko-KR')
      return (!status || item.status === status) && (!categoryId || item.categoryId === categoryId) && (!term || identity.includes(term))
    })
  }, [categoryId, result.items, search, status])
  const visible = filtered.slice(0, IMPORT_LIST_RENDER_LIMIT)
  return (
    <section className="import-panel" aria-labelledby="import-items-title">
      <h2 id="import-items-title">항목별 결과</h2>
      <div className="import-filters">
        <label>상태<select value={status} onChange={(event) => setStatus(event.target.value as ImportItemStatus | '')}><option value="">전체</option><option value="ready">ready</option><option value="warning">warning</option><option value="invalid">invalid</option><option value="duplicate">duplicate</option></select></label>
        <label>카테고리<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">전체</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>검색<input type="search" placeholder="제목, slug, ID, series" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <p className="content-results" aria-live="polite">검색 결과 {filtered.length}개{filtered.length > visible.length ? ` · 처음 ${visible.length}개 표시` : ''}</p>
      <ol className="import-item-list">
        {visible.map((item) => <li key={`${item.index}-${item.externalKey ?? ''}`}>
          <details>
            <summary>
              <span><strong>{item.index + 1}. {item.title}</strong><small>{item.categoryId || '카테고리 없음'} · {item.publishedOn ?? '발행일 없음'} · 문제 {item.issues.length}개</small></span>
              <span className={`import-status import-status--${item.status}`}>{item.status}</span>
            </summary>
            <ImportDryRunDetail item={item} />
          </details>
        </li>)}
      </ol>
      {visible.length === 0 ? <p className="empty-state">조건에 맞는 항목이 없습니다.</p> : null}
    </section>
  )
}

