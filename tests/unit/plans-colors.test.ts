// Unit tests for src/plugins/plans/planColors.ts: the viz-plans YAML `colors:` section.

import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

import {
  ACTIVITY_COLOR,
  ARC_DEFAULT_COLOR,
  DEFAULT_ACTIVITY_RADIUS,
  HOME_COLOR,
  LEG_MODE_COLORS,
  ROUTE_DEFAULT_COLOR,
  parseColor,
  planColors,
} from '@/plugins/plans/planColors'

const fromYaml = (text: string) => planColors(YAML.parse(text).colors)

describe('parseColor', () => {
  it('reads CSS names, hex (with alpha) and rgb arrays', () => {
    expect(parseColor('brown')).toEqual([165, 42, 42, 255])
    expect(parseColor('#49f')).toEqual([68, 153, 255, 255])
    expect(parseColor('#4499ff80')).toEqual([68, 153, 255, 128])
    expect(parseColor([1, 2, 3])).toEqual([1, 2, 3, 255])
    expect(parseColor([1, 2, 3, 400])).toEqual([1, 2, 3, 255])
  })

  it('rejects anything else', () => {
    expect(parseColor('not-a-color')).toBeNull()
    expect(parseColor(42)).toBeNull()
    expect(parseColor([1, 2])).toBeNull()
    expect(parseColor(['1', 2, 3])).toBeNull()
  })
})

describe('planColors: built-in colors', () => {
  const colors = planColors(undefined)

  it('colors home activities cyan and the rest magenta', () => {
    expect(colors.activities.colorOf('home_86400', ACTIVITY_COLOR)).toEqual(HOME_COLOR)
    expect(colors.activities.colorOf('work', HOME_COLOR)).toEqual(ACTIVITY_COLOR)
    expect(colors.activities.isCustom).toBe(false)
    expect(colors.activityRadius).toBe(DEFAULT_ACTIVITY_RADIUS)
  })

  it('colors legs by mode, falling back per leg kind', () => {
    expect(colors.legs.colorOf('car', ROUTE_DEFAULT_COLOR)).toEqual(LEG_MODE_COLORS.car)
    expect(colors.legs.colorOf('car_passenger', ROUTE_DEFAULT_COLOR)).toEqual(ROUTE_DEFAULT_COLOR)
    expect(colors.legs.colorOf('hovercraft', ARC_DEFAULT_COLOR)).toEqual(ARC_DEFAULT_COLOR)
    expect(colors.legs.legend().map(i => i.label)).toEqual(Object.keys(LEG_MODE_COLORS))
  })

  it('has no errors', () => {
    expect(colors.errors).toEqual([])
  })
})

describe('planColors: from YAML', () => {
  const colors = fromYaml(`
colors:
  activities:
    default: '#69f'
    radius: 7
    activity_type:
      home*: brown
      work*: pink
      '*_3600': '#00ff00'
  legs:
    default: blue
    leg_mode:
      car: '#49f'
      walk*: yellow
`)

  it('matches globs, first match in YAML order', () => {
    const act = (v: string) => colors.activities.colorOf(v, HOME_COLOR)
    expect(act('home_86400')).toEqual([165, 42, 42, 255])
    expect(act('home')).toEqual([165, 42, 42, 255])
    expect(act('work_3600')).toEqual([255, 192, 203, 255]) // work* comes before *_3600
    expect(act('shop_3600')).toEqual([0, 255, 0, 255])
    expect(colors.activities.column).toBe('activity_type')
    expect(colors.activityRadius).toBe(7)
  })

  it('replaces the built-in colors: the default covers everything else', () => {
    expect(colors.activities.colorOf('leisure', HOME_COLOR)).toEqual([102, 153, 255, 255])
    expect(colors.activities.colorOf(undefined, HOME_COLOR)).toEqual([102, 153, 255, 255])
    // pt is a built-in mode, but not in this config: the default, for routes and arcs alike
    expect(colors.legs.colorOf('pt', ROUTE_DEFAULT_COLOR)).toEqual([0, 0, 255, 255])
    expect(colors.legs.colorOf('pt', ARC_DEFAULT_COLOR)).toEqual([0, 0, 255, 255])
    expect(colors.legs.colorOf('walk_access', ROUTE_DEFAULT_COLOR)).toEqual([255, 255, 0, 255])
    expect(colors.activities.isCustom && colors.legs.isCustom).toBe(true)
  })

  it('lists the patterns, then "other", in the legend', () => {
    expect(colors.activities.legend().map(i => i.label)).toEqual([
      'home*',
      'work*',
      '*_3600',
      'other',
    ])
    expect(colors.legs.legend()[0]).toEqual({ label: 'car', css: 'rgba(68,153,255,1)' })
  })

  it('has no errors', () => {
    expect(colors.errors).toEqual([])
  })

  it('without a default, unmatched legs keep their built-in fallback', () => {
    const c = fromYaml(`
colors:
  legs:
    leg_mode:
      car: red`)
    expect(c.legs.colorOf('car', ROUTE_DEFAULT_COLOR)).toEqual([255, 0, 0, 255])
    expect(c.legs.colorOf('pt', ROUTE_DEFAULT_COLOR)).toEqual(ROUTE_DEFAULT_COLOR)
    expect(c.legs.colorOf('pt', ARC_DEFAULT_COLOR)).toEqual(ARC_DEFAULT_COLOR)
    expect(c.legs.legend().map(i => i.label)).toEqual(['car'])
  })

  it('a section with only a radius keeps the built-in colors', () => {
    const c = fromYaml(`
colors:
  activities:
    radius: 10`)
    expect(c.activities.isCustom).toBe(false)
    expect(c.activities.colorOf('home_1', ACTIVITY_COLOR)).toEqual(HOME_COLOR)
    expect(c.activityRadius).toBe(10)
  })

  it('can match activity_type_simple instead', () => {
    const c = fromYaml(`
colors:
  activities:
    activity_type_simple:
      shop: green`)
    expect(c.activities.column).toBe('activity_type_simple')
    expect(c.activities.colorOf('shop', HOME_COLOR)).toEqual([0, 128, 0, 255])
  })
})

describe('planColors: mistakes in the YAML', () => {
  it('reports bad colors, unknown columns and sections, and a bad radius', () => {
    const c = fromYaml(`
colors:
  activities:
    radius: -1
    person_id:
      p1: red
    activity_type:
      home*: not-a-color
      work*: red
  legs: blue
  vehicles: {}
`)
    expect(c.errors).toEqual([
      'colors.vehicles: unknown section; use activities or legs',
      'colors.legs: expected a section',
      "colors.activities.person_id: can't color by 'person_id', only by activity_type or activity_type_simple",
      "colors.activities.activity_type.home*: 'not-a-color' is not a color",
      "colors.activities.radius: '-1' is not a positive number",
    ])
    // what could be read still applies
    expect(c.activities.colorOf('work_1', HOME_COLOR)).toEqual([255, 0, 0, 255])
    expect(c.activityRadius).toBe(DEFAULT_ACTIVITY_RADIUS)
    expect(c.legs.isCustom).toBe(false)
  })

  it('colors by the first column when given two', () => {
    const c = fromYaml(`
colors:
  activities:
    activity_type: { home*: red }
    activity_type_simple: { home: blue }`)
    expect(c.errors).toEqual(["colors.activities: color by one column only; using 'activity_type'"])
    expect(c.activities.column).toBe('activity_type')
  })
})
