import type { ImportCategory } from './importValidation.types'
import type { ImportValidationResult } from './importValidation.types'
import type { WordPressHtmlDraft, WordPressHtmlParserResult } from './wordPressHtmlImport.types'

export function WordPressHtmlImportPreview({
  result,
  draft,
  categories,
  validation,
  disabled,
  onChange,
}: {
  result: WordPressHtmlParserResult
  draft: WordPressHtmlDraft
  categories: ImportCategory[]
  validation: ImportValidationResult | null
  disabled: boolean
  onChange: (next: WordPressHtmlDraft) => void
}) {
  const set = <K extends keyof WordPressHtmlDraft>(key: K, value: WordPressHtmlDraft[K]) => onChange({ ...draft, [key]: value })
  const setSeo = (key: keyof NonNullable<WordPressHtmlDraft['seo']>, value: string | string[]) => set('seo', { ...draft.seo, [key]: value })
  const setImage = (key: 'prompt' | 'alt', value: string) => set('image', { ...draft.image, [key]: value })
  const setMetadata = (key: string, value: unknown) => set('metadata', { ...draft.metadata, [key]: value })
  const category = categories.find((item) => item.id === draft.categoryId)

  return <section className="import-panel wordpress-html-preview" aria-labelledby="wordpress-html-preview-title">
    <div className="import-panel__heading"><div>
      <h2 id="wordpress-html-preview-title">WordPress HTML 구조 미리보기 및 편집</h2>
      <p>붙여넣은 markup은 실행하지 않고 추출된 필드만 표시합니다. 원문은 위 textarea 값 그대로 저장 후보가 됩니다.</p>
    </div></div>

    <details open><summary>감지 결과와 이슈</summary>
      <p>UTF-8 {result.byteLength.toLocaleString()} bytes · wrapper {result.wrapperClasses.length}개 · category 후보 {result.categoryMatches.length}개</p>
      {result.issues.length ? <ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity === 'error' ? 'form-alert' : 'field-help'}>{issue.code}: {issue.message}</li>)}</ul> : <p className="form-success">구조·보안 parser 이슈가 없습니다.</p>}
    </details>

    <div className="wordpress-html-form-grid">
      <label>카테고리<select value={draft.categoryId} disabled={disabled} onChange={(event) => set('categoryId', event.target.value)}>
        <option value="">선택</option>{categories.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
      </select></label>
      <label>콘텐츠 상태<select value={draft.status} disabled={disabled} onChange={(event) => set('status', event.target.value as WordPressHtmlDraft['status'])}><option value="draft">초안</option><option value="ready">발행 준비</option><option value="published">발행됨 기록</option></select></label>
      <label>제목<input value={draft.title} disabled={disabled} onChange={(event) => set('title', event.target.value)} /></label>
      <label>요약<textarea value={draft.summary} disabled={disabled} onChange={(event) => set('summary', event.target.value)} /></label>
      <label>slug<input value={draft.slug} disabled={disabled} onChange={(event) => set('slug', event.target.value)} /></label>
      <label>WordPress URL<input type="url" value={draft.wordpressUrl ?? ''} disabled={disabled} onChange={(event) => set('wordpressUrl', event.target.value || null)} /></label>
      <label>발행일<input type="date" value={draft.publishedOn ?? ''} disabled={disabled} onChange={(event) => set('publishedOn', event.target.value || null)} /></label>
      {category?.contentGroup === 'news' ? <label>브리핑 날짜<input type="date" value={draft.briefingDate ?? ''} disabled={disabled} onChange={(event) => set('briefingDate', event.target.value || null)} /></label> : <label>시리즈 번호<input type="number" min="1" value={draft.seriesNo ?? ''} disabled={disabled} onChange={(event) => set('seriesNo', event.target.value ? Number(event.target.value) : null)} /></label>}
      {category?.contentGroup !== 'chinese' ? <label>표시 ID<input value={draft.displayId ?? ''} disabled={disabled} onChange={(event) => set('displayId', event.target.value || null)} /></label> : null}
    </div>

    <fieldset><legend>SEO · 태그 · 이미지</legend><div className="wordpress-html-form-grid">
      <label>대표 제목<input value={draft.seo.representativeTitle} disabled={disabled} onChange={(event) => setSeo('representativeTitle', event.target.value)} /></label>
      <label>대체 제목 4개(한 줄에 하나)<textarea value={draft.seo.alternativeTitles.join('\n')} disabled={disabled} onChange={(event) => setSeo('alternativeTitles', event.target.value.split(/\r?\n/))} /></label>
      <label>메타 설명<textarea value={draft.seo.metaDescription} disabled={disabled} onChange={(event) => setSeo('metaDescription', event.target.value)} /></label>
      <label>포커스 키워드<input value={draft.seo.focusKeyword} disabled={disabled} onChange={(event) => setSeo('focusKeyword', event.target.value)} /></label>
      <label>태그(쉼표 구분)<input value={draft.tags.join(', ')} disabled={disabled} onChange={(event) => set('tags', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))} /></label>
      <label>이미지 프롬프트<textarea value={draft.image.prompt} disabled={disabled} onChange={(event) => setImage('prompt', event.target.value)} /></label>
      <label>이미지 alt<input value={draft.image.alt} disabled={disabled} onChange={(event) => setImage('alt', event.target.value)} /></label>
    </div></fieldset>

    {category?.contentGroup === 'ai' || category?.contentGroup === 'info_db' ? <fieldset><legend>콘텐츠 metadata</legend><div className="wordpress-html-form-grid">
      <label>분야<input value={String(draft.metadata.fieldName ?? '')} disabled={disabled} onChange={(event) => setMetadata('fieldName', event.target.value)} /></label>
      <label>난이도<select value={String(draft.metadata.difficulty ?? '')} disabled={disabled} onChange={(event) => setMetadata('difficulty', event.target.value)}><option value="">선택</option><option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="advanced">advanced</option></select></label>
      <label>예상 읽기 시간(분)<input type="number" min="1" max="600" value={String(draft.metadata.estimatedReadMin ?? '')} disabled={disabled} onChange={(event) => setMetadata('estimatedReadMin', event.target.value ? Number(event.target.value) : '')} /></label>
      {category.contentGroup === 'info_db' ? <label>기준일<input type="date" value={String(draft.metadata.referenceDate ?? '')} disabled={disabled} onChange={(event) => setMetadata('referenceDate', event.target.value)} /></label> : null}
    </div></fieldset> : null}

    {category?.contentGroup === 'chinese' ? <fieldset><legend>CCTV 중국어 metadata</legend><div className="wordpress-html-form-grid">
      {(['learningTopic', 'programName', 'originalTitle', 'originalUrl', 'originalPublishedAt', 'verifiedCoreFact'] as const).map((key) => <label key={key}>{key}<input value={String(draft.metadata[key] ?? '')} disabled={disabled} onChange={(event) => setMetadata(key, event.target.value)} /></label>)}
      <label>본편 목록 포함<select value={draft.metadata.episodeListIncluded === true ? 'true' : draft.metadata.episodeListIncluded === false ? 'false' : ''} disabled={disabled} onChange={(event) => setMetadata('episodeListIncluded', event.target.value === '' ? null : event.target.value === 'true')}><option value="">선택</option><option value="true">예</option><option value="false">아니오</option></select></label>
    </div></fieldset> : null}

    <fieldset><legend>출처</legend>
      {draft.sources.map((source, index) => <div className="wordpress-html-source" key={`${index}-${source.sourceUrl}`}>
        <label>기관<input value={source.sourceName} disabled={disabled} onChange={(event) => set('sources', draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourceName: event.target.value } : item))} /></label>
        <label>제목<input value={source.sourceTitle} disabled={disabled} onChange={(event) => set('sources', draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourceTitle: event.target.value } : item))} /></label>
        <label>개별 URL<input value={source.sourceUrl} disabled={disabled} onChange={(event) => set('sources', draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourceUrl: event.target.value } : item))} /></label>
        <label>게시·수정 시각<input value={source.sourcePublishedAt ?? ''} disabled={disabled} onChange={(event) => set('sources', draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourcePublishedAt: event.target.value || null } : item))} /></label>
        <label>확인 핵심 내용<input value={source.checkedPoint} disabled={disabled} onChange={(event) => set('sources', draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, checkedPoint: event.target.value } : item))} /></label>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => set('sources', draft.sources.filter((_, itemIndex) => itemIndex !== index))}>출처 삭제</button>
      </div>)}
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => set('sources', [...draft.sources, { sourceName: '', sourceTitle: '', sourceUrl: '', sourcePublishedAt: null, checkedPoint: '' }])}>출처 추가</button>
    </fieldset>

    {result.newsIssues.length || result.changeLog || result.watchPoints ? <details><summary>뉴스 추적 추출 미리보기(저장 안 함)</summary>
      <p>issue {result.newsIssues.length}개 · change log {result.changeLog ? '있음' : '없음'} · watch points {result.watchPoints ? '있음' : '없음'}</p>
      <ul>{result.newsIssues.map((issue) => <li key={issue.id}><strong>{issue.heading || issue.id}</strong> · {issue.whatHappened || '세부 후보 없음'}</li>)}</ul>
    </details> : null}

    {validation ? <section aria-labelledby="wordpress-canonical-validation"><h3 id="wordpress-canonical-validation">Canonical Import 검증</h3>
      <p>상태: <strong>{validation.status}</strong> · DB 중복 검사: <strong>{validation.databaseCheck}</strong></p>
      <ul>{[...validation.bundleIssues, ...(validation.items[0]?.issues ?? [])].map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.severity.toUpperCase()} {issue.code}: {issue.message}</li>)}</ul>
    </section> : null}
  </section>
}
