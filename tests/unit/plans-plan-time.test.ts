// Unit tests for src/plugins/plans/planTime.ts: the PlansViewer time slider helpers. The GPU
// filter (activeAtFilter) must agree exactly with isActiveAt for whole-second windows.

import { describe, expect, it } from 'vitest'

import {
  OPEN_END,
  activeAtFilter,
  formatClockTime,
  isActiveAt,
  parseEndTime,
  sliderEndTime,
  timeWindow,
} from '@/plugins/plans/planTime'

describe('formatClockTime', () => {
  it('formats H:MM:SS with hours past 24', () => {
    expect(formatClockTime(0)).toBe('00:00:00')
    expect(formatClockTime(7 * 3600 + 44 * 60 + 5)).toBe('07:44:05')
    expect(formatClockTime(26 * 3600 + 1800)).toBe('26:30:00')
    expect(formatClockTime(227 * 3600 + 44 * 60)).toBe('227:44:00')
    expect(formatClockTime(59.9)).toBe('00:00:59')
  })
})

describe('timeWindow / isActiveAt', () => {
  it('treats a missing end as open-ended and a missing start as 0', () => {
    expect(timeWindow({ time_start: 100, time_end: null })).toEqual({ t0: 100, t1: OPEN_END })
    expect(timeWindow({})).toEqual({ t0: 0, t1: OPEN_END })
  })

  it('is active on [t0, t1)', () => {
    const w = { t0: 100, t1: 200 }
    expect(isActiveAt(w, 99)).toBe(false)
    expect(isActiveAt(w, 100)).toBe(true)
    expect(isActiveAt(w, 199.9)).toBe(true)
    expect(isActiveAt(w, 200)).toBe(false)
    expect(isActiveAt({ t0: 50, t1: 50 }, 50)).toBe(false) // zero-length: never
  })
})

describe('activeAtFilter', () => {
  // emulate DataFilterExtension: inclusive ranges on both filter values
  const passes = (w: { t0: number; t1: number }, t: number) => {
    const { filterEnabled, filterRange } = activeAtFilter(t)
    if (!filterEnabled) return true
    const [[a0, b0], [a1, b1]] = filterRange
    return w.t0 >= a0 && w.t0 <= b0 && w.t1 >= a1 && w.t1 <= b1
  }

  it('is disabled at t = 0', () => {
    expect(activeAtFilter(0).filterEnabled).toBe(false)
  })

  it('matches isActiveAt for whole-second windows at any slider time', () => {
    const windows = [
      { t0: 0, t1: 25200 },
      { t0: 25200, t1: 27000 },
      { t0: 27000, t1: 27000 },
      { t0: 27000, t1: 28800 },
      { t0: 100800, t1: OPEN_END },
    ]
    const times = [1, 25199, 25199.5, 25200, 25200.4, 26999.99, 27000, 27000.5, 28799, 28800, 1e6]
    for (const w of windows) {
      for (const t of times) {
        expect(passes(w, t), `window ${w.t0}-${w.t1} at t=${t}`).toBe(isActiveAt(w, t))
      }
    }
  })
})

describe('parseEndTime', () => {
  it('parses the metadata value, 0 when missing or invalid', () => {
    expect(parseEndTime('819840')).toBe(819840)
    expect(parseEndTime(undefined)).toBe(0)
    expect(parseEndTime('')).toBe(0)
    expect(parseEndTime('abc')).toBe(0)
  })
})

describe('sliderEndTime', () => {
  it('prefers the 99.5th percentile over the max', () => {
    const meta = { plans_max_end_time: '819840', plans_end_time_p995: '95400' }
    expect(sliderEndTime(meta)).toBe(95400)
  })

  it('falls back to the max for files without the percentile', () => {
    expect(sliderEndTime({ plans_max_end_time: '128890' })).toBe(128890)
  })

  it('is 0 (no slider) without either key', () => {
    expect(sliderEndTime({})).toBe(0)
  })
})
