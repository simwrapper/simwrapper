// "Show everyone": every selected plan of the whole file, for the time slider.
//
// The plans parquet is loaded once, streamed batch by batch (see PlansViewer), into compact
// typed arrays, and drawn the same way the plan view draws a searched plan:
//  - activities: dots at the activity location
//  - legs with a link route: paths along the road network, link by link
//  - other legs (walk, pt, ...): arcs from the middle of the start link to the end link
// Activities and arcs are static and filtered by time on the GPU. Road paths are far too many
// to draw at once (Leipzig 10%: 21.6M links), so only the routes under way at the slider time
// are turned into path vertices (a few thousand at once), found by binary search in routes
// sorted by start time.
//
// Every activity, arc and route also keeps the index of the plan it belongs to (see `plans`),
// so the map can tell whose leg is under the mouse.

import { OPEN_END } from './planTime'
import type { HoverRow } from './planHover'

/** Routes longer than this are kept apart, so the search window for the rest stays short. */
const LONG_ROUTE_SECONDS = 2 * 3600

/** The road network: link id -> index, and x0, y0, x1, y1 per link index (lon/lat). */
export interface LinkLookup {
  index: Map<string, number>
  coords: Float32Array
}

/** One streamed batch of the overview query (see overviewQuery in PlansViewer). */
export interface OverviewBatch {
  numRows: number
  isLeg: ArrayLike<number> // 1 = leg, 0 = activity
  lon: ArrayLike<number> // activity coordinates; NaN on legs
  lat: ArrayLike<number>
  t0: ArrayLike<number> // time_start, seconds; < 0 = unknown
  t1: ArrayLike<number> // time_end, seconds; open-ended = a large number
  kind: (i: number) => string // activity type, or leg mode
  routeType: (i: number) => string // '' on activities
  startLink: (i: number) => string
  endLink: (i: number) => string
  routeText: (i: number) => string // space-separated link ids of a 'links' route
  personId: (i: number) => string
  planNum: ArrayLike<number>
}

/** The plans in an overview: person and plan number per plan index. */
export interface OverviewPlans {
  count: number
  person: string[]
  planNum: Int32Array
}

export interface OverviewData {
  /** dots, like the plan view's activity-locations layer */
  activities: {
    count: number
    positions: Float32Array // lon, lat pairs
    times: Float32Array // t0, t1 pairs: DataFilterExtension filter values
    kind: Uint16Array // index into kinds
    plan: Uint32Array // index into plans
  }
  /** legs without a link route, like the plan view's non-routed-leg-arcs layer */
  arcs: {
    count: number
    source: Float32Array // lon, lat pairs: middle of the start link
    target: Float32Array // middle of the end link
    times: Float32Array
    kind: Uint16Array
    plan: Uint32Array
  }
  /** legs with a link route, like the plan view's deliveryroutes / leg-arcs layers */
  routes: Routes
  kinds: string[]
  plans: OverviewPlans
  rowsRead: number
  /** distinct link ids that aren't in the network (their legs are skipped) */
  unknownLinks: number
  /** the network's link coordinates (x0, y0, x1, y1 per link index), for drawing routes */
  linkCoords: Float32Array
}

export interface Routes {
  count: number
  /** link indexes of route r: links[linkStart[r] .. linkStart[r + 1]) */
  links: Int32Array
  linkStart: Uint32Array
  kind: Uint16Array
  plan: Uint32Array
  /** first and last point of each route, for "simple tours" arcs */
  source: Float32Array
  target: Float32Array
  times: Float32Array
  /** routes by start time: order[0, shortCount) are short, order[shortCount, count) long */
  order: Uint32Array
  t0: Float64Array // t0[m], t1[m] belong to route order[m]
  t1: Float64Array
  shortCount: number
}

/** Collects streamed batches into growable typed arrays, then builds the OverviewData. */
export class OverviewBuilder {
  private kindCodes = new Map<string, number>()
  private kinds: string[] = []
  private rows = 0
  private unknown = new Set<string>()
  // plan index by "person/plan"; rows arrive grouped by plan, so the last one is checked first
  private planCodes = new Map<string, number>()
  private planPerson: string[] = []
  private planNums: number[] = []
  private lastPlan = { person: '', num: NaN, code: -1 }

  private acts = new Columns({
    lon: Float32Array,
    lat: Float32Array,
    t0: Float64Array,
    t1: Float64Array,
    kind: Uint16Array,
    plan: Uint32Array,
  })
  private arcs = new Columns({
    x0: Float32Array,
    y0: Float32Array,
    x1: Float32Array,
    y1: Float32Array,
    t0: Float64Array,
    t1: Float64Array,
    kind: Uint16Array,
    plan: Uint32Array,
  })
  private routes = new Columns({
    t0: Float64Array,
    t1: Float64Array,
    kind: Uint16Array,
    plan: Uint32Array,
    linkStart: Uint32Array,
  })
  private links = new IntList()

  constructor(private network: LinkLookup) {}

  get rowsRead() {
    return this.rows
  }

  append(batch: OverviewBatch) {
    const { index, coords } = this.network
    for (let i = 0; i < batch.numRows; i++) {
      const t0 = batch.t0[i]
      const t1 = batch.t1[i]
      if (!(t0 >= 0 && t1 > t0)) continue // unknown or zero-length: never visible
      const plan = this.planFor(batch.personId(i), Number(batch.planNum[i]))

      if (!batch.isLeg[i]) {
        const lon = batch.lon[i]
        const lat = batch.lat[i]
        if (!isFinite(lon) || !isFinite(lat)) continue
        this.acts.push({ lon, lat, t0, t1, kind: this.codeFor(batch.kind(i)), plan })
        continue
      }

      if (batch.routeType(i) === 'links') {
        const ids = (batch.routeText(i) || '').split(' ')
        const first = this.links.length
        for (const id of ids) {
          const link = index.get(id)
          if (link !== undefined) this.links.push(link)
          else if (id) this.unknown.add(id)
        }
        if (this.links.length === first) continue // no known links: nothing to draw
        this.routes.push({ t0, t1, kind: this.codeFor(batch.kind(i)), plan, linkStart: first })
        continue
      }

      // no link route: an arc between the middles of the start and end links
      const a = this.linkIndex(batch.startLink(i))
      const b = this.linkIndex(batch.endLink(i))
      if (a === undefined || b === undefined) continue
      this.arcs.push({
        x0: 0.5 * (coords[4 * a] + coords[4 * a + 2]),
        y0: 0.5 * (coords[4 * a + 1] + coords[4 * a + 3]),
        x1: 0.5 * (coords[4 * b] + coords[4 * b + 2]),
        y1: 0.5 * (coords[4 * b + 1] + coords[4 * b + 3]),
        t0,
        t1,
        kind: this.codeFor(batch.kind(i)),
        plan,
      })
    }
    this.rows += batch.numRows
  }

  finish(): OverviewData {
    const { coords } = this.network
    const a = this.acts.columns
    const nActs = this.acts.length
    const activities = {
      count: nActs,
      positions: interleave(a.lon, a.lat, nActs),
      times: interleave(a.t0, a.t1, nActs),
      kind: Uint16Array.from(a.kind.subarray(0, nActs)),
      plan: Uint32Array.from(a.plan.subarray(0, nActs)),
    }

    const c = this.arcs.columns
    const nArcs = this.arcs.length
    const arcs = {
      count: nArcs,
      source: interleave(c.x0, c.y0, nArcs),
      target: interleave(c.x1, c.y1, nArcs),
      times: interleave(c.t0, c.t1, nArcs),
      kind: Uint16Array.from(c.kind.subarray(0, nArcs)),
      plan: Uint32Array.from(c.plan.subarray(0, nArcs)),
    }

    const r = this.routes.columns
    const nRoutes = this.routes.length
    const links = this.links.values.slice(0, this.links.length)
    const linkStart = new Uint32Array(nRoutes + 1)
    linkStart.set(r.linkStart.subarray(0, nRoutes))
    linkStart[nRoutes] = links.length
    const source = new Float32Array(2 * nRoutes)
    const target = new Float32Array(2 * nRoutes)
    for (let k = 0; k < nRoutes; k++) {
      const first = links[linkStart[k]]
      const last = links[linkStart[k + 1] - 1]
      source[2 * k] = coords[4 * first]
      source[2 * k + 1] = coords[4 * first + 1]
      target[2 * k] = coords[4 * last + 2]
      target[2 * k + 1] = coords[4 * last + 3]
    }
    const isLong = (k: number) => r.t1[k] - r.t0[k] > LONG_ROUTE_SECONDS
    const byStart = (x: number, y: number) => r.t0[x] - r.t0[y]
    const ids = Array.from({ length: nRoutes }, (_, k) => k)
    const short = ids.filter(k => !isLong(k)).sort(byStart)
    const long = ids.filter(isLong).sort(byStart)
    const order = Uint32Array.from(short.concat(long))
    const routes: Routes = {
      count: nRoutes,
      links,
      linkStart,
      kind: Uint16Array.from(r.kind.subarray(0, nRoutes)),
      plan: Uint32Array.from(r.plan.subarray(0, nRoutes)),
      source,
      target,
      times: interleave(r.t0, r.t1, nRoutes),
      order,
      t0: Float64Array.from(order, k => r.t0[k]),
      t1: Float64Array.from(order, k => r.t1[k]),
      shortCount: short.length,
    }

    return {
      activities,
      arcs,
      routes,
      kinds: this.kinds,
      plans: {
        count: this.planPerson.length,
        person: this.planPerson,
        planNum: Int32Array.from(this.planNums),
      },
      rowsRead: this.rows,
      unknownLinks: this.unknown.size,
      linkCoords: coords,
    }
  }

  /** Index of a link id in the network; unknown ids are tallied. */
  private linkIndex(id: string) {
    const link = this.network.index.get(id)
    if (link === undefined && id) this.unknown.add(id)
    return link
  }

  private planFor(person: string, num: number) {
    const last = this.lastPlan
    if (person === last.person && num === last.num) return last.code
    const key = `${person}/${num}`
    let code = this.planCodes.get(key)
    if (code === undefined) {
      code = this.planPerson.length
      this.planPerson.push(person)
      this.planNums.push(num)
      this.planCodes.set(key, code)
    }
    this.lastPlan = { person, num, code }
    return code
  }

  private codeFor(kind: string) {
    let code = this.kindCodes.get(kind)
    if (code === undefined) {
      code = this.kinds.length
      this.kinds.push(kind)
      this.kindCodes.set(kind, code)
    }
    return code
  }
}

/** Indexes (into routes.order) of the routes under way at time t: t0 <= t < t1. */
export function activeRoutes(routes: Routes, t: number, out: number[] = []): number[] {
  out.length = 0
  const take = (m: number) => {
    if (routes.t0[m] <= t && t < routes.t1[m]) out.push(routes.order[m])
  }
  // short routes: only those that started in the last LONG_ROUTE_SECONDS can be under way
  const s = routes.shortCount
  const end = upperBound(routes.t0, t, 0, s)
  for (let m = lowerBound(routes.t0, t - LONG_ROUTE_SECONDS, 0, end); m < end; m++) take(m)
  // long routes: any that started by t
  const endLong = upperBound(routes.t0, t, s, routes.count)
  for (let m = s; m < endLong; m++) take(m)
  return out
}

/** Path vertices for some routes, in deck.gl's binary path format. */
export interface RoutePaths {
  length: number // number of paths
  startIndices: Uint32Array // length + 1 entries
  positions: Float32Array // lon, lat per vertex
  colors: Uint8ClampedArray // rgba per vertex
}

/**
 * Builds the road paths of the given routes the way the plan view's addRouteToMap() does:
 * start at the first link's from-node, then for every link add its from-node (unless it
 * repeats the previous point) and its to-node. Reuses `into`'s buffers when they're big enough.
 */
export function buildRoutePaths(
  routes: Routes,
  ids: number[],
  coords: Float32Array,
  colorOf: (kind: number) => ArrayLike<number>,
  into?: RoutePaths
): RoutePaths {
  // upper bound on vertices: 1 + 2 per link
  let maxVerts = 0
  for (const r of ids) maxVerts += 1 + 2 * (routes.linkStart[r + 1] - routes.linkStart[r])
  // new buffers (with headroom) only when the reusable ones are too small
  const vertCap = Math.ceil(1.5 * Math.max(maxVerts, 1024))
  const pathCap = Math.ceil(1.5 * Math.max(ids.length + 1, 1024))
  const out: RoutePaths =
    into && into.positions.length >= 2 * maxVerts && into.startIndices.length >= ids.length + 1
      ? into
      : {
          length: 0,
          startIndices: new Uint32Array(pathCap),
          positions: new Float32Array(2 * vertCap),
          colors: new Uint8ClampedArray(4 * vertCap),
        }
  const { positions, colors, startIndices } = out
  let v = 0
  const put = (x: number, y: number, color: ArrayLike<number>) => {
    positions[2 * v] = x
    positions[2 * v + 1] = y
    colors.set(color, 4 * v)
    v++
  }
  ids.forEach((r, p) => {
    startIndices[p] = v
    const color = colorOf(routes.kind[r])
    const firstLink = routes.links[routes.linkStart[r]]
    put(coords[4 * firstLink], coords[4 * firstLink + 1], color)
    for (let k = routes.linkStart[r]; k < routes.linkStart[r + 1]; k++) {
      const link = routes.links[k]
      const fx = coords[4 * link]
      const fy = coords[4 * link + 1]
      if (fx !== positions[2 * v - 2] || fy !== positions[2 * v - 1]) put(fx, fy, color)
      put(coords[4 * link + 2], coords[4 * link + 3], color)
    }
  })
  startIndices[ids.length] = v
  out.length = ids.length
  return out
}

// --- helpers ---------------------------------------------------------------------------

type NumberArrayType =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor

type NumberArray = Float32Array | Float64Array | Uint16Array | Uint32Array

/** Named, growable typed-array columns, appended one row at a time. */
class Columns<K extends string> {
  columns: Record<K, NumberArray>
  length = 0
  private cap = 0

  constructor(private types: Record<K, NumberArrayType>) {
    this.columns = {} as Record<K, NumberArray>
    for (const k in types) this.columns[k] = new types[k](0)
  }

  push(row: Record<K, number>) {
    if (this.length === this.cap) this.grow()
    for (const k in row) this.columns[k][this.length] = row[k]
    this.length++
  }

  private grow() {
    this.cap = Math.max(1024, 2 * this.cap)
    for (const k in this.types) {
      const next = new this.types[k](this.cap)
      next.set(this.columns[k].subarray(0, this.length))
      this.columns[k] = next
    }
  }
}

/** A growable Int32Array. */
class IntList {
  values = new Int32Array(1 << 16)
  length = 0

  push(value: number) {
    if (this.length === this.values.length) {
      const next = new Int32Array(2 * this.values.length)
      next.set(this.values)
      this.values = next
    }
    this.values[this.length++] = value
  }
}

/** [a0, b0, a1, b1, ...] as float32, from the first n values of a and b. */
function interleave(a: ArrayLike<number>, b: ArrayLike<number>, n: number) {
  const out = new Float32Array(2 * n)
  for (let i = 0; i < n; i++) {
    out[2 * i] = a[i]
    out[2 * i + 1] = b[i]
  }
  return out
}

/** First index in sorted[lo, hi) whose value is > x. */
function upperBound(sorted: Float64Array, x: number, lo: number, hi: number) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First index in sorted[lo, hi) whose value is >= x. */
function lowerBound(sorted: Float64Array, x: number, lo: number, hi: number) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Network lookup from PlansViewer's links table ({ linkId: [x0, y0, x1, y1] }). */
export function linkLookup(links: Record<string, ArrayLike<number>>): LinkLookup {
  const ids = Object.keys(links)
  const index = new Map<string, number>()
  const coords = new Float32Array(4 * ids.length)
  ids.forEach((id, i) => {
    index.set(id, i)
    coords.set(links[id], 4 * i)
  })
  return { index, coords }
}

/** Straight-line legs: arcs, or routes drawn as start-to-end arcs ("simple tours"). */
export interface ArcSet {
  count: number
  source: Float32Array
  target: Float32Array
  times: Float32Array
  kind: Uint16Array
}

// --- picking -----------------------------------------------------------------------------

/** The three kinds of things an overview draws, each indexed from 0 within its own set. */
export type OverviewSet = 'activity' | 'arc' | 'route'

/** The plan index of item `i` of a set. */
export function overviewPlanOf(ov: OverviewData, set: OverviewSet, i: number): number {
  if (set === 'activity') return ov.activities.plan[i]
  if (set === 'arc') return ov.arcs.plan[i]
  return ov.routes.plan[i]
}

/**
 * What the tooltip shows for item `i` of a set, in the plan table's row shape (the overview
 * keeps only the plan's identity, the leg mode or simple activity type, and the times).
 */
export function overviewHoverRow(ov: OverviewData, set: OverviewSet, i: number): HoverRow {
  const plan = overviewPlanOf(ov, set, i)
  const { kind, times } = set === 'activity' ? ov.activities : set === 'arc' ? ov.arcs : ov.routes
  const t1 = times[2 * i + 1]
  const isLeg = set !== 'activity'
  return {
    person_id: ov.plans.person[plan],
    plan_num: ov.plans.planNum[plan],
    plan_selected: 'yes',
    element: isLeg ? 'leg' : 'activity',
    leg_mode: isLeg ? ov.kinds[kind[i]] : undefined,
    activity_type: isLeg ? undefined : ov.kinds[kind[i]],
    time_start: times[2 * i],
    time_end: t1 >= OPEN_END ? null : t1,
  }
}

/** The plan index of "person/plan", or -1 if the overview doesn't have that plan. */
export function overviewPlanIndex(ov: OverviewData, person: string, planNum: number): number {
  const { person: persons, planNum: nums, count } = ov.plans
  for (let p = 0; p < count; p++) if (persons[p] === person && nums[p] === planNum) return p
  return -1
}

/** Everything one plan draws, as plain objects (a handful of them), for its own layers. */
export type LonLat = [number, number]
export interface PlanGeometry {
  activities: { index: number; position: LonLat; kind: string; t0: number; t1: number }[]
  arcs: { index: number; start: LonLat; end: LonLat; kind: string; t0: number; t1: number }[]
  routes: { index: number; points: LonLat[]; kind: string; t0: number; t1: number }[]
}

/** One plan's activities, arcs and routes (road paths drawn like buildRoutePaths does). */
export function overviewPlanGeometry(ov: OverviewData, plan: number): PlanGeometry {
  const out: PlanGeometry = { activities: [], arcs: [], routes: [] }
  const { activities: a, arcs: c, routes: r, kinds, linkCoords: coords } = ov
  const time = (times: Float32Array, i: number) => ({ t0: times[2 * i], t1: times[2 * i + 1] })

  for (let i = 0; i < a.count; i++) {
    if (a.plan[i] !== plan) continue
    const position: LonLat = [a.positions[2 * i], a.positions[2 * i + 1]]
    out.activities.push({ index: i, position, kind: kinds[a.kind[i]], ...time(a.times, i) })
  }
  for (let i = 0; i < c.count; i++) {
    if (c.plan[i] !== plan) continue
    out.arcs.push({
      index: i,
      start: [c.source[2 * i], c.source[2 * i + 1]],
      end: [c.target[2 * i], c.target[2 * i + 1]],
      kind: kinds[c.kind[i]],
      ...time(c.times, i),
    })
  }
  for (let i = 0; i < r.count; i++) {
    if (r.plan[i] !== plan) continue
    const firstLink = r.links[r.linkStart[i]]
    const points: LonLat[] = [[coords[4 * firstLink], coords[4 * firstLink + 1]]]
    for (let k = r.linkStart[i]; k < r.linkStart[i + 1]; k++) {
      const link = r.links[k]
      const last = points[points.length - 1]
      if (coords[4 * link] !== last[0] || coords[4 * link + 1] !== last[1])
        points.push([coords[4 * link], coords[4 * link + 1]])
      points.push([coords[4 * link + 2], coords[4 * link + 3]])
    }
    out.routes.push({ index: i, points, kind: kinds[r.kind[i]], ...time(r.times, i) })
  }
  return out
}
