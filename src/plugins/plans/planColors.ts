// Activity and leg colors for the plans viewer: built-in defaults, or the `colors:` section of
// a viz-plans-*.yaml, which replaces them:
//
//   colors:
//     activities:
//       default: '#69f'        # anything no pattern matches
//       radius: 4              # dot radius, pixels
//       activity_type:         # the column to match: activity_type or activity_type_simple
//         home*: brown         # glob pattern -> color; first match wins, in YAML order
//     legs:
//       default: blue
//       leg_mode:
//         car: '#49f'
//
// "Show everyone" loads one value per element (activity type or leg mode), so only those
// columns can be matched. Colors are resolved once per distinct value (cached).

import micromatch from 'micromatch'
import { color as parseCssColor } from 'd3-color'

export type RGBA = [number, number, number, number]

// built-in colors, used when the YAML has no colors for that section
export const LEG_MODE_COLORS: Record<string, RGBA> = {
  bike: [0, 225, 50, 255],
  car: [0, 128, 240, 255],
  drt: [180, 0, 228, 255],
  freight: [255, 128, 255, 255],
  pt: [255, 0, 40, 255],
  ride: [0, 255, 255, 255],
  walk: [255, 220, 0, 255],
}
export const HOME_COLOR: RGBA = [24, 255, 255, 255]
export const ACTIVITY_COLOR: RGBA = [255, 64, 255, 255]
// legs no pattern matches, when the YAML gives no default: routed legs / teleported arcs
export const ROUTE_DEFAULT_COLOR: RGBA = [0, 128, 230, 255]
export const ARC_DEFAULT_COLOR: RGBA = [200, 200, 200, 192]
export const DEFAULT_ACTIVITY_RADIUS = 4

// the columns each section may match on (see the note at the top)
export const ACTIVITY_COLUMNS = ['activity_type', 'activity_type_simple']
export const LEG_COLUMNS = ['leg_mode']

interface ColorRule {
  label: string
  color: RGBA
  isMatch: (value: string) => boolean
}

export interface LegendItem {
  label: string
  css: string
}

/** One section's colors: glob rules on one column, then a default. */
export class ColorScheme {
  // results by value; RGBA, or null for "no rule matched"
  private cache = new Map<string, RGBA | null>()

  constructor(
    readonly column: string,
    private readonly rules: ColorRule[],
    readonly fallback: RGBA | null,
    // false = the built-in colors (no `colors:` for this section in the YAML)
    readonly isCustom: boolean
  ) {}

  /** The color for a column value: first matching rule, else the default, else `fallback`. */
  colorOf(value: unknown, fallback: RGBA): RGBA {
    const key = value == null ? '' : String(value)
    let hit = this.cache.get(key)
    if (hit === undefined) {
      hit = this.rules.find(rule => rule.isMatch(key))?.color ?? null
      this.cache.set(key, hit)
    }
    return hit ?? this.fallback ?? fallback
  }

  /** Legend entries: each rule, then "other" for the default (if there is one). */
  legend(): LegendItem[] {
    const items = this.rules.map(r => ({ label: r.label, css: cssColor(r.color) }))
    if (this.fallback) items.push({ label: 'other', css: cssColor(this.fallback) })
    return items
  }
}

export interface PlanColors {
  activities: ColorScheme
  legs: ColorScheme
  activityRadius: number
  // problems in the YAML (bad colors, unknown columns...): shown to the user
  errors: string[]
}

export function cssColor(c: RGBA) {
  return `rgba(${c[0]},${c[1]},${c[2]},${+(c[3] / 255).toFixed(3)})`
}

/** A YAML color: any CSS color string ('brown', '#49f', '#4499ff80'), or [r,g,b(,a)] 0-255. */
export function parseColor(value: unknown): RGBA | null {
  if (Array.isArray(value) && (value.length === 3 || value.length === 4)) {
    if (!value.every(v => typeof v === 'number' && Number.isFinite(v))) return null
    const [r, g, b, a = 255] = value as number[]
    return [r, g, b, a].map(v => Math.max(0, Math.min(255, Math.round(v)))) as RGBA
  }
  if (typeof value !== 'string') return null
  const parsed = parseCssColor(value.trim())
  if (!parsed) return null
  const { r, g, b, opacity } = parsed.rgb()
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(255 * opacity)]
}

const builtInActivities = () =>
  new ColorScheme(
    'activity_type',
    [{ label: 'home', color: HOME_COLOR, isMatch: v => v.startsWith('home') }],
    ACTIVITY_COLOR,
    false
  )

const builtInLegs = () =>
  new ColorScheme(
    'leg_mode',
    Object.entries(LEG_MODE_COLORS).map(([mode, color]) => ({
      label: mode,
      color,
      isMatch: (v: string) => v === mode,
    })),
    null,
    false
  )

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * One section of the YAML (`activities` or `legs`), or null for the built-in colors: a
 * section without `default` or a column of patterns keeps them (e.g. only a `radius`).
 */
function parseSection(
  name: string,
  section: Record<string, unknown>,
  columns: string[],
  extraKeys: string[],
  errors: string[]
): ColorScheme | null {
  const color = (where: string, value: unknown) => {
    const c = parseColor(value)
    if (!c) errors.push(`colors.${where}: '${value}' is not a color`)
    return c
  }

  const keys = Object.keys(section).filter(k => k !== 'default' && !extraKeys.includes(k))
  const unknown = keys.filter(k => !columns.includes(k))
  for (const k of unknown) {
    errors.push(`colors.${name}.${k}: can't color by '${k}', only by ${columns.join(' or ')}`)
  }
  const known = keys.filter(k => columns.includes(k))
  if (known.length > 1) {
    errors.push(`colors.${name}: color by one column only; using '${known[0]}'`)
  }
  const column = known[0]
  if (!column && !('default' in section)) return null

  const rules: ColorRule[] = []
  if (column) {
    const patterns = section[column]
    if (!isObject(patterns)) {
      errors.push(`colors.${name}.${column}: expected 'pattern: color' entries`)
    } else {
      for (const [pattern, value] of Object.entries(patterns)) {
        const c = color(`${name}.${column}.${pattern}`, value)
        if (c) rules.push({ label: pattern, color: c, isMatch: micromatch.matcher(pattern) })
      }
    }
  }
  const fallback = 'default' in section ? color(`${name}.default`, section.default) : null
  return new ColorScheme(column || columns[0], rules, fallback, true)
}

/** The colors for a viz config's `colors:` section (undefined: the built-in colors). */
export function planColors(config: unknown): PlanColors {
  const errors: string[] = []
  let activities: ColorScheme | null = null
  let legs: ColorScheme | null = null
  let activityRadius = DEFAULT_ACTIVITY_RADIUS

  if (config != null && !isObject(config)) {
    errors.push('colors: expected activities and/or legs')
  } else if (config) {
    for (const key of Object.keys(config)) {
      if (key !== 'activities' && key !== 'legs') {
        errors.push(`colors.${key}: unknown section; use activities or legs`)
      }
    }
    const { activities: acts, legs: lgs } = config
    if (acts != null && !isObject(acts)) errors.push('colors.activities: expected a section')
    if (lgs != null && !isObject(lgs)) errors.push('colors.legs: expected a section')

    if (isObject(acts)) {
      activities = parseSection('activities', acts, ACTIVITY_COLUMNS, ['radius'], errors)
      if ('radius' in acts) {
        const r = Number(acts.radius)
        if (Number.isFinite(r) && r > 0) activityRadius = r
        else errors.push(`colors.activities.radius: '${acts.radius}' is not a positive number`)
      }
    }
    if (isObject(lgs)) legs = parseSection('legs', lgs, LEG_COLUMNS, [], errors)
  }

  return {
    activities: activities ?? builtInActivities(),
    legs: legs ?? builtInLegs(),
    activityRadius,
    errors,
  }
}
