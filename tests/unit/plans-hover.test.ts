// Unit tests for src/plugins/plans/planHover.ts: plan identity and the map tooltip text.

import { describe, expect, it } from 'vitest'

import { planKey, timeRangeText, tooltipLines } from '@/plugins/plans/planHover'

describe('planKey', () => {
  it('groups rows by person and plan number', () => {
    expect(planKey({ person_id: 'p1', plan_num: 2 })).toBe('p1/2')
    expect(planKey({ person_id: 'p1', plan_num: 2 })).not.toBe(
      planKey({ person_id: 'p1', plan_num: 1 })
    )
  })
})

describe('timeRangeText', () => {
  it('shows whichever ends are known', () => {
    expect(timeRangeText(7 * 3600, 7 * 3600 + 35 * 60)).toBe('07:00:00 – 07:35:00')
    expect(timeRangeText(null, 7 * 3600)).toBe('until 07:00:00')
    expect(timeRangeText(17 * 3600, null)).toBe('from 17:00:00')
    expect(timeRangeText(undefined, undefined)).toBe('')
  })

  it('treats negative times as unknown', () => {
    expect(timeRangeText(-1, 3600)).toBe('until 01:00:00')
  })
})

describe('tooltipLines', () => {
  it('describes a leg', () => {
    const lines = tooltipLines({
      person_id: 'person1',
      plan_num: 2,
      plan_selected: 'yes',
      element: 'leg',
      leg_mode: 'car',
      time_start: 7 * 3600,
      time_end: 7 * 3600 + 35 * 60,
    })
    expect(lines).toEqual({
      title: 'person1 · plan 2 (*)',
      detail: 'car leg',
      time: '07:00:00 – 07:35:00',
    })
  })

  it('describes an activity, and leaves the time out when there is none', () => {
    const lines = tooltipLines({
      person_id: 'person3',
      plan_num: 1,
      plan_selected: 'no',
      element: 'activity',
      activity_type: 'shopping',
    })
    expect(lines).toEqual({ title: 'person3 · plan 1', detail: 'shopping', time: '' })
  })
})
