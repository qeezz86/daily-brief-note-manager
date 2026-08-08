import type { ChatGptPasteParserResult } from './chatGptPaste.types'

const namedHtmlEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

function decodeHtmlEntitiesOnce(value: string) {
  return value.replace(
    /&(?:amp|apos|gt|lt|quot|#\d+|#[xX][\dA-Fa-f]+);/g,
    (entity) => {
      if (entity[1] !== '#') return namedHtmlEntities[entity.slice(1, -1)] ?? entity

      const hexadecimal = entity[2] === 'x' || entity[2] === 'X'
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10)
      if (codePoint > 0x10ffff || codePoint >= 0xd800 && codePoint <= 0xdfff) return entity
      return String.fromCodePoint(codePoint)
    },
  )
}

export function ChatGptPastePreview({ result }: { result: ChatGptPasteParserResult }) {
  const preview = result.preview
  const eligibility = !result.saveEligibility.isEligible
    ? '저장 불가 — 차단 오류를 먼저 해결해야 합니다.'
    : result.saveEligibility.requiresWarningAcknowledgement
      ? '경고 확인 후 저장 가능'
      : '명시적으로 확인하면 저장 가능'

  return <section className="chatgpt-paste-preview import-panel" aria-labelledby="chatgpt-paste-preview-title">
    <div className="import-panel__heading">
      <div>
        <h2 id="chatgpt-paste-preview-title">구조화 붙여넣기 미리보기</h2>
        <p>오류 {result.blockingIssues.length}개 · 경고 {result.warnings.length}개</p>
      </div>
      <strong className={result.saveEligibility.isEligible ? 'paste-eligibility paste-eligibility--ready' : 'paste-eligibility'}>{eligibility}</strong>
    </div>

    {result.blockingIssues.length ? <section className="paste-issues paste-issues--blocking" aria-labelledby="paste-blocking-title">
      <h3 id="paste-blocking-title">차단 오류 ({result.blockingIssues.length})</h3>
      <ul>{result.blockingIssues.map((issue) => <li key={`${issue.code}:${issue.path}`}><code>{issue.code}</code> · {issue.path} — {issue.message}</li>)}</ul>
    </section> : null}
    {result.warnings.length ? <section className="paste-issues paste-issues--warning" aria-labelledby="paste-warning-title">
      <h3 id="paste-warning-title">확인 경고 ({result.warnings.length})</h3>
      <ul>{result.warnings.map((issue) => <li key={`${issue.code}:${issue.path}`}><code>{issue.code}</code> · {issue.path} — {issue.message}</li>)}</ul>
    </section> : null}

    {preview ? <div className="chatgpt-paste-preview__content">
      <section aria-labelledby="paste-content-title">
        <h3 id="paste-content-title">콘텐츠</h3>
        <dl className="paste-preview-grid">
          <div><dt>콘텐츠 그룹</dt><dd>{preview.contentGroup}</dd></div>
          <div><dt>카테고리</dt><dd>{preview.category}</dd></div>
          <div><dt>제목</dt><dd>{preview.title}</dd></div>
          {preview.summary ? <div><dt>요약</dt><dd>{preview.summary}</dd></div> : null}
          <div><dt>표시 ID / 시리즈</dt><dd>{preview.displayId ?? (preview.seriesNo === null ? '없음' : String(preview.seriesNo))}</dd></div>
          <div><dt>슬러그</dt><dd>{preview.slug}</dd></div>
          <div><dt>발행일</dt><dd>{preview.publishedOn}</dd></div>
          <div><dt>발행 시각</dt><dd>{preview.publishedAt ?? '없음'}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="paste-seo-title">
        <h3 id="paste-seo-title">SEO</h3>
        <dl className="paste-preview-grid">
          <div><dt>대표 제목</dt><dd>{preview.representativeTitle}</dd></div>
          <div><dt>대안 제목</dt><dd>{preview.alternativeTitles.join(' · ')}</dd></div>
          <div><dt>메타 설명</dt><dd>{preview.metaDescription}</dd></div>
          <div><dt>포커스 키워드</dt><dd>{preview.focusKeyword}</dd></div>
          <div><dt>태그</dt><dd>{preview.tags.join(', ')}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="paste-image-title">
        <h3 id="paste-image-title">이미지 메타데이터</h3>
        <dl className="paste-preview-grid">
          <div><dt>이미지 프롬프트</dt><dd>{preview.imagePrompt}</dd></div>
          <div><dt>이미지 ALT</dt><dd>{preview.imageAlt}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="paste-sources-title">
        <h3 id="paste-sources-title">출처 ({preview.sources.length})</h3>
        {preview.sources.length ? <ol className="paste-source-list">{preview.sources.map((source, index) => <li key={`${source.sourceUrl}:${index}`}>
          <strong>{source.sourceName} — {source.sourceTitle}</strong>
          <span>{source.sourceUrl}</span>
          <span>{source.sourcePublishedAt ?? '게시 시각 없음'} · {source.checkedPoint}</span>
        </li>)}</ol> : <p>출처 없음</p>}
      </section>
      <section aria-labelledby="paste-html-title">
        <h3 id="paste-html-title">WordPress HTML (실행되지 않는 텍스트)</h3>
        <pre className="paste-html-preview" aria-label="WordPress HTML inert preview">{decodeHtmlEntitiesOnce(preview.wordpressHtml)}</pre>
      </section>
    </div> : null}

    {result.ignoredFields.length ? <section aria-labelledby="paste-ignored-title">
      <h3 id="paste-ignored-title">저장에서 제외되는 필드</h3>
      <ul>{result.ignoredFields.map((field) => <li key={`${field.path}:${field.field}`}>{field.section}: {field.path}</li>)}</ul>
    </section> : null}
    <p className="paste-tracking-status">
      NEWS_TRACKING_JSON: {result.newsTracking.present ? `인식됨 (updates ${result.newsTracking.updateCount}, followups ${result.newsTracking.followupCount})` : '없음'} · 저장하지 않음
    </p>
  </section>
}
