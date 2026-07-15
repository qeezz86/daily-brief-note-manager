import { BACKUP_SECTIONS_BY_PROFILE } from './backup.constants'
import type { BackupProfile } from './backup.types'

export function BackupProfileSelector({
  value,
  disabled,
  onChange,
}: {
  value: BackupProfile
  disabled: boolean
  onChange: (profile: BackupProfile) => void
}) {
  return (
    <fieldset className="backup-profile" disabled={disabled}>
      <legend>백업 프로필</legend>
      <label>
        <input type="radio" name="backup-profile" value="core" checked={value === 'core'} onChange={() => onChange('core')} />
        <span><strong>핵심 데이터</strong><small>콘텐츠 복구에 필요한 {BACKUP_SECTIONS_BY_PROFILE.core.length}개 section</small></span>
      </label>
      <label>
        <input type="radio" name="backup-profile" value="full" checked={value === 'full'} onChange={() => onChange('full')} />
        <span><strong>전체 데이터</strong><small>핵심 데이터와 Import 실행 이력·normalized payload 포함</small></span>
      </label>
      {value === 'full' ? <p className="field-warning">Import job snapshot과 실행 이력 때문에 파일이 크게 늘어날 수 있습니다.</p> : null}
    </fieldset>
  )
}
