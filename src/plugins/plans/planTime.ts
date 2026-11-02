// Time helpers for the PlansViewer time slider.
//
// plans2parquet writes int32 time_start / time_end columns (seconds) on every activity and
// leg row: the row is "active" during [time_start, time_end), and a null time_end means
// open-ended (the day's last activity). It also stores the latest and the 99.5th-percentile
// activity_end_time in the file's key/value metadata, which set the slider's range without
// scanning the file.

/** Parquet key/value metadata key holding the latest activity_end_time, in seconds. */
export const MAX_END_TIME_KEY = 'plans_max_end_time'

/** Metadata key holding the 99.5th-percentile activity_end_time, in seconds. */
export const P995_END_TIME_KEY = 'plans_end_time_p995'

/** Stand-in for an open-ended time_end, large enough for any simulation, exact in float32. */
export const OPEN_END = 1e9

/** Seconds -> "H:MM:SS"; hours keep counting past 24 (e.g. "26:30:00"). */
export function formatClockTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** [start, end) time window of a row; a missing start is 0, a missing end is open-ended. */
export function timeWindow(row: { time_start?: number | null; time_end?: number | null }) {
  return {
    t0: row.time_start ?? 0,
    t1: row.time_end ?? OPEN_END,
  }
}

/** True if a [t0, t1) window is active at time t. */
export function isActiveAt(window: { t0: number; t1: number }, t: number): boolean {
  return window.t0 <= t && t < window.t1
}

/**
 * deck.gl DataFilterExtension (filterSize 2) settings that keep only the objects active at
 * time t, given each object's getFilterValue of [t0, t1]. t = 0 means no filter.
 * DataFilterExtension ranges are inclusive, but t1 is exclusive: times are whole seconds,
 * so with t floored, "t1 > t" is "t1 >= t + 1", and the t + 0.5 bound says exactly that
 * while hiding zero-length windows (e.g. pt interactions) and windows ending at t.
 */
export function activeAtFilter(t: number) {
  const s = Math.floor(t)
  return {
    filterEnabled: t > 0,
    filterRange: [
      [-OPEN_END, s],
      [s + 0.5, OPEN_END],
    ],
  }
}

/** Parse an end-time metadata value; 0 when missing or invalid. */
export function parseEndTime(value: string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * The time slider's end from the file's key/value metadata: the 99.5th-percentile
 * activity_end_time, so a few outlier agents don't stretch the slider, else the max
 * (files written before the percentile was added). 0 = no time columns, no slider.
 */
export function sliderEndTime(meta: Record<string, string | undefined>): number {
  return parseEndTime(meta[P995_END_TIME_KEY]) || parseEndTime(meta[MAX_END_TIME_KEY])
}
