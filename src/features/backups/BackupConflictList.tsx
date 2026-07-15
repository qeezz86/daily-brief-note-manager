import { useMemo, useState } from 'react'
import { BACKUP_RESTORE_LIST_LIMIT } from './backupRestore.constants'
import type { BackupRestoreResult, RestoreConflictType } from './backupRestore.types'

export function BackupConflictList({ result }: { result: BackupRestoreResult }) {
  const [type, setType] = useState<RestoreConflictType | ''>('')
  const [section, setSection] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const sections = [...new Set(result.conflicts.map((item) => item.section))].sort()
  const categories = [...new Set(result.conflicts.map((item) => item.categoryId).filter((value): value is string => Boolean(value)))].sort()
  const filtered = useMemo(() => result.conflicts.filter((item) => (!type || item.type === type) && (!section || item.section === section) && (!category || item.categoryId === category) && (!search.trim() || `${item.reference} ${item.key ?? ''} ${item.recordId ?? ''}`.toLocaleLowerCase('ko-KR').includes(search.trim().toLocaleLowerCase('ko-KR')))).slice(0, BACKUP_RESTORE_LIST_LIMIT), [category, result.conflicts, search, section, type])
  return (
    <section className="backup-panel" aria-labelledby="backup-conflicts-title">
      <h2 id="backup-conflicts-title">DB 충돌·ID remap 분석</h2>
      <div className="backup-filter-row">
        <label>충돌 유형<select value={type} onChange={(event) => setType(event.target.value as RestoreConflictType | '')}><option value="">전체</option>{['safe_new', 'exact_same', 'id_conflict', 'key_conflict', 'relation_conflict', 'missing_reference'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Section<select value={section} onChange={(event) => setSection(event.target.value)}><option value="">전체</option>{sections.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">전체</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>검색<input value={search} placeholder="title, slug, reference, 축약 ID" onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <p className="field-help">{filtered.length.toLocaleString()}개 표시 · 최대 {BACKUP_RESTORE_LIST_LIMIT}개</p>
      <ul className="backup-result-list">{filtered.map((item, index) => <li key={`${item.section}-${item.reference}-${index}`}><strong>{item.type}</strong><span><code>{item.section}</code> {item.reference}</span><small>{item.message}{item.recordId ? ` · ID ${item.recordId}` : ''}</small></li>)}</ul>
      {!filtered.length ? <p className="empty-state">조건에 맞는 충돌 후보가 없습니다.</p> : null}
    </section>
  )
}
