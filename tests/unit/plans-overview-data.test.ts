// Unit tests for src/plugins/plans/overviewData.ts: building the "show everyone" arrays from
// streamed plan rows, drawing legs the way the plan view does (road paths for link routes,
// link-midpoint arcs otherwise), and finding the routes under way at a time t.

import { describe, expect, it } from 'vitest'

import {
  OverviewBuilder,
  activeRoutes,
  arcsOfKinds,
  buildRoutePaths,
  linkLookup,
  type OverviewBatch,
} from '@/plugins/plans/overviewData'

const OPEN = 1e9

// links: id -> [x0, y0, x1, y1]; L1-L2-L3-L4 are connected end to end, L9 is elsewhere
const NETWORK = linkLookup({
  L1: [0, 0, 1, 0],
  L2: [1, 0, 2, 0],
  L3: [2, 0, 2, 1],
  L4: [2, 1, 3, 1],
  L9: [9, 9, 9, 8],
})

interface Row {
  leg?: boolean
  lon?: number
  lat?: number
  t0: number
  t1: number
  kind: string
  routeType?: string
  start?: string
  end?: string
  route?: string
}

function batch(rows: Row[]): OverviewBatch {
  return {
    numRows: rows.length,
    isLeg: rows.map(r => (r.leg ? 1 : 0)),
    lon: rows.map(r => r.lon ?? NaN),
    lat: rows.map(r => r.lat ?? NaN),
    t0: rows.map(r => r.t0),
    t1: rows.map(r => r.t1),
    kind: i => rows[i].kind,
    routeType: i => rows[i].routeType ?? '',
    startLink: i => rows[i].start ?? '',
    endLink: i => rows[i].end ?? '',
    routeText: i => rows[i].route ?? '',
  }
}

const ROWS: Row[] = [
  { lon: 0.5, lat: 0, t0: 0, t1: 100, kind: 'home' },
  { leg: true, t0: 100, t1: 110, kind: 'walk', routeType: 'generic', start: 'L1', end: 'L2' },
  { lon: 1.5, lat: 0, t0: 110, t1: 110, kind: 'car interaction' }, // zero-length: dropped
  { leg: true, t0: 110, t1: 210, kind: 'car', routeType: 'links', route: 'L2 L3 nope L4' },
  { lon: 2.5, lat: 1, t0: 210, t1: OPEN, kind: 'work' },
  { leg: true, t0: 50, t1: 60, kind: 'car', routeType: 'links', route: 'gone also-gone' },
  { leg: true, t0: 50, t1: 60, kind: 'walk', routeType: 'generic', start: 'nope', end: 'L1' },
  { lon: NaN, lat: NaN, t0: 0, t1: 50, kind: 'home' }, // no coordinates: dropped
]

describe('OverviewBuilder', () => {
  it('keeps activities, link-midpoint arcs and link routes, across batches', () => {
    const b = new OverviewBuilder(NETWORK)
    b.append(batch(ROWS.slice(0, 3)))
    b.append(batch(ROWS.slice(3)))
    const d = b.finish()
    expect(d.rowsRead).toBe(ROWS.length)

    expect(d.activities.count).toBe(2)
    expect(Array.from(d.activities.kind).map(k => d.kinds[k])).toEqual(['home', 'work'])
    expect(Array.from(d.activities.positions)).toEqual([0.5, 0, 2.5, 1])
    expect(Array.from(d.activities.times)).toEqual([0, 100, 210, OPEN])

    // walk: middle of L1 -> middle of L2; the leg with an unknown start link is dropped
    expect(d.arcs.count).toBe(1)
    expect(Array.from(d.arcs.source)).toEqual([0.5, 0])
    expect(Array.from(d.arcs.target)).toEqual([1.5, 0])
    expect(Array.from(d.arcs.times)).toEqual([100, 110])

    // car route: unknown link ids skipped; a route with no known link dropped
    const r = d.routes
    expect(r.count).toBe(1)
    expect(Array.from(r.links.subarray(r.linkStart[0], r.linkStart[1]))).toEqual([1, 2, 3])
    expect(d.kinds[r.kind[0]]).toBe('car')
    expect(Array.from(r.source)).toEqual([1, 0]) // from-node of the first link
    expect(Array.from(r.target)).toEqual([3, 1]) // to-node of the last link
    expect(Array.from(r.times)).toEqual([110, 210])

    // distinct unknown link ids: 'nope' (route and start link), 'gone', 'also-gone'
    expect(d.unknownLinks).toBe(3)
  })
})

describe('buildRoutePaths', () => {
  it('follows the links like the plan view, without repeating shared nodes', () => {
    const b = new OverviewBuilder(NETWORK)
    b.append(
      batch([
        { leg: true, t0: 0, t1: 10, kind: 'car', routeType: 'links', route: 'L1 L2 L3' },
        { leg: true, t0: 0, t1: 10, kind: 'bike', routeType: 'links', route: 'L4 L9' },
      ])
    )
    const r = b.finish().routes
    const colorOf = (k: number) => (k === r.kind[0] ? [1, 2, 3, 4] : [5, 6, 7, 8])
    const paths = buildRoutePaths(r, [0, 1], NETWORK.coords, colorOf)
    expect(paths.length).toBe(2)
    expect(Array.from(paths.startIndices.subarray(0, 3))).toEqual([0, 4, 8])
    const verts = Array.from(paths.positions.subarray(0, 16))
    // L1 L2 L3: (0,0) (1,0) (2,0) (2,1)
    expect(verts.slice(0, 8)).toEqual([0, 0, 1, 0, 2, 0, 2, 1])
    // L4 then L9 (not connected): (2,1) (3,1) then L9's from (9,9) and to (9,8)
    expect(verts.slice(8, 16)).toEqual([2, 1, 3, 1, 9, 9, 9, 8])
    expect(Array.from(paths.colors.subarray(0, 4))).toEqual([1, 2, 3, 4])
    expect(Array.from(paths.colors.subarray(28, 32))).toEqual([5, 6, 7, 8])

    // reuses big-enough buffers
    const again = buildRoutePaths(r, [1], NETWORK.coords, colorOf, paths)
    expect(again).toBe(paths)
    expect(again.length).toBe(1)
    expect(Array.from(again.positions.subarray(0, 8))).toEqual([2, 1, 3, 1, 9, 9, 9, 8])
  })
})

describe('activeRoutes', () => {
  it('matches a brute-force search, including long routes', () => {
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const rows: Row[] = []
    for (let i = 0; i < 3000; i++) {
      const t0 = Math.floor(rand() * 80000)
      const dur = rand() < 0.1 ? 3600 * (2 + 10 * rand()) : 60 + 3000 * rand()
      rows.push({ leg: true, t0, t1: t0 + Math.floor(dur), kind: 'car', routeType: 'links', route: 'L1 L2' })
    }
    const b = new OverviewBuilder(NETWORK)
    b.append(batch(rows))
    const r = b.finish().routes
    expect(r.count).toBe(3000)
    expect(r.count - r.shortCount).toBeGreaterThan(100) // long routes present

    for (let t = 0; t < 100000; t += 997) {
      const got = activeRoutes(r, t).sort((x, y) => x - y)
      const expected: number[] = []
      for (let k = 0; k < r.count; k++) if (r.times[2 * k] <= t && t < r.times[2 * k + 1]) expected.push(k)
      expect(got).toEqual(expected)
    }
  })
})

describe('arcsOfKinds', () => {
  it('keeps only the arcs of the wanted kinds', () => {
    const arcs = {
      count: 3,
      source: Float32Array.from([0, 0, 1, 1, 2, 2]),
      target: Float32Array.from([10, 10, 11, 11, 12, 12]),
      times: Float32Array.from([0, 5, 1, 6, 2, 7]),
      kind: Uint16Array.from([0, 1, 0]), // 0 = walk, 1 = pt
    }
    const noWalk = arcsOfKinds(arcs, k => k !== 0)
    expect(noWalk.count).toBe(1)
    expect(Array.from(noWalk.source)).toEqual([1, 1])
    expect(Array.from(noWalk.target)).toEqual([11, 11])
    expect(Array.from(noWalk.times)).toEqual([1, 6])
    expect(Array.from(noWalk.kind)).toEqual([1])
    expect(arcsOfKinds(arcs, () => true)).toBe(arcs) // nothing filtered: no copy
  })
})
