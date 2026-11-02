// person_id search helpers for the PlansViewer.
//
// plans2parquet writes the plans parquet sorted by person_id, so each row group's
// min/max statistics cover a narrow, non-overlapping id range. An explicit range filter
// on person_id lets DuckDB skip every row group outside it; a GLOB filter alone can't.

/**
 * True if the search term is a GLOB pattern: it has a * or ? wildcard anywhere (so a suffix
 * search like '*driver' works) plus at least one literal character. A term made only of
 * wildcards ('*') would match every person and load the whole file, so it isn't a pattern.
 */
export function isGlobPattern(term: string): boolean {
  return /[*?]/.test(term) && /[^*?]/.test(term)
}

/**
 * The range [lo, hi) of strings that can match a GLOB pattern: every string starting with
 * the pattern's literal prefix (the text before the first wildcard, character class or
 * escape). Returns null when the pattern starts with a wildcard, and hi is null when no
 * upper bound exists. Keep the GLOB in the query too: the range only needs to cover the
 * matches, not to match exactly.
 *
 * Bounds compare by code point, which is how DuckDB compares VARCHARs (UTF-8 bytes).
 */
export function globPrefixRange(pattern: string): { lo: string; hi: string | null } | null {
  const i = pattern.search(/[*?[\\]/)
  const lo = i === -1 ? pattern : pattern.slice(0, i)
  if (!lo) return null

  // hi = lo with its last character bumped to the next code point, e.g. 'p524' -> 'p525'.
  // A last character of U+10FFFF can't be bumped, so drop it and bump the one before.
  const chars = Array.from(lo)
  while (chars.length) {
    let cp = chars[chars.length - 1].codePointAt(0)! + 1
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xe000 // skip the UTF-16 surrogate range
    if (cp <= 0x10ffff) {
      chars[chars.length - 1] = String.fromCodePoint(cp)
      return { lo, hi: chars.join('') }
    }
    chars.pop()
  }
  return { lo, hi: null }
}

/**
 * WHERE clause and its parameters for a person_id search: an exact match for a plain id,
 * otherwise the GLOB plus a range on the pattern's literal prefix.
 */
export function personSearchFilter(term: string): { where: string; params: string[] } {
  if (!isGlobPattern(term)) return { where: 'person_id = ?', params: [term] }

  const conditions: string[] = []
  const params: string[] = []
  const range = globPrefixRange(term)
  if (range) {
    conditions.push('person_id >= ?')
    params.push(range.lo)
    if (range.hi !== null) {
      conditions.push('person_id < ?')
      params.push(range.hi)
    }
  }
  conditions.push('person_id GLOB ?')
  params.push(term)
  return { where: conditions.join(' AND '), params }
}
