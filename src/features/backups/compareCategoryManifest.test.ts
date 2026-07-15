import { describe, expect, it } from 'vitest'
import type { BackupCategoryManifestEntry } from './backupRestore.types'
import { compareCategoryManifest } from './compareCategoryManifest'

const category: BackupCategoryManifestEntry = { id: 'technology', contentGroup: 'news', name: '과학기술', code: 'TEC', wrapperClass: 'daily-brief-note news-briefing technology', displayIdPattern: '#YYYY-MM-DD-TEC', slugPattern: 'science-tech-briefing-YYYY-MM-DD', sortOrder: 30, enabled: true }
function changed(field: keyof BackupCategoryManifestEntry, value: unknown) { return { ...category, [field]: value } as BackupCategoryManifestEntry }

describe('compareCategoryManifest', () => {
  it('완전히 같은 설정을 compatible로 둔다', () => expect(compareCategoryManifest([category], [category], new Set(['technology']))).toEqual([]))
  it.each([
    ['name', '새 이름'], ['wrapperClass', 'changed'], ['slugPattern', 'changed'],
    ['displayIdPattern', 'changed'], ['enabled', false], ['sortOrder', 99],
  ] as const)('%s 차이를 warning으로 분류한다', (field, value) => {
    expect(compareCategoryManifest([category], [changed(field, value)], new Set(['technology']))[0]).toMatchObject({ field, severity: 'warning' })
  })
  it.each([['contentGroup', 'ai'], ['code', 'OTHER']] as const)('%s 차이를 error로 분류한다', (field, value) => {
    expect(compareCategoryManifest([category], [changed(field, value)], new Set(['technology']))[0]).toMatchObject({ field, severity: 'error' })
  })
  it('참조하는 category ID가 없으면 error다', () => expect(compareCategoryManifest([category], [], new Set(['technology']))[0].severity).toBe('error'))
  it('참조하지 않는 category ID가 없으면 warning이다', () => expect(compareCategoryManifest([category], [], new Set())[0].severity).toBe('warning'))
  it('차이를 category와 field 기준으로 결정적 정렬한다', () => {
    const other = { ...category, id: 'ai-column', name: 'AI' }
    const result = compareCategoryManifest([category, other], [{ ...category, name: 'X' }, { ...other, name: 'Y' }], new Set())
    expect(result.map((item) => item.categoryId)).toEqual(['ai-column', 'technology'])
  })
})
