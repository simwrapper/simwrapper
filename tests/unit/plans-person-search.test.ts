// Unit tests for src/plugins/plans/personSearch.ts: the person_id search filter. Wildcard
// patterns get a range on their literal prefix so DuckDB can skip row groups of the
// person_id-sorted plans parquet; the range must always cover every GLOB match.

import { describe, expect, it } from 'vitest'

import {
  globPrefixRange,
  isGlobPattern,
  personSearchFilter,
} from '@/plugins/plans/personSearch'

describe('isGlobPattern', () => {
  it('treats * and ? anywhere as wildcards, including a leading one', () => {
    expect(isGlobPattern('p524*')).toBe(true)
    expect(isGlobPattern('p52?')).toBe(true)
    expect(isGlobPattern('a*b')).toBe(true)
    expect(isGlobPattern('*driver')).toBe(true)
    expect(isGlobPattern('?river')).toBe(true)
    expect(isGlobPattern('*drive*')).toBe(true)
  })

  it('treats plain ids, and terms made only of wildcards, as exact ids', () => {
    expect(isGlobPattern('10057')).toBe(false)
    expect(isGlobPattern('*')).toBe(false)
    expect(isGlobPattern('**')).toBe(false)
    expect(isGlobPattern('?')).toBe(false)
  })
})

describe('globPrefixRange', () => {
  it('bounds the literal prefix before the first wildcard', () => {
    expect(globPrefixRange('p524*')).toEqual({ lo: 'p524', hi: 'p525' })
    expect(globPrefixRange('p52?1')).toEqual({ lo: 'p52', hi: 'p53' })
    expect(globPrefixRange('ab[cd]*')).toEqual({ lo: 'ab', hi: 'ac' })
    expect(globPrefixRange('ab\\*x')).toEqual({ lo: 'ab', hi: 'ac' })
  })

  it('returns null when the pattern starts with a wildcard', () => {
    expect(globPrefixRange('*291')).toBeNull()
    expect(globPrefixRange('?x')).toBeNull()
    expect(globPrefixRange('[ab]x')).toBeNull()
  })

  it('handles non-BMP characters and the top code point', () => {
    expect(globPrefixRange('a😀*')).toEqual({ lo: 'a😀', hi: 'a😁' })
    // U+D7FF + 1 would be a surrogate: skip to U+E000
    expect(globPrefixRange('a\u{d7ff}*')).toEqual({ lo: 'a\u{d7ff}', hi: 'a\u{e000}' })
    // U+10FFFF can't be bumped: bump the character before it
    expect(globPrefixRange('a\u{10ffff}*')).toEqual({ lo: 'a\u{10ffff}', hi: 'b' })
    expect(globPrefixRange('\u{10ffff}*')).toEqual({ lo: '\u{10ffff}', hi: null })
  })

  it('covers every id that starts with the prefix, and nothing before it', () => {
    // compare by code point, as DuckDB does
    const cmp = (a: string, b: string) => {
      const x = Array.from(a).map(c => c.codePointAt(0)!)
      const y = Array.from(b).map(c => c.codePointAt(0)!)
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
      return x.length - y.length
    }
    const ids = ['p5', 'p52', 'p524', 'p5240', 'p524zzz', 'p524\u{10ffff}', 'p525', 'p53', 'q']
    const { lo, hi } = globPrefixRange('p524*')!
    const inRange = ids.filter(id => cmp(id, lo) >= 0 && (hi === null || cmp(id, hi) < 0))
    expect(inRange).toEqual(ids.filter(id => id.startsWith('p524')))
  })
})

describe('personSearchFilter', () => {
  it('uses an exact match for a plain id', () => {
    expect(personSearchFilter('10057')).toEqual({ where: 'person_id = ?', params: ['10057'] })
  })

  it('adds prefix range bounds ahead of the GLOB', () => {
    expect(personSearchFilter('p524*')).toEqual({
      where: 'person_id >= ? AND person_id < ? AND person_id GLOB ?',
      params: ['p524', 'p525', 'p524*'],
    })
  })

  it('omits the upper bound when none exists', () => {
    expect(personSearchFilter('\u{10ffff}*')).toEqual({
      where: 'person_id >= ? AND person_id GLOB ?',
      params: ['\u{10ffff}', '\u{10ffff}*'],
    })
  })

  it('falls back to the GLOB alone for a leading wildcard', () => {
    expect(personSearchFilter('*driver')).toEqual({
      where: 'person_id GLOB ?',
      params: ['*driver'],
    })
    expect(personSearchFilter('*291*')).toEqual({ where: 'person_id GLOB ?', params: ['*291*'] })
  })
})
