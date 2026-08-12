import { useRef, useState } from 'react'
import { copyTextToClipboard } from '../briefingPrompts/copyTextToClipboard'
import type { NonNewsContextBuildResult } from './nonNewsContexts.types'

type CopyState = 'success' | 'error' | null

export function NonNewsContextPreview({ result }: { result: NonNewsContextBuildResult }) {
  const [copyState, setCopyState] = useState<CopyState>(null)
  const operation = useRef(0)

  async function copyContext() {
    const currentOperation = ++operation.current
    setCopyState(null)
    try {
      await copyTextToClipboard(result.text)
      if (operation.current === currentOperation) setCopyState('success')
    } catch {
      if (operation.current === currentOperation) setCopyState('error')
    }
  }

  return (
    <div className="prompt-results">
      <section className="prompt-panel" aria-labelledby="non-news-context-preview-title">
        <div className="prompt-panel__heading">
          <div>
            <h2 id="non-news-context-preview-title">컨텍스트 미리보기</h2>
            <p>사용 항목 {result.actualCount}개 / 최대 {result.maxCount}개</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void copyContext()}>
            컨텍스트 복사
          </button>
        </div>
        <textarea
          className="prompt-preview"
          aria-label="복사용 비뉴스 컨텍스트"
          value={result.text}
          readOnly
        />
        {copyState ? (
          <p className={copyState === 'success' ? 'form-success' : 'form-alert'} role="status">
            {copyState === 'success'
              ? '컨텍스트를 복사했습니다.'
              : '컨텍스트를 복사하지 못했습니다.'}
          </p>
        ) : null}
      </section>
    </div>
  )
}
