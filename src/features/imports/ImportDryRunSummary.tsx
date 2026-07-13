import type { ImportValidationResult } from './importValidation.types'

export function ImportDryRunSummary({ result }: { result: ImportValidationResult }) {
  const counts = [
    ['전체', result.summary.total],
    ['준비', result.summary.ready],
    ['경고', result.summary.warning],
    ['무효', result.summary.invalid],
    ['중복', result.summary.duplicate],
  ]
  return (
    <section className={`import-panel import-summary import-summary--${result.status}`} aria-labelledby="import-summary-title">
      <div className="import-panel__heading">
        <div>
          <h2 id="import-summary-title">Dry Run 요약</h2>
          <p>schema v{result.schemaVersion ?? '확인 불가'} · DB 중복 검사 {result.databaseCheck === 'complete' ? '완료' : result.databaseCheck === 'partial' ? '일부 완료' : '확인하지 못함'}</p>
        </div>
        <strong className={`import-status import-status--${result.status}`}>{result.status}</strong>
      </div>
      <dl className="import-summary__counts">
        {counts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
      </dl>
      {result.bundleIssues.length > 0 ? <div className="import-bundle-issues"><h3>파일 전체 문제</h3><ul>{result.bundleIssues.map((issue) => <li key={`${issue.code}-${issue.path}`}><strong>{issue.severity === 'error' ? '오류' : '경고'} · {issue.code}</strong><span>{issue.message} ({issue.path})</span></li>)}</ul></div> : null}
    </section>
  )
}
