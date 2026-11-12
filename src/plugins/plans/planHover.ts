// Hover helpers for the plans map: which plan a drawn leg/activity belongs to, and what its
// tooltip says.

import { formatClockTime } from './planTime'

/** The plan-table row fields the hover needs. */
export interface HoverRow {
  person_id: string
  plan_num: number
  plan_selected?: string
  element?: string
  leg_mode?: string
  activity_type?: string
  time_start?: number | null
  time_end?: number | null
}

/** One plan's identity: person and plan number (the same grouping as the plan list). */
export function planKey(row: { person_id: string; plan_num: number }): string {
  return `${row.person_id}/${row.plan_num}`
}

/** "07:00:00 – 07:35:00", "until 07:00:00", "from 17:00:00", or '' without times. */
export function timeRangeText(start?: number | null, end?: number | null): string {
  const hasStart = start != null && start >= 0
  const hasEnd = end != null && end >= 0
  if (hasStart && hasEnd) return `${formatClockTime(start)} – ${formatClockTime(end)}`
  if (hasEnd) return `until ${formatClockTime(end)}`
  if (hasStart) return `from ${formatClockTime(start)}`
  return ''
}

/** The tooltip: who and which plan, then what (leg mode or activity type) and when. */
export function tooltipLines(row: HoverRow): { title: string; detail: string; time: string } {
  const selected = row.plan_selected === 'yes' ? ' (*)' : ''
  const isLeg = row.element === 'leg'
  return {
    title: `${row.person_id} · plan ${row.plan_num}${selected}`,
    detail: isLeg ? `${row.leg_mode || 'unknown'} leg` : row.activity_type || 'activity',
    time: timeRangeText(row.time_start, row.time_end),
  }
}

/**
 * True if two rows are the same leg/activity of the same plan. The "Show everyone" map keeps
 * no table rows, only stand-ins with the plan, element and times, so match on those.
 */
export function sameElement(a: HoverRow, b: HoverRow): boolean {
  return (
    a === b ||
    (planKey(a) === planKey(b) &&
      (a.element === 'leg') === (b.element === 'leg') &&
      (a.time_start ?? null) === (b.time_start ?? null) &&
      (a.time_end ?? null) === (b.time_end ?? null))
  )
}
