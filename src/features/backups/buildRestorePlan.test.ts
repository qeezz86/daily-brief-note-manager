import { describe, expect, it } from 'vitest'
import { backupRestoreBundleFixture, currentCategoriesFromBundle } from './backupRestore.fixtures'
import { buildRestorePlan } from './buildRestorePlan'
import { buildRestoreCandidates } from './restorePlanCandidates'
import { DEFAULT_RESTORE_POLICIES } from './restorePolicies'
import type { BackupConflictLookupResult, ValidatedBackupBundle } from './backupRestore.types'
import { validateRestorePlan } from './validateRestorePlan'

const now = new Date('2026-07-15T12:34:56Z')
const policies = () => structuredClone(DEFAULT_RESTORE_POLICIES)
const lookup = (records: BackupConflictLookupResult['records'] = [], databaseCheck: BackupConflictLookupResult['databaseCheck'] = 'complete'): BackupConflictLookupResult => ({ records, databaseCheck })
async function plan(bundle: ValidatedBackupBundle, records: BackupConflictLookupResult['records'] = [], overrides = policies(), databaseCheck: BackupConflictLookupResult['databaseCheck'] = 'complete') {
  return buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: lookup(records, databaseCheck), policies: overrides, now })
}

describe('buildRestorePlan', () => {
  it('safe new row를 preserve하고 ready 계획을 만든다', async () => {
    const bundle = await backupRestoreBundleFixture(); const result = await plan(bundle)
    expect(result.status).toBe('ready')
    expect(result.recordActions.find((item) => item.section === 'posts')?.action).toBe('preserve_id')
    expect(result.idMap.posts[bundle.data.posts[0].id].targetId).toBe(bundle.data.posts[0].id)
    expect(result.executionStages.map((stage) => stage.name)).toEqual(['tags', 'posts', 'metadata', 'postTags', 'seriesCounters', 'newsTopics', 'newsStatusHistory', 'newsUpdates', 'newsUpdatePreviousLinks', 'sources', 'newsFollowups', 'generatedPrompts'])
    expect((await validateRestorePlan(result, bundle)).valid).toBe(true)
  })
  it('ID conflict를 결정적으로 remap하며 정책 변경 시 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const post = bundle.data.posts[0]
    const records = [{ section: 'posts', id: post.id, signature: '{}' }]
    const first = await plan(bundle, records); const second = await plan(bundle, records)
    const remap = first.recordActions.find((item) => item.section === 'posts')!
    expect(remap.action).toBe('remap_id'); expect(remap.targetId).toBe(second.recordActions.find((item) => item.section === 'posts')?.targetId)
    expect(remap.targetId).toMatch(/-5[0-9a-f]{3}-/)
    const blockedPolicies = policies(); blockedPolicies.idConflict = 'block'
    const blocked = await plan(bundle, records, blockedPolicies)
    expect(blocked.status).toBe('blocked'); expect(blocked.fingerprint.value).not.toBe(first.fingerprint.value)
  })
  it('exact tag는 기존 ID를 reuse하고 동일 relation은 skip한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const candidates = buildRestoreCandidates(bundle)
    const tag = candidates.find((item) => item.section === 'tags')!; const relation = candidates.find((item) => item.section === 'postTags')!
    const existingTag = '20000000-0000-4000-8000-000000000099'
    const result = await plan(bundle, [{ section: 'tags', id: existingTag, key: tag.keys[0], signature: tag.signature }, { section: 'postTags', key: relation.keys[0], signature: '' }])
    expect(result.idMap.tags[tag.sourceId]).toEqual({ action: 'reuse_existing', targetId: existingTag })
    expect(result.recordActions.find((item) => item.section === 'postTags')?.action).toBe('skip')
  })
  it('unique key의 데이터 불일치는 block한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const post = buildRestoreCandidates(bundle).find((item) => item.section === 'posts')!
    const result = await plan(bundle, [{ section: 'posts', id: '10000000-0000-4000-8000-000000000099', key: post.keys[0], signature: '{}' }])
    expect(result.status).toBe('blocked'); expect(result.recordActions.find((item) => item.section === 'posts')?.reasonCode).toBe('RESTORE_UNIQUE_DATA_MISMATCH')
  })
  it('full operational history를 기본 제외하고 선택 시 포함한다', async () => {
    const bundle = await backupRestoreBundleFixture('full')
    const excluded = await plan(bundle); expect(excluded.summary.operationalHistory).toBe('excluded'); expect(excluded.recordActions.find((item) => item.section === 'importJobs')?.action).toBe('skip'); expect(excluded.executionStages.map((stage) => stage.name)).not.toContain('importJobs')
    const include = policies(); include.operationalHistory = 'include'
    const included = await plan(bundle, [], include); expect(included.summary.operationalHistory).toBe('included'); expect(included.recordActions.find((item) => item.section === 'importJobs')?.action).toBe('preserve_id'); expect(included.executionStages.map((stage) => stage.name)).toEqual(expect.arrayContaining(['importJobs', 'importJobItems', 'importJobItemAttempts']))
  })
  it('비활성 category와 pattern 정책을 적용한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const categories = currentCategoriesFromBundle(bundle); categories[0].enabled = false; categories[0].wrapperClass = 'changed'
    const blocked = await buildRestorePlan({ bundle, currentCategories: categories, lookup: lookup(), policies: policies(), now }); expect(blocked.status).toBe('blocked')
    const allowedPolicies = policies(); allowedPolicies.inactiveCategory = 'allow'
    const allowed = await buildRestorePlan({ bundle, currentCategories: categories, lookup: lookup(), policies: allowedPolicies, now }); expect(allowed.status).toBe('warning')
    const patternBlocked = policies(); patternBlocked.inactiveCategory = 'allow'; patternBlocked.patternDifference = 'block'
    expect((await buildRestorePlan({ bundle, currentCategories: categories, lookup: lookup(), policies: patternBlocked, now })).status).toBe('blocked')
  })
  it('missing·group·code category mapping을 block한다', async () => {
    const bundle = await backupRestoreBundleFixture()
    expect((await buildRestorePlan({ bundle, currentCategories: [], lookup: lookup(), policies: policies(), now })).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_CATEGORY_MISSING' })]))
    const group = currentCategoriesFromBundle(bundle); group[0].contentGroup = 'ai'
    expect((await buildRestorePlan({ bundle, currentCategories: group, lookup: lookup(), policies: policies(), now })).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_CATEGORY_GROUP_MISMATCH' })]))
    const code = currentCategoriesFromBundle(bundle); code[0].code = 'OTHER'
    expect((await buildRestorePlan({ bundle, currentCategories: code, lookup: lookup(), policies: policies(), now })).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_CATEGORY_CODE_MISMATCH' })]))
  })
  it('partial DB lookup과 remap target collision을 block한다', async () => {
    const bundle = await backupRestoreBundleFixture()
    expect((await plan(bundle, [], policies(), 'partial')).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_DATABASE_LOOKUP_INCOMPLETE' })]))
    const post = bundle.data.posts[0]; const provisional = await plan(bundle, [{ section: 'posts', id: post.id, signature: '{}' }]); const target = provisional.idMap.posts[post.id].targetId!
    const collision = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: lookup([{ section: 'posts', id: post.id, signature: '{}' }]), policies: policies(), targetCollisions: [{ section: 'posts', id: target }], now })
    expect(collision.status).toBe('blocked'); expect(collision.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_REMAP_TARGET_CONFLICT' })]))
  })
  it('unsupported record override를 차단한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const override = policies(); override.recordOverrides[`posts:${bundle.data.posts[0].id}`] = 'skip'
    const result = await plan(bundle, [], override)
    expect(result.status).toBe('blocked'); expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_OVERRIDE_UNSUPPORTED' })]))
  })
  it('fingerprint는 createdAt과 무관하고 분석·정책 변경을 감지한다', async () => {
    const bundle = await backupRestoreBundleFixture()
    const first = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: lookup(), policies: policies(), now })
    const later = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: lookup(), policies: policies(), now: new Date('2027-01-01T00:00:00Z') })
    expect(later.createdAt).not.toBe(first.createdAt); expect(later.fingerprint.value).toBe(first.fingerprint.value)
    const changed = await plan(bundle, [{ section: 'sources', id: bundle.data.sources[0].id, signature: '{}' }])
    expect(changed.analysis.fingerprint).not.toBe(first.analysis.fingerprint); expect(changed.fingerprint.value).not.toBe(first.fingerprint.value)
  })
  it('plan JSON에 owner와 원문 payload를 포함하지 않는다', async () => {
    const bundle = await backupRestoreBundleFixture('full'); const json = JSON.stringify(await plan(bundle))
    expect(json).not.toMatch(/ownerId|owner_id|htmlBody|promptText|normalizedPayload/)
    expect(json).toContain('recheckRequiredBeforeExecution')
  })
})
