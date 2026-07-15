import type { BackupCategoryDifference, BackupCategoryManifestEntry } from './backupRestore.types'

const warningFields = ['name', 'wrapperClass', 'displayIdPattern', 'slugPattern', 'enabled', 'sortOrder'] as const
const errorFields = ['contentGroup', 'code'] as const

export function compareCategoryManifest(
  backup: BackupCategoryManifestEntry[],
  current: BackupCategoryManifestEntry[],
  referencedCategoryIds: Set<string>,
): BackupCategoryDifference[] {
  const currentById = new Map(current.map((category) => [category.id, category]))
  const differences: BackupCategoryDifference[] = []
  backup.forEach((category) => {
    const present = currentById.get(category.id)
    if (!present) {
      differences.push({ categoryId: category.id, field: 'missing', backupValue: category.id, currentValue: null, severity: referencedCategoryIds.has(category.id) ? 'error' : 'warning', message: referencedCategoryIds.has(category.id) ? '백업 데이터가 참조하는 카테고리가 현재 앱에 없습니다.' : '현재 앱에 없는 미사용 카테고리입니다.' })
      return
    }
    errorFields.forEach((field) => {
      if (category[field] !== present[field]) differences.push({ categoryId: category.id, field, backupValue: category[field], currentValue: present[field], severity: 'error', message: '카테고리 의미를 결정하는 설정이 다릅니다.' })
    })
    warningFields.forEach((field) => {
      if (category[field] !== present[field]) differences.push({ categoryId: category.id, field, backupValue: category[field], currentValue: present[field], severity: 'warning', message: field === 'enabled' && !present.enabled ? '현재 카테고리가 비활성 상태입니다.' : '백업 시점과 현재 카테고리 설정이 다릅니다.' })
    })
  })
  return differences.sort((left, right) => `${left.categoryId}|${left.field}`.localeCompare(`${right.categoryId}|${right.field}`))
}
