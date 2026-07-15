import type { BackupRestoreResult } from './backupRestore.types'

export function BackupCompatibilityPanel({ result }: { result: BackupRestoreResult }) {
  return (
    <section className="backup-panel" aria-labelledby="backup-compatibility-title">
      <h2 id="backup-compatibility-title">호환성·무결성</h2>
      <dl className="backup-summary-grid">
        <div><dt>checksum</dt><dd>{result.checksumStatus}</dd></div>
        <div><dt>schema</dt><dd>{result.compatibility.schema}</dd></div>
        <div><dt>profile</dt><dd>{result.compatibility.profile ?? '확인 불가'}</dd></div>
        <div><dt>category</dt><dd>{result.compatibility.categories}</dd></div>
        <div><dt>DB 충돌 조회</dt><dd>{result.databaseCheck}</dd></div>
        <div><dt>전체 record</dt><dd>{result.summary.totalRecords.toLocaleString()}</dd></div>
      </dl>
      <h3>Category manifest 비교</h3>
      {result.categoryDifferences.length ? (
        <div className="backup-table-wrap"><table><thead><tr><th>Category</th><th>필드</th><th>판정</th><th>백업</th><th>현재</th></tr></thead><tbody>{result.categoryDifferences.map((item) => <tr key={`${item.categoryId}-${item.field}`}><td>{item.categoryId}</td><td>{item.field}</td><td>{item.severity}</td><td>{String(item.backupValue)}</td><td>{String(item.currentValue)}</td></tr>)}</tbody></table></div>
      ) : <p className="field-help">현재 category 설정과 호환됩니다.</p>}
      <h3>Section 검증</h3>
      <div className="backup-section-counts">{result.sections.map((section) => <span key={section.section} className={`is-${section.status}`}><code>{section.section}</code> {section.count.toLocaleString()} · {section.status}</span>)}</div>
    </section>
  )
}
