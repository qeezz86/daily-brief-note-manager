import { describe, expect, it } from 'vitest'
import fixtureRows from '../../../fixtures/seo-tag-normalization.json'
import { classifySeoTagRelation, findSeoTagComparisons, normalizeSeoTagForComparison, type SeoTagRelation } from './seoTagComparison'

interface FixtureRow {
  inputA: string
  inputB: string
  normalizedA: string
  normalizedB: string
  expectedRelation: SeoTagRelation
}

const fixtures = fixtureRows as FixtureRow[]

describe('SEO tag comparison fixture (frontend)', () => {
  it.each(fixtures)('$inputA / $inputB => $expectedRelation', (row) => {
    expect(normalizeSeoTagForComparison(row.inputA)).toBe(row.normalizedA)
    expect(normalizeSeoTagForComparison(row.inputB)).toBe(row.normalizedB)
    expect(classifySeoTagRelation(row.inputA, row.inputB)).toBe(row.expectedRelation)
  })

  it('keeps pair order deterministic and removes repeated warnings', () => {
    expect(findSeoTagComparisons(['워드프레스 연동', '워드프레스 연동법', '워드프레스-연동법']))
      .toEqual([
        expect.objectContaining({ left: '워드프레스 연동', right: '워드프레스 연동법', leftIndex: 0, rightIndex: 1, relation: 'possible_near_duplicate' }),
        expect.objectContaining({ left: '워드프레스 연동법', right: '워드프레스-연동법', leftIndex: 1, rightIndex: 2, relation: 'normalized_duplicate' }),
      ])
  })
})
