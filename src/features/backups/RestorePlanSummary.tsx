import { useState } from 'react'
import { downloadRestorePlan, restoreIdMapSummaryText, restorePlanIssuesText, serializeRestorePlan } from './restorePlanFile'
import type { RestorePlan } from './restorePlan.types'

const statusLabel = { ready: '실행 입력 준비 완료', warning: '경고 있는 계획', blocked: '계획 차단' }

export function RestorePlanSummary({ plan, stale }: { plan: RestorePlan; stale: boolean }) {
  const [notice, setNotice] = useState('')
  const exportBlocked = stale || plan.status === 'blocked' || plan.issues.some((issue) => issue.severity === 'error')
  async function copy(value: string, message: string) { await navigator.clipboard.writeText(value); setNotice(message) }
  const remaps = plan.recordActions.filter((action) => action.action === 'remap_id')
  return <>
    <section className={`backup-panel backup-final-status is-${plan.status}`} aria-labelledby="restore-plan-status-title">
      <p className="dashboard__eyebrow">Phase 4B-3 · read-only plan</p><h2 id="restore-plan-status-title">{statusLabel[plan.status]}</h2>
      <p>이 집계는 실제 복원 결과가 아니며 Phase 4B-4 실행 직전에 DB 충돌 상태를 다시 확인해야 합니다.</p>
      {stale ? <p className="form-alert" role="status">정책이 변경되어 현재 계획이 stale 상태입니다. 다시 생성해야 합니다.</p> : null}
      <dl className="backup-summary-grid">
        <div><dt>예상 생성 row</dt><dd>{plan.summary.expectedCreateRows}</dd></div><div><dt>기존 row 재사용</dt><dd>{plan.summary.expectedReuseRows}</dd></div><div><dt>생략</dt><dd>{plan.summary.expectedSkippedRows}</dd></div><div><dt>차단</dt><dd>{plan.summary.blockedRows}</dd></div><div><dt>Category 경고</dt><dd>{plan.summary.categoryWarningCount}</dd></div><div><dt>운영 이력</dt><dd>{plan.summary.operationalHistory}</dd></div>
      </dl>
    </section>
    <section className="backup-panel" aria-labelledby="restore-category-title"><h2 id="restore-category-title">Category mapping</h2><ul className="backup-result-list">{plan.categoryMappings.map((mapping) => <li key={mapping.sourceCategoryId}><strong>{mapping.status}</strong><span>{mapping.sourceCategoryId} → {mapping.targetCategoryId ?? 'mapping 없음'}</span><small>{mapping.warnings.join(', ') || '동일 ID·content group·code'}</small></li>)}</ul></section>
    <section className="backup-panel" aria-labelledby="restore-id-map-title"><h2 id="restore-id-map-title">결정적 ID remap</h2><p>UUID v5 remap {remaps.length}개 · 전체 UUID는 기본 화면에 표시하지 않습니다.</p><div className="backup-actions"><button type="button" className="secondary-button" onClick={() => void copy(restoreIdMapSummaryText(plan), 'ID remap 요약을 복사했습니다.')}>ID remap 요약 복사</button></div></section>
    <section className="backup-panel" aria-labelledby="restore-stages-title"><h2 id="restore-stages-title">Dependency stage</h2><ol className="restore-stage-list">{plan.executionStages.map((stage) => <li key={stage.name}><strong>{stage.order}. {stage.name}</strong><span>{stage.recordKeys.length}건 · {stage.operation}</span><small>{stage.dependsOn.length ? `선행: ${stage.dependsOn.join(', ')}` : '선행 stage 없음'}</small></li>)}</ol></section>
    <section className="backup-panel" aria-labelledby="restore-integrity-title"><h2 id="restore-integrity-title">계획 무결성</h2><p><strong>{plan.status === 'blocked' ? '오류 있음' : '검증 통과'}</strong> · {plan.issues.length}개 issue</p><ul className="backup-result-list">{plan.issues.map((issue) => <li key={`${issue.code}-${issue.recordKey ?? ''}`}><strong>{issue.severity}</strong><span><code>{issue.code}</code> {issue.message}</span><small>{issue.section}</small></li>)}</ul>{!plan.issues.length ? <p className="empty-state">무결성 문제 없음</p> : null}<div className="backup-actions"><button type="button" className="secondary-button" onClick={() => void copy(restorePlanIssuesText(plan), '경고·차단 목록을 복사했습니다.')}>경고·차단 목록 복사</button></div></section>
    <section className="backup-panel" aria-labelledby="restore-fingerprint-title"><h2 id="restore-fingerprint-title">Plan fingerprint</h2><div className="backup-checksum"><code>{plan.fingerprint.value}</code></div><p className="field-help">createdAt은 fingerprint 입력에서 제외됩니다. DB analysis fingerprint: {plan.analysis.fingerprint.slice(0, 12)}…</p><div className="backup-actions"><button type="button" className="secondary-button" disabled={exportBlocked} onClick={() => void copy(serializeRestorePlan(plan), '복원 계획 JSON을 복사했습니다.')}>복원 계획 JSON 복사</button><button type="button" className="primary-button" disabled={exportBlocked} onClick={() => { downloadRestorePlan(plan); setNotice('복원 계획 파일을 만들었습니다.') }}>복원 계획 JSON 다운로드</button></div>{exportBlocked ? <p className="field-help">blocked 또는 stale 계획은 복사·다운로드할 수 없습니다.</p> : null}</section>
    {notice ? <p className="copy-status" role="status">{notice}</p> : null}
  </>
}

