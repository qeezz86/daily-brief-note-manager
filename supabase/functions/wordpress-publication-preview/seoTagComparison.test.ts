import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifySeoTagRelation, findSeoTagComparisons, normalizeSeoTagForComparison, type SeoTagRelation } from './seoTagComparison'

interface FixtureRow { inputA: string; inputB: string; normalizedA: string; normalizedB: string; expectedRelation: SeoTagRelation }
const fixtures = JSON.parse(readFileSync(resolve('fixtures/seo-tag-normalization.json'), 'utf8')) as FixtureRow[]

describe('SEO tag comparison fixture (Edge Function)', () => {
  it.each(fixtures)('$inputA / $inputB => $expectedRelation', (row) => {
    expect(normalizeSeoTagForComparison(row.inputA)).toBe(row.normalizedA)
    expect(normalizeSeoTagForComparison(row.inputB)).toBe(row.normalizedB)
    expect(classifySeoTagRelation(row.inputA, row.inputB)).toBe(row.expectedRelation)
  })

  it('keeps source pair order and de-duplicates warnings', () => {
    expect(findSeoTagComparisons(['워드프레스 연동', '워드프레스 연동법', '워드프레스-연동법']).map(({ relation, leftIndex, rightIndex }) => ({ relation, leftIndex, rightIndex })))
      .toEqual([
        { relation: 'possible_near_duplicate', leftIndex: 0, rightIndex: 1 },
        { relation: 'normalized_duplicate', leftIndex: 1, rightIndex: 2 },
      ])
  })
})
