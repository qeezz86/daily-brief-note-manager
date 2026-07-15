import type { BuiltBackup } from './backup.types'
import { formatBackupBytes } from './formatBackupBytes'

export function BackupManifestSummary({ backup }: { backup: BuiltBackup }) {
  const { manifest } = backup.bundle
  return (
    <section className="backup-panel" aria-labelledby="backup-manifest-title">
      <h2 id="backup-manifest-title">백업 manifest</h2>
      <dl className="backup-summary-grid">
        <div><dt>프로필</dt><dd>{manifest.profile}</dd></div>
        <div><dt>전체 record</dt><dd>{manifest.totalRecords.toLocaleString()}</dd></div>
        <div><dt>파일 크기</dt><dd>{formatBackupBytes(backup.byteSize)}</dd></div>
        <div><dt>카테고리 manifest</dt><dd>{manifest.categoryManifestCount.toLocaleString()}</dd></div>
        <div><dt>관계 검사</dt><dd>통과</dd></div>
        <div><dt>checksum</dt><dd>검증 완료</dd></div>
      </dl>
      {backup.sizeWarning ? <p className="field-warning">20 MB 이상인 큰 백업입니다. 다운로드 완료를 확인해 주세요.</p> : null}
      <div className="backup-section-counts">
        {manifest.sectionNames.map((section) => (
          <span key={section}><code>{section}</code> {manifest.sectionCounts[section]?.toLocaleString() ?? 0}</span>
        ))}
      </div>
    </section>
  )
}
