import { describe, expect, it } from 'vitest'
import { canonicalJson, comparisonKey, taxonomyLocalKey, uniqueSortedIntegers } from './normalization'

describe('WordPress taxonomy normalization', () => {
  it('NFC로 안정적인 key를 만든다', () => expect(taxonomyLocalKey('  Cafe\u0301  ')).toBe('café'))
  it('한국어와 문장부호를 보존한다', () => expect(taxonomyLocalKey(' AI·반도체 ')).toBe('ai·반도체'))
  it('locale 지정 없이 case를 비교한다', () => expect(comparisonKey('TECH News')).toBe('tech news'))
  it('빈 값은 빈 key가 된다', () => expect(taxonomyLocalKey('  ')).toBe(''))
  it('ID를 중복 제거하고 정렬한다', () => expect(uniqueSortedIntegers([7, 2, 7, 1])).toEqual([1, 2, 7]))
  it('canonical JSON은 object key만 정렬한다', () => expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] })).toBe('{"a":{"x":3,"y":2},"list":[2,1],"z":1}'))
})
