import type {
  BriefingPromptValidationIssue,
  BriefingPromptValidationResult,
} from './briefingPromptValidation.types'

const sectionLabels: Record<string, string> = {
  structure: '기본 구조',
  'output-requirements': '출력 요구사항',
  category: '카테고리 규칙',
  context: 'Context 무결성',
  duplicates: '결정적 중복',
  mode: '모드 정책',
  'recent-posts': '최근 게시물',
  'open-topics': '추적 주제',
  updates: '뉴스 update',
  followups: '후속 확인',
  'closed-topics': '종료·재개 주제',
  privacy: '개인정보·내부 정보',
  'copyright-sources': '저작권·출처',
  length: '프롬프트 길이',
}

const severityLabels = { error: '오류', warning: '경고', check: '통과' } as const

export function BriefingPromptValidationPanel({
  result,
  stale = false,
}: {
  result: BriefingPromptValidationResult
  stale?: boolean
}) {
  const issues = [...result.errors, ...result.warnings, ...result.checks]
  const groups = issues.reduce<Map<string, BriefingPromptValidationIssue[]>>((map, issue) => {
    const current = map.get(issue.section) ?? []
    current.push(issue)
    map.set(issue.section, current)
    return map
  }, new Map())
  const statusLabel = stale
    ? '오래된 미리보기'
    : result.status === 'valid'
      ? '유효'
      : result.status === 'warning'
        ? '경고 있음'
        : '오류 있음'
  return <section className={`prompt-panel prompt-validation prompt-validation--${stale ? 'stale' : result.status}`} aria-labelledby="prompt-validation-title">
    <div className="prompt-panel__heading">
      <div><h2 id="prompt-validation-title">프롬프트 검증</h2><p className="prompt-validation__status" role="status">{statusLabel}</p></div>
      <dl className="prompt-validation__summary">
        <div><dt>오류</dt><dd>{result.errors.length}</dd></div>
        <div><dt>경고</dt><dd>{result.warnings.length}</dd></div>
        <div><dt>통과</dt><dd>{result.checks.length}</dd></div>
      </dl>
    </div>
    {stale ? <p className="form-alert">설정이 변경되어 검증 결과도 오래되었습니다. 프롬프트를 다시 생성해 주세요.</p> : null}
    {result.status === 'invalid' && !stale ? <p className="form-alert">오류를 해결하려면 프롬프트를 재생성해야 합니다. 저장과 프롬프트 복사는 차단됩니다.</p> : null}
    {result.status === 'warning' && !stale ? <p className="prompt-validation__guidance">경고 내용을 확인한 뒤 저장하거나 복사할 수 있습니다.</p> : null}
    <div className="prompt-validation__groups">
      {[...groups.entries()].map(([section, sectionIssues]) => <section key={section} aria-label={sectionLabels[section] ?? section}>
        <h3>{sectionLabels[section] ?? section}</h3>
        <ul>{sectionIssues.map((issue) => <li className={`prompt-validation__issue prompt-validation__issue--${issue.severity}`} key={`${issue.severity}:${issue.code}:${issue.relatedKey ?? ''}`}>
          <strong>{severityLabels[issue.severity]}</strong> {issue.message}{issue.detail ? <span className="prompt-validation__detail"> {issue.detail}</span> : null}
        </li>)}</ul>
      </section>)}
    </div>
    <p className="field-help">검증 v{result.validationVersion} · {result.metrics.characterCount.toLocaleString('ko-KR')}자 · {result.metrics.lineCount}줄 · {result.metrics.sectionCount}개 섹션</p>
  </section>
}
