import { describe, expect, it } from 'vitest'
import { backupRestoreBundleFixture, backupRestoreBundleWithMappingFixture, currentCategoriesFromBundle, resignBackup } from './backupRestore.fixtures'
import type { BackupConflictLookupResult, ValidatedBackupBundle } from './backupRestore.types'
import { validateBackupForRestore } from './validateBackupForRestore'

const completeLookup: BackupConflictLookupResult = { databaseCheck: 'complete', records: [] }

async function validate(bundle: ValidatedBackupBundle, lookup: BackupConflictLookupResult | undefined = completeLookup) {
  return validateBackupForRestore(bundle, { currentCategories: currentCategoriesFromBundle(bundle), lookup, now: new Date('2026-07-15T12:00:00Z') })
}

async function changed(profile: 'core' | 'full', change: (bundle: ValidatedBackupBundle) => void) {
  const bundle = structuredClone(await backupRestoreBundleFixture(profile))
  change(bundle)
  return resignBackup(bundle)
}

describe('validateBackupForRestore format and checksum', () => {
  it('정상 core backup을 restorable로 분류한다', async () => expect((await validate(await backupRestoreBundleFixture())).result.status).toBe('restorable'))
  it('정상 full backup은 operational history warning이다', async () => {
    const output = await validate(await backupRestoreBundleFixture('full'))
    expect(output.result.status).toBe('warning'); expect(output.result.issues.some((item) => item.code === 'BACKUP_FULL_OPERATIONAL_HISTORY')).toBe(true)
  })
  it('최상위 배열을 차단한다', async () => expect((await validateBackupForRestore([], { currentCategories: [] })).result.issues[0].code).toBe('BACKUP_DATA_INVALID'))
  it('format 누락을 분류한다', async () => expect((await validateBackupForRestore({ schemaVersion: 1 }, { currentCategories: [] })).result.issues[0].code).toBe('BACKUP_FORMAT_MISSING'))
  it('다른 format을 차단한다', async () => expect((await validateBackupForRestore({ format: 'other', schemaVersion: 1 }, { currentCategories: [] })).result.issues.some((item) => item.code === 'BACKUP_FORMAT_UNSUPPORTED')).toBe(true))
  it('Import bundle 오사용을 별도 분류한다', async () => expect((await validateBackupForRestore({ format: 'daily-brief-note-content-import' }, { currentCategories: [] })).result.issues[0].code).toBe('IMPORT_BUNDLE_NOT_SUPPORTED'))
  it('지원하지 않는 schema version은 자동 변환하지 않는다', async () => {
    const bundle = await backupRestoreBundleFixture(); const input = { ...bundle, schemaVersion: 2 }
    expect((await validateBackupForRestore(input, { currentCategories: [] })).result.issues.some((item) => item.code === 'BACKUP_SCHEMA_VERSION_UNSUPPORTED')).toBe(true)
  })
  it('잘못된 profile을 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const input = { ...bundle, profile: 'other' }
    expect((await validateBackupForRestore(input, { currentCategories: [] })).result.issues.some((item) => item.code === 'BACKUP_PROFILE_INVALID')).toBe(true)
  })
  it('checksum 불일치는 DB 조회를 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); bundle.data.posts[0].title = '변조'
    const output = await validate(bundle); expect(output.result.checksumStatus).toBe('invalid'); expect(output.canQueryDatabase).toBe(false)
  })
  it('SHA-256 이외 algorithm을 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const input = { ...bundle, checksum: { ...bundle.checksum, algorithm: 'MD5' } }
    expect((await validateBackupForRestore(input, { currentCategories: [] })).result.issues.some((item) => item.code === 'BACKUP_CHECKSUM_INVALID')).toBe(true)
  })
  it('checksum lowercase hex 형식을 검증한다', async () => {
    const bundle = await backupRestoreBundleFixture(); bundle.checksum.value = bundle.checksum.value.toUpperCase()
    expect((await validateBackupForRestore(bundle, { currentCategories: [] })).result.issues[0].code).toBe('BACKUP_CHECKSUM_INVALID')
  })
  it('object key 순서가 달라도 checksum을 허용한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const reordered = { checksum: bundle.checksum, data: bundle.data, manifest: bundle.manifest, appVersion: bundle.appVersion, exportedAt: bundle.exportedAt, profile: bundle.profile, schemaVersion: bundle.schemaVersion, format: bundle.format }
    expect((await validateBackupForRestore(reordered, { currentCategories: currentCategoriesFromBundle(bundle), lookup: completeLookup, now: new Date('2026-07-15T12:00:00Z') })).result.checksumStatus).toBe('valid')
  })
  it('배열 순서 변경은 checksum으로 탐지한다', async () => {
    const bundle = await backupRestoreBundleFixture(); bundle.data.tags.push({ ...bundle.data.tags[0], id: crypto.randomUUID() }); bundle.data.tags.reverse()
    expect((await validate(bundle)).result.checksumStatus).toBe('invalid')
  })
  it('crypto.subtle 미지원은 unavailable이다', async () => {
    const bundle = await backupRestoreBundleFixture(); const output = await validateBackupForRestore(bundle, { currentCategories: currentCategoriesFromBundle(bundle), cryptoApi: {} as Crypto })
    expect(output.result.checksumStatus).toBe('unavailable')
  })
})

describe('validateBackupForRestore manifest and section schema', () => {
  it('manifest count가 실제 배열과 같으면 통과한다', async () => expect((await validate(await backupRestoreBundleFixture())).result.summary.validSections).toBe(14))
  it('section count 불일치는 복원 불가다', async () => {
    const bundle = await changed('core', (value) => { value.manifest.sectionCounts.posts = 99 })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_MANIFEST_COUNT_MISMATCH')).toBe(true)
  })
  it('totalRecords 불일치는 복원 불가다', async () => {
    const bundle = await changed('core', (value) => { value.manifest.totalRecords += 1 })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_MANIFEST_TOTAL_MISMATCH')).toBe(true)
  })
  it('generatedPromptCount 불일치는 복원 불가다', async () => {
    const bundle = await changed('core', (value) => { value.manifest.generatedPromptCount = 99 })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_MANIFEST_PROMPT_COUNT_MISMATCH')).toBe(true)
  })
  it('core 필수 section 누락을 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const data = bundle.data as unknown as Record<string, unknown>; delete data.posts; const signed = await resignBackup(bundle)
    expect((await validateBackupForRestore(signed, { currentCategories: currentCategoriesFromBundle(bundle) })).result.status).toBe('not_restorable')
  })
  it.each(['importJobs', 'importJobItems', 'importJobItemAttempts'] as const)('full에서 %s 누락을 차단한다', async (section) => {
    const bundle = await backupRestoreBundleFixture('full'); delete bundle.data[section]; const signed = await resignBackup(bundle)
    expect((await validateBackupForRestore(signed, { currentCategories: currentCategoriesFromBundle(bundle) })).result.status).toBe('not_restorable')
  })
  it('section 배열이 아니면 schema 오류다', async () => {
    const bundle = await backupRestoreBundleFixture(); (bundle.data as unknown as Record<string, unknown>).posts = {}; const signed = await resignBackup(bundle)
    expect((await validateBackupForRestore(signed, { currentCategories: currentCategoriesFromBundle(bundle) })).result.issues.some((item) => item.code === 'BACKUP_SECTION_SCHEMA_INVALID')).toBe(true)
  })
  it('record의 잘못된 UUID를 차단한다', async () => {
    const bundle = await changed('core', (value) => { value.data.posts[0].id = 'bad-id' })
    expect((await validate(bundle)).result.status).toBe('not_restorable')
  })
  it('알 수 없는 record field를 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); (bundle.data.posts[0] as unknown as Record<string, unknown>).unknownField = true; const signed = await resignBackup(bundle)
    expect((await validateBackupForRestore(signed, { currentCategories: currentCategoriesFromBundle(bundle) })).result.issues.some((item) => item.code === 'BACKUP_SECTION_SCHEMA_INVALID')).toBe(true)
  })
  it('owner_id key를 민감정보로 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); (bundle.data.posts[0] as unknown as Record<string, unknown>).owner_id = crypto.randomUUID(); const signed = await resignBackup(bundle)
    expect((await validateBackupForRestore(signed, { currentCategories: currentCategoriesFromBundle(bundle) })).result.issues.some((item) => item.code === 'BACKUP_SENSITIVE_DATA_FOUND')).toBe(true)
  })
  it('신규 taxonomy mapping section을 restorable로 검증한다', async () => {
    const bundle = await backupRestoreBundleWithMappingFixture()
    const output = await validateBackupForRestore(bundle, { currentCategories: currentCategoriesFromBundle(bundle), lookup: completeLookup })
    expect(output.result.status).toBe('restorable')
    expect(output.result.sections.find((section) => section.section === 'wordpressTaxonomyMappings')?.count).toBe(1)
  })
})

describe('validateBackupForRestore relationships and sensitive data', () => {
  it.each([
    ['post-tag', (bundle: ValidatedBackupBundle) => { bundle.data.postTags[0].postId = crypto.randomUUID() }, 'POST_TAG_POST_MISSING'],
    ['source-post', (bundle: ValidatedBackupBundle) => { bundle.data.sources[0].postId = crypto.randomUUID() }, 'SOURCE_POST_MISSING'],
    ['source-update', (bundle: ValidatedBackupBundle) => { bundle.data.sources[0].newsUpdateId = crypto.randomUUID() }, 'SOURCE_UPDATE_MISSING'],
    ['update-topic', (bundle: ValidatedBackupBundle) => { bundle.data.newsUpdates[0].topicId = crypto.randomUUID() }, 'UPDATE_TOPIC_MISSING'],
    ['previous-update', (bundle: ValidatedBackupBundle) => { bundle.data.newsUpdates[0].previousUpdateId = crypto.randomUUID() }, 'UPDATE_PREVIOUS_MISSING'],
    ['followup-topic', (bundle: ValidatedBackupBundle) => { bundle.data.newsFollowups[0].topicId = crypto.randomUUID() }, 'FOLLOWUP_TOPIC_MISSING'],
    ['prompt-category', (bundle: ValidatedBackupBundle) => { bundle.data.generatedPrompts[0].categoryId = 'missing' }, 'PROMPT_CATEGORY_MISSING'],
  ] as const)('%s broken relation을 차단한다', async (_name, mutate, code) => {
    const bundle = await changed('core', mutate); expect((await validate(bundle)).result.issues.some((item) => item.code === code)).toBe(true)
  })
  it.each([
    ['import-item-job', (bundle: ValidatedBackupBundle) => { bundle.data.importJobItems![0].jobId = crypto.randomUUID() }, 'IMPORT_ITEM_JOB_MISSING'],
    ['attempt-item', (bundle: ValidatedBackupBundle) => { bundle.data.importJobItemAttempts![0].jobItemId = crypto.randomUUID() }, 'IMPORT_ATTEMPT_ITEM_MISSING'],
  ] as const)('%s broken full relation을 차단한다', async (_name, mutate, code) => {
    const bundle = await changed('full', mutate); expect((await validate(bundle)).result.issues.some((item) => item.code === code)).toBe(true)
  })
  it('duplicate primary ID를 차단한다', async () => {
    const bundle = await changed('core', (value) => { value.data.posts.push({ ...value.data.posts[0] }) })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'DUPLICATE_ID')).toBe(true)
  })
  it('closed topic의 pending followup을 차단한다', async () => {
    const bundle = await changed('core', (value) => { value.data.newsTopics[0].status = 'closed'; value.data.newsTopics[0].closedReason = '종료' })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'CLOSED_TOPIC_PENDING_FOLLOWUP')).toBe(true)
  })
  it('email key를 차단한다', async () => {
    const bundle = await changed('core', (value) => { value.data.generatedPrompts[0].contextSnapshot = { email: 'person@example.com' } })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_SENSITIVE_DATA_FOUND')).toBe(true)
  })
  it('JWT 형태 문자열을 차단한다', async () => {
    const bundle = await changed('core', (value) => { value.data.generatedPrompts[0].promptText = 'eyJabcdefgh.eyJabcdefgh.abcdefghijklmnop' })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_SENSITIVE_DATA_FOUND')).toBe(true)
  })
  it('HTML 본문의 일반적인 secret 단어는 오탐하지 않는다', async () => {
    const bundle = await changed('core', (value) => { value.data.posts[0].htmlBody = '<p>비밀과 쿠키에 관한 일반 기사</p>' })
    expect((await validate(bundle)).result.issues.some((item) => item.code === 'BACKUP_SENSITIVE_DATA_FOUND')).toBe(false)
  })
})

describe('validateBackupForRestore category, DB and analysis', () => {
  it('category name 변경은 warning이다', async () => {
    const bundle = await backupRestoreBundleFixture(); const categories = currentCategoriesFromBundle(bundle); categories[0].name = '변경된 이름'
    expect((await validateBackupForRestore(bundle, { currentCategories: categories, lookup: completeLookup, now: new Date('2026-07-15') })).result.compatibility.categories).toBe('warning')
  })
  it('category ID 누락은 not_restorable이다', async () => expect((await validateBackupForRestore(await backupRestoreBundleFixture(), { currentCategories: [], lookup: completeLookup })).result.status).toBe('not_restorable'))
  it.each([['contentGroup', 'ai'], ['code', 'OTHER']] as const)('category %s 의미 차이는 incompatible이다', async (field, value) => {
    const bundle = await backupRestoreBundleFixture(); const categories = currentCategoriesFromBundle(bundle); Object.assign(categories[0], { [field]: value })
    expect((await validateBackupForRestore(bundle, { currentCategories: categories, lookup: completeLookup })).result.compatibility.categories).toBe('incompatible')
  })
  it.each(['partial', 'unavailable'] as const)('DB %s 조회는 warning이다', async (databaseCheck) => {
    const bundle = await backupRestoreBundleFixture(); const output = await validate(bundle, { databaseCheck, records: [] })
    expect(output.result.status).toBe('warning'); expect(output.result.databaseCheck).toBe(databaseCheck)
  })
  it('ID conflict를 remap 후보로 계산한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const output = await validate(bundle, { databaseCheck: 'complete', records: [{ section: 'posts', id: bundle.data.posts[0].id, signature: '{}' }] })
    expect(output.result.summary.idRemapCandidates).toBe(1)
  })
  it('restore analysis에서 전체 HTML과 prompt text를 제외한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const output = await validate(bundle); const json = JSON.stringify(output.result.restoreAnalysis)
    expect(json).not.toContain(bundle.data.posts[0].htmlBody!); expect(json).not.toContain(bundle.data.generatedPrompts[0].promptText)
  })
  it('restore analysis에 owner ID를 포함하지 않는다', async () => expect(JSON.stringify((await validate(await backupRestoreBundleFixture())).result.restoreAnalysis)).not.toMatch(/ownerId|owner_id/))
  it('동일 입력은 동일 분석 결과를 만든다', async () => {
    const bundle = await backupRestoreBundleFixture(); expect((await validate(bundle)).result).toEqual((await validate(bundle)).result)
  })
})
