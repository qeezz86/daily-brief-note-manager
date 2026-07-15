import { describe, expect, it, vi } from 'vitest'
import { backupRestoreBundleFixture, currentCategoriesFromBundle } from './backupRestore.fixtures'
import { buildRestorePlan } from './buildRestorePlan'
import { DEFAULT_RESTORE_POLICIES } from './restorePolicies'
import { createRestorePlanFileName, downloadRestorePlan, serializeRestorePlan } from './restorePlanFile'

describe('restore plan file', () => {
  it('서울 시각 파일명과 공식 format JSON을 만든다', async () => {
    const bundle = await backupRestoreBundleFixture(); const plan = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: { databaseCheck: 'complete', records: [] }, policies: structuredClone(DEFAULT_RESTORE_POLICIES), now: new Date('2026-07-15T03:04:05Z') })
    expect(createRestorePlanFileName(new Date(plan.createdAt))).toBe('daily-brief-note-restore-plan-2026-07-15-120405.json')
    expect(JSON.parse(serializeRestorePlan(plan))).toMatchObject({ format: 'daily-brief-note-restore-plan', schemaVersion: 1, planVersion: 1 })
  })
  it('JSON MIME을 사용하고 object URL을 revoke한다', async () => {
    const bundle = await backupRestoreBundleFixture(); const plan = await buildRestorePlan({ bundle, currentCategories: currentCategoriesFromBundle(bundle), lookup: { databaseCheck: 'complete', records: [] }, policies: structuredClone(DEFAULT_RESTORE_POLICIES), now: new Date('2026-07-15T03:04:05Z') })
    const browser = { createObjectURL: vi.fn(() => 'blob:plan'), revokeObjectURL: vi.fn() }
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const blob = downloadRestorePlan(plan, browser)
    expect(blob.type).toBe('application/json;charset=utf-8'); expect(browser.revokeObjectURL).toHaveBeenCalledWith('blob:plan')
    click.mockRestore()
  })
})
