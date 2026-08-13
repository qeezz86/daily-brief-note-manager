import type {
  NonNewsResponseCandidate,
  NonNewsResponseIssue,
  NonNewsResponseSourceCandidate,
  NonNewsResponseValidationResult,
} from './nonNewsResponseImport.types'

function splitLines(value: string) {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)
}

export function NonNewsResponseImportReview({
  candidate,
  validation,
  stale,
  disabled,
  onChange,
}: {
  candidate: NonNewsResponseCandidate
  validation: NonNewsResponseValidationResult | null
  stale: boolean
  disabled: boolean
  onChange: (candidate: NonNewsResponseCandidate) => void
}) {
  const update = <K extends keyof NonNewsResponseCandidate>(key: K, value: NonNewsResponseCandidate[K]) => {
    onChange({ ...candidate, [key]: value })
  }
  const updateSource = (index: number, key: keyof NonNewsResponseSourceCandidate, value: string) => {
    const sources = candidate.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [key]: value } : source)
    update('sources', sources)
  }
  const issuesByStatus = (status: NonNewsResponseIssue['status']) => validation?.issues.filter((item) => item.status === status) ?? []
  const blockers = issuesByStatus('invalid')
  const warnings = issuesByStatus('warning')

  return <section className="import-panel non-news-response-review" aria-labelledby="non-news-response-review-title">
    <div className="import-panel__heading">
      <div>
        <h2 id="non-news-response-review-title">비뉴스 응답 검토 및 편집</h2>
        <p>HTML은 실행되지 않는 plain text로만 표시됩니다. 수정 후 명시적으로 다시 검증하세요.</p>
      </div>
      <strong className={`non-news-response-state non-news-response-state--${stale ? 'stale' : validation?.status ?? 'unvalidated'}`}>
        {stale ? '오래된 검증 — 재검증 필요' : validation ? `검증 상태: ${validation.status}` : '아직 검증하지 않음'}
      </strong>
    </div>

    {blockers.length ? <div className="paste-issues" role="alert"><h3>저장 차단 항목</h3><IssueList issues={blockers} /></div> : null}
    {warnings.length ? <div className="non-news-response-warnings" role="status"><h3>확인이 필요한 경고</h3><IssueList issues={warnings} /></div> : null}

    <fieldset className="non-news-response-fields" disabled={disabled}>
      <legend>Canonical 응답 필드</legend>
      <label>SEO 대표 제목<input value={candidate.representativeTitle} onChange={(event) => update('representativeTitle', event.target.value)} /></label>
      <div className="non-news-response-grid">
        {candidate.alternativeTitles.map((title, index) => <label key={index}>SEO 대안 제목 {index + 1}<input value={title} onChange={(event) => {
          const titles = [...candidate.alternativeTitles] as NonNewsResponseCandidate['alternativeTitles']
          titles[index] = event.target.value
          update('alternativeTitles', titles)
        }} /></label>)}
      </div>
      <label>메타 설명<textarea rows={4} value={candidate.metaDescription} onChange={(event) => update('metaDescription', event.target.value)} /></label>
      <div className="non-news-response-grid">
        <label>URL 슬러그<input value={candidate.slug} autoCapitalize="off" spellCheck={false} onChange={(event) => update('slug', event.target.value)} /></label>
        <label>포커스 키워드<input value={candidate.focusKeyword} onChange={(event) => update('focusKeyword', event.target.value)} /></label>
      </div>
      <label>SEO 태그 — 한 줄에 하나<textarea rows={7} value={candidate.tags.join('\n')} onChange={(event) => update('tags', splitLines(event.target.value))} /></label>
      <label>WordPress HTML — inert plain text<textarea className="non-news-response-html" rows={18} value={candidate.wordpressHtml} aria-label="비뉴스 WordPress HTML inert preview" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(event) => update('wordpressHtml', event.target.value)} /></label>
      <label>대표 이미지 프롬프트<textarea rows={6} value={candidate.imagePrompt} onChange={(event) => update('imagePrompt', event.target.value)} /></label>
      <label>이미지 ALT 문구<input value={candidate.imageAlt} onChange={(event) => update('imageAlt', event.target.value)} /></label>
      <label>발행 전 체크리스트 — 한 줄에 하나<textarea rows={6} value={candidate.checklist.join('\n')} onChange={(event) => update('checklist', splitLines(event.target.value))} /></label>
    </fieldset>

    <section className="non-news-response-sources" aria-labelledby="non-news-response-sources-title">
      <div className="import-panel__heading">
        <div><h3 id="non-news-response-sources-title">HTML에서 추출한 출처</h3><p>외부 요청 없이 추출했습니다. 모호하거나 비어 있는 값은 직접 검토하세요.</p></div>
        <button className="secondary-button" type="button" disabled={disabled} onClick={() => update('sources', [...candidate.sources, { sourceName: '', sourceTitle: '', sourceUrl: '', sourcePublishedAt: '', checkedPoint: '' }])}>출처 추가</button>
      </div>
      {candidate.sources.length ? candidate.sources.map((source, index) => <fieldset key={index} className="non-news-response-source" disabled={disabled}>
        <legend>출처 {index + 1}</legend>
        <label>출처 기관<input value={source.sourceName} onChange={(event) => updateSource(index, 'sourceName', event.target.value)} /></label>
        <label>출처 제목<input value={source.sourceTitle} onChange={(event) => updateSource(index, 'sourceTitle', event.target.value)} /></label>
        <label>개별 출처 URL<input type="url" value={source.sourceUrl} autoCapitalize="off" spellCheck={false} onChange={(event) => updateSource(index, 'sourceUrl', event.target.value)} /></label>
        <label>게시·업데이트 시각<input value={source.sourcePublishedAt} placeholder="선택 입력: ISO datetime" onChange={(event) => updateSource(index, 'sourcePublishedAt', event.target.value)} /></label>
        <label>확인한 포인트<textarea rows={3} value={source.checkedPoint} onChange={(event) => updateSource(index, 'checkedPoint', event.target.value)} /></label>
        <button className="secondary-button" type="button" onClick={() => update('sources', candidate.sources.filter((_, sourceIndex) => sourceIndex !== index))}>출처 {index + 1} 삭제</button>
      </fieldset>) : <p className="form-alert" role="status">출처 후보가 없습니다. HTML 출처 구조를 확인하거나 출처를 추가하세요.</p>}
    </section>
  </section>
}

function IssueList({ issues }: { issues: NonNewsResponseIssue[] }) {
  return <ul>{issues.map((item, index) => <li key={`${item.code}-${item.path}-${index}`}><code>{item.code}</code> — {item.message} <small>({item.path})</small></li>)}</ul>
}

