import { restoreRecordKey } from './restorePolicies'
import type { RestorePolicies, RestoreRecordPlan } from './restorePlan.types'

export function RestorePolicyForm({ policies, conflicts, disabled, onChange }: { policies: RestorePolicies; conflicts: RestoreRecordPlan[]; disabled?: boolean; onChange: (value: RestorePolicies) => void }) {
  function set<K extends keyof Omit<RestorePolicies, 'recordOverrides'>>(key: K, value: RestorePolicies[K]) { onChange({ ...policies, [key]: value }) }
  function override(record: RestoreRecordPlan, value: string) {
    const key = restoreRecordKey(record.section, record.sourceId)
    const recordOverrides = { ...policies.recordOverrides }
    if (!value) delete recordOverrides[key]
    else recordOverrides[key] = value as RestorePolicies['recordOverrides'][string]
    onChange({ ...policies, recordOverrides })
  }
  return <section className="backup-panel" aria-labelledby="restore-policy-title">
    <h2 id="restore-policy-title">복원 정책</h2>
    <p className="field-help">overwrite, unique suffix, slug·series·topic key 자동 변경은 지원하지 않습니다.</p>
    <div className="restore-policy-grid">
      <label>ID 충돌<select disabled={disabled} value={policies.idConflict} onChange={(event) => set('idConflict', event.target.value as RestorePolicies['idConflict'])}><option value="remap">결정적 UUID remap</option><option value="block">차단</option></select></label>
      <label>동일 데이터<select disabled={disabled} value={policies.identicalData} onChange={(event) => set('identicalData', event.target.value as RestorePolicies['identicalData'])}><option value="reuse">기존 row 재사용</option><option value="skip">생략</option></select></label>
      <label>운영 이력<select disabled={disabled} value={policies.operationalHistory} onChange={(event) => set('operationalHistory', event.target.value as RestorePolicies['operationalHistory'])}><option value="exclude">제외</option><option value="include">포함</option></select></label>
      <label>비활성 category<select disabled={disabled} value={policies.inactiveCategory} onChange={(event) => set('inactiveCategory', event.target.value as RestorePolicies['inactiveCategory'])}><option value="block">차단</option><option value="allow">경고 후 허용</option></select></label>
      <label>pattern 차이<select disabled={disabled} value={policies.patternDifference} onChange={(event) => set('patternDifference', event.target.value as RestorePolicies['patternDifference'])}><option value="use_current">현재 설정 사용</option><option value="block">차단</option></select></label>
      <label>timestamp<select disabled={disabled} value={policies.timestamps} onChange={(event) => set('timestamps', event.target.value as RestorePolicies['timestamps'])}><option value="preserve">백업 값 보존 계획</option><option value="database_default">DB 기본값 계획</option></select></label>
    </div>
    <h3>Record별 예외 정책</h3>
    {!conflicts.length ? <p className="empty-state">예외를 선택할 충돌 record가 없습니다.</p> : <ul className="restore-override-list">{conflicts.map((record) => {
      const key = restoreRecordKey(record.section, record.sourceId)
      const fixed = ['key_conflict', 'missing_reference'].includes(record.conflictType)
      return <li key={key}><span><strong>{record.conflictType}</strong> <code>{record.section}</code> {record.safeDisplay}</span><label>예외 정책<select aria-label={`${record.safeDisplay} 예외 정책`} disabled={disabled || fixed} value={policies.recordOverrides[key] ?? ''} onChange={(event) => override(record, event.target.value)}><option value="">전역 정책</option>{record.conflictType === 'id_conflict' ? <><option value="remap_id">remap</option><option value="block">block</option></> : <><option value="reuse_existing">reuse</option><option value="skip">skip</option><option value="block">block</option></>}</select></label></li>
    })}</ul>}
  </section>
}

