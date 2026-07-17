import type { WordPressDiagnosticsResult } from './wordpressDiagnostics.types'

const connectionLabels = {
  ready: '연결 준비됨',
  partial: '일부 확인 필요',
  insufficient_permissions: '기본 편집 권한 부족',
}

const capabilityLabels: Array<[keyof WordPressDiagnosticsResult['capabilities'], string]> = [
  ['editPosts', '임시글 편집'],
  ['publishPosts', '직접 발행'],
  ['uploadFiles', '미디어 업로드'],
  ['manageCategories', '분류 관리'],
  ['editOthersPosts', '다른 작성자 글 편집'],
  ['deletePosts', '글 삭제'],
]

function yesNo(value: boolean) {
  return value ? '확인됨' : '없음'
}

export function WordPressDiagnosticsPanel({ result }: { result: WordPressDiagnosticsResult }) {
  return (
    <div className="wordpress-diagnostics__results">
      <section className={`wordpress-status wordpress-status--${result.readiness.connection}`} aria-labelledby="wordpress-status-title">
        <p className="dashboard__eyebrow">연결 상태</p>
        <h2 id="wordpress-status-title">{connectionLabels[result.readiness.connection]}</h2>
        <p>{result.site.name || '이름 없는 WordPress 사이트'} · {result.site.origin}</p>
        <dl>
          <div><dt>마지막 실행</dt><dd>{new Date(result.checkedAt).toLocaleString('ko-KR')}</dd></div>
          <div><dt>Application Password</dt><dd>{yesNo(result.site.applicationPasswordsAdvertised)}</dd></div>
          <div><dt>인증 사용자</dt><dd>{result.authentication.displayName || '표시 이름 없음'}</dd></div>
          <div><dt>역할</dt><dd>{result.authentication.roles.join(', ') || '역할 정보 없음'}</dd></div>
          <div><dt>Post type</dt><dd>{yesNo(result.resources.postTypeAvailable)}</dd></div>
          <div><dt>Posts 읽기</dt><dd>{yesNo(result.resources.postsReadable)}</dd></div>
          <div><dt>카테고리</dt><dd>{result.resources.categories?.total ?? '확인 실패'}</dd></div>
          <div><dt>태그</dt><dd>{result.resources.tags?.total ?? '확인 실패'}</dd></div>
        </dl>
      </section>

      <section className="wordpress-panel" aria-labelledby="wordpress-capabilities-title">
        <h2 id="wordpress-capabilities-title">권한 진단</h2>
        <p>아래 결과는 쓰기 요청 없이 WordPress가 보고한 capability만 확인한 값입니다.</p>
        <div className="wordpress-capability-table-wrap">
          <table>
            <thead><tr><th scope="col">기능</th><th scope="col">상태</th></tr></thead>
            <tbody>{capabilityLabels.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{yesNo(result.capabilities[key])}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="wordpress-panel" aria-labelledby="wordpress-resources-title">
        <h2 id="wordpress-resources-title">읽기 전용 리소스</h2>
        <dl>
          <div><dt>상태</dt><dd>{result.resources.statuses.join(', ') || '확인된 상태 없음'}</dd></div>
          <div><dt>Post REST base</dt><dd>{result.resources.postRestBase ?? '확인되지 않음'}</dd></div>
          <div><dt>Taxonomies</dt><dd>{result.resources.postTaxonomies.join(', ') || '확인된 taxonomy 없음'}</dd></div>
          <div><dt>카테고리 첫 페이지</dt><dd>{result.resources.categories ? `${result.resources.categories.items.length}개${result.resources.categories.truncated ? ' · 다음 페이지 있음' : ''}` : '확인 실패'}</dd></div>
          <div><dt>태그 첫 페이지</dt><dd>{result.resources.tags ? `${result.resources.tags.items.length}개${result.resources.tags.truncated ? ' · 다음 페이지 있음' : ''}` : '확인 실패'}</dd></div>
        </dl>
      </section>

      {result.warnings.length ? <section className="wordpress-panel wordpress-panel--warning" aria-labelledby="wordpress-warnings-title"><h2 id="wordpress-warnings-title">확인할 내용</h2><ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}
    </div>
  )
}
