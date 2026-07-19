export type SeoTagRelation = 'distinct' | 'normalized_duplicate' | 'possible_near_duplicate'

export interface SeoTagComparison {
  relation: Exclude<SeoTagRelation, 'distinct'>
  left: string
  right: string
  leftIndex: number
  rightIndex: number
  normalizedLeft: string
  normalizedRight: string
}

export function normalizeSeoTagForComparison(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[ \-–—·_]/gu, '').toLowerCase()
}

function length(value: string) { return [...value].length }
function differsOnlyByNumbers(left: string, right: string) {
  if (!/\d/u.test(left) && !/\d/u.test(right)) return false
  return left.replace(/\d+/gu, '') === right.replace(/\d+/gu, '') && left.replace(/\D+/gu, '') !== right.replace(/\D+/gu, '')
}

export function classifySeoTagRelation(left: string, right: string): SeoTagRelation {
  const normalizedLeft = normalizeSeoTagForComparison(left)
  const normalizedRight = normalizeSeoTagForComparison(right)
  if (!normalizedLeft || !normalizedRight) return 'distinct'
  if (normalizedLeft === normalizedRight) return 'normalized_duplicate'
  const leftLength = length(normalizedLeft)
  const rightLength = length(normalizedRight)
  const [shorter, longer, shorterLength, longerLength] = leftLength <= rightLength
    ? [normalizedLeft, normalizedRight, leftLength, rightLength]
    : [normalizedRight, normalizedLeft, rightLength, leftLength]
  const difference = longerLength - shorterLength
  return shorterLength >= 4 && difference >= 1 && difference <= 3 && longer.includes(shorter) && !differsOnlyByNumbers(shorter, longer)
    ? 'possible_near_duplicate'
    : 'distinct'
}

export function findSeoTagComparisons(tags: string[]): SeoTagComparison[] {
  const comparisons: SeoTagComparison[] = []
  const seen = new Set<string>()
  for (let leftIndex = 0; leftIndex < tags.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tags.length; rightIndex += 1) {
      const left = tags[leftIndex]
      const right = tags[rightIndex]
      const relation = classifySeoTagRelation(left, right)
      if (relation === 'distinct') continue
      const normalizedLeft = normalizeSeoTagForComparison(left)
      const normalizedRight = normalizeSeoTagForComparison(right)
      if (relation === 'possible_near_duplicate') {
        const key = [normalizedLeft, normalizedRight].sort().join('\u0000')
        if (seen.has(key)) continue
        seen.add(key)
      }
      comparisons.push({ relation, left, right, leftIndex, rightIndex, normalizedLeft, normalizedRight })
    }
  }
  return comparisons
}
