import { describe, expect, it } from 'vitest'
import { backupRestoreBundleFixture } from './backupRestore.fixtures'
import { topologicalNewsUpdateIds } from './buildRestoreExecutionGraph'

describe('restore execution graph', () => {
  it('previous update를 먼저 정렬한다', async () => {
    const bundle = structuredClone(await backupRestoreBundleFixture())
    const previous = bundle.data.newsUpdates[0]
    bundle.data.newsUpdates.push({ ...previous, id: '50000000-0000-4000-8000-000000000002', previousUpdateId: previous.id, itemOrder: 2, updateType: 'follow_up', headline: '후속', changeSummary: '변화' })
    const result = topologicalNewsUpdateIds(bundle)
    expect(result.issues).toEqual([])
    expect(result.ids).toEqual([previous.id, '50000000-0000-4000-8000-000000000002'])
  })
  it('self cycle과 장주기 cycle을 차단한다', async () => {
    const self = structuredClone(await backupRestoreBundleFixture())
    self.data.newsUpdates[0].previousUpdateId = self.data.newsUpdates[0].id
    expect(topologicalNewsUpdateIds(self).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_UPDATE_SELF_CYCLE' })]))
    const cycle = structuredClone(await backupRestoreBundleFixture())
    const first = cycle.data.newsUpdates[0]
    const secondId = '50000000-0000-4000-8000-000000000002'
    first.previousUpdateId = secondId
    cycle.data.newsUpdates.push({ ...first, id: secondId, previousUpdateId: first.id, itemOrder: 2 })
    expect(topologicalNewsUpdateIds(cycle).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'RESTORE_UPDATE_CYCLE' })]))
  })
})

