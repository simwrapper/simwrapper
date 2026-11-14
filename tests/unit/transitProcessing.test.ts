import { describe, it, expect } from 'vitest'

import {
  buildSupply,
  DemandAccumulator,
  DEFAULT_ROUTE_COLORS,
  parseDemandCsv,
  scheduleProjection,
} from '@/plugins/transit-demand/transitProcessing'

/**
 * A tiny network already in lng/lat (EPSG:4326 so no reprojection):
 *   n0 --L1--> n1 --L2--> n2 --L3--> n3     and an unused link L9
 */
const network = {
  linkId: ['L1', 'L2', 'L3', 'L9'],
  from: new Float32Array([0, 1, 2, 3]),
  to: new Float32Array([1, 2, 3, 0]),
  nodeCoordinates: new Float64Array([13.0, 52.0, 13.01, 52.0, 13.02, 52.0, 13.03, 52.0]),
}

const stop = (id: string, x: number, y: number) => ({
  id,
  x: '' + x,
  y: '' + y,
  name: 'Stop ' + id,
  linkRefId: 'L' + id,
})

const route = (id: string, links: string[], stops: string[], deps: string[], mode = 'bus') => ({
  id,
  transportMode: mode,
  routeProfile: { stop: stops.map(refId => ({ refId })) },
  route: { link: links.map(refId => ({ refId })) },
  departures: { departure: deps.map(departureTime => ({ departureTime })) },
})

function schedule() {
  return {
    transitSchedule: {
      attributes: {
        attribute: [{ name: 'coordinateReferenceSystem', '#text': 'EPSG:4326' }],
      },
      transitStops: {
        stopFacility: [stop('A', 13.0, 52.0), stop('B', 13.01, 52.0), stop('C', 13.03, 52.0)],
      },
      transitLine: [
        {
          id: 'U2',
          transitRoute: [route('U2_b', ['L2', 'L3'], ['B', 'C'], ['08:00:00'], 'rail')],
        },
        {
          id: '10',
          transitRoute: [
            route('10_b', ['L1', 'L2'], ['A', 'B'], ['09:00:00', '07:00:00']),
            route('10_a', ['L1', 'L2', 'LX'], ['A', 'B', 'Z'], ['06:00:00']),
          ],
        },
        { id: 'empty' }, // no routes: skipped
      ],
    },
  }
}

const build = (rules = DEFAULT_ROUTE_COLORS) =>
  buildSupply({ xml: schedule(), network, projection: 'EPSG:4326', colorRules: rules })

describe('transit supply', () => {
  it('reads the schedule CRS, else falls back', () => {
    expect(scheduleProjection(schedule(), undefined, 'EPSG:1')).toBe('EPSG:4326')
    expect(scheduleProjection(schedule(), 'EPSG:2', 'EPSG:1')).toBe('EPSG:2')
    expect(scheduleProjection({ transitSchedule: {} }, undefined, 'EPSG:1')).toBe('EPSG:1')
  })

  it('builds routes, lines and departures per link', () => {
    const s = build()
    // lines natural-sorted, the empty line skipped, routes natural-sorted within a line
    expect(s.lines.map(l => l.id)).toEqual(['10', 'U2'])
    expect(s.lines[0].routes.map(i => s.routes[i].id)).toEqual(['10_a', '10_b'])

    const r = s.routes.find(r => r.id === '10_b')!
    expect(r.departures).toBe(2)
    expect(r.firstDeparture).toBe('07:00:00')
    expect(r.lastDeparture).toBe('09:00:00')

    // LX is not in the network: never drawn
    expect([...s.linkIds].sort()).toEqual(['L1', 'L2', 'L3'])
    const dep = (id: string) => s.linkDepartures[s.linkIds.indexOf(id)]
    expect(dep('L1')).toBe(3)
    expect(dep('L2')).toBe(4)
    expect(dep('L3')).toBe(1)
  })

  it('CSRs point at the right links, routes and stops', () => {
    const s = build()
    const i2 = s.linkIds.indexOf('L2')
    const routesOnL2 = [...s.linkRouteIdx.slice(s.linkRouteOffsets[i2], s.linkRouteOffsets[i2 + 1])]
    // first-seen order: line 10 (sorted routes) comes before U2
    expect(routesOnL2.map(i => s.routes[i].id)).toEqual(['10_a', '10_b', 'U2_b'])

    const ra = s.routes.findIndex(r => r.id === '10_a')
    const links = [...s.routeLinkIdx.slice(s.routeLinkOffsets[ra], s.routeLinkOffsets[ra + 1])]
    expect(links).toEqual([s.linkIds.indexOf('L1'), i2, -1])

    const stops = [...s.routeStopIdx.slice(s.routeStopOffsets[ra], s.routeStopOffsets[ra + 1])]
    expect(stops.map(i => (i < 0 ? null : s.stops[i].id))).toEqual(['A', 'B', null])

    // path: start of L1, end of L1, end of L2 (LX has no coords)
    const path = [...s.routePath.slice(2 * s.routePathOffsets[ra], 2 * s.routePathOffsets[ra + 1])]
    expect(path).toEqual([13.0, 52.0, 13.01, 52.0, 13.02, 52.0])
    expect(s.mapExtent[0]).toBeCloseTo(13.0)
    expect(s.mapExtent[2]).toBeCloseTo(13.03)
  })

  it('colors a link by its first route, and offsets it 5 m', () => {
    const s = build()
    const i3 = s.linkIds.indexOf('L3')
    // L3 is only used by U2 (rail, id U*) => U-Bahn blue #115D91
    expect([...s.linkColor.slice(3 * i3, 3 * i3 + 3)]).toEqual([0x11, 0x5d, 0x91])
    const i1 = s.linkIds.indexOf('L1')
    expect([...s.linkColor.slice(3 * i1, 3 * i1 + 3)]).toEqual([0x95, 0x27, 0x6e]) // bus
    expect(s.usedLabels).toEqual(['Bus', 'U-Bahn'])

    // east-going link offset to the right == south, by ~5 m (~4.5e-5 deg latitude)
    const y0 = s.linkCoords[4 * i1 + 1]
    expect(y0).toBeLessThan(52.0)
    expect(52.0 - y0).toBeCloseTo(5 / 111_195, 6)

    // only routes that were first on a link got a color
    expect(s.routes.find(r => r.id === '10_b')!.color).toBeUndefined()
    expect(s.routes.find(r => r.id === '10_a')!.color).toEqual([0x95, 0x27, 0x6e])
  })

  it('sorts lines case-sensitively and routes case-insensitively, whatever the global flag', async () => {
    const naturalSort: any = (await import('javascript-natural-sort')).default
    const xml = schedule()
    xml.transitSchedule.transitLine = [
      {
        id: '3a',
        transitRoute: [route('3a_x', ['L1'], ['A'], []), route('3a_W', ['L1'], ['A'], [])],
      },
      { id: '3N', transitRoute: [route('3N_1', ['L2'], ['B'], [])] },
    ] as any
    for (const flag of [false, true]) {
      naturalSort.insensitive = flag
      const s = buildSupply({
        xml,
        network,
        projection: 'EPSG:4326',
        colorRules: DEFAULT_ROUTE_COLORS,
      })
      expect(s.lines.map(l => l.id)).toEqual(['3N', '3a'])
      expect(s.lines[1].routes.map(i => s.routes[i].id)).toEqual(['3a_W', '3a_x'])
      expect(naturalSort.insensitive).toBe(flag)
    }
  })

  it('drops links whose color rule says hide', () => {
    const rules = [
      { match: { transportMode: 'bus' }, color: '#f00', label: 'Bus', hide: true },
      ...DEFAULT_ROUTE_COLORS,
    ]
    const s = build(rules)
    expect(s.linkIds).toEqual(['L3'])
    expect(s.usedLabels).toEqual(['U-Bahn'])
  })

  it('falls back to source/dest when the network has no node columns', () => {
    const s = buildSupply({
      xml: schedule(),
      network: {
        linkId: network.linkId,
        source: new Float32Array([13.0, 52.0, 13.01, 52.0, 13.02, 52.0, 13.03, 52.0]),
        dest: new Float32Array([13.01, 52.0, 13.02, 52.0, 13.03, 52.0, 13.0, 52.0]),
      },
      projection: 'EPSG:4326',
      colorRules: DEFAULT_ROUTE_COLORS,
    })
    expect([...s.linkIds].sort()).toEqual(['L1', 'L2', 'L3'])
  })
})

const CSV_HEADER =
  'transitLine,transitRoute,departure,stop,stopSequence,stopPrevious,arrivalTimeScheduled,arrivalDelay,departureTimeScheduled,departureDelay,passengersAtArrival,totalVehicleCapacity,passengersAlighting,passengersBoarding,linkIdsSincePreviousStop'

const csvRow = (
  line: string,
  route: string,
  stop: string,
  pax: number,
  cap: number,
  alight: number,
  board: number,
  links: string
) => `${line},${route},d1,${stop},0,,0,0,0,0,${pax},${cap},${alight},${board},${links}`

describe('transit demand', () => {
  const csv = [
    CSV_HEADER,
    csvRow('10', '10_a', 'A', 0, 100, 0, 5, 'L1'),
    csvRow('10', '10_a', 'B', 5, 100, 2, 1, 'L1;L2'),
    csvRow('U2', 'U2_b', 'B', 7, 200, 0, 7, 'L2'),
    csvRow('U2', 'U2_b', 'C', 7, 200, 7, 0, 'L2;L3'),
    '',
  ].join('\n')

  const load = (chunkSize?: number) => {
    const acc = new DemandAccumulator()
    parseDemandCsv(new TextEncoder().encode(csv), acc, chunkSize)
    return acc
  }

  it('sums link and stop demand', () => {
    const acc = load()
    const d = acc.finish(['L1', 'L2', 'L3'], ['A', 'B', 'C', 'D'])
    expect([...d.linkPax]).toEqual([5, 19, 7])
    expect([...d.linkCap]).toEqual([200, 500, 200])
    expect(d.linkLoadfac[1]).toBe(Math.round((1000 * 19) / 500) / 1000)

    expect([...d.stopHasDemand]).toEqual([1, 1, 1, 0])
    expect([...d.stopBoard]).toEqual([5, 8, 0, 0])
    expect([...d.stopAlight]).toEqual([0, 2, 7, 0])
    // stop B is served by both lines
    const b = 1
    const lines = [...d.stopLineIdx.slice(d.stopLineOffsets[b], d.stopLineOffsets[b + 1])]
    expect(lines.map(i => d.demandLineIds[i])).toEqual(['10', 'U2'])
  })

  it('gives the same answer however the file is chunked', () => {
    const a = load().finish(['L1', 'L2', 'L3'], ['A', 'B', 'C'])
    const b = load(40).finish(['L1', 'L2', 'L3'], ['A', 'B', 'C'])
    expect(b).toEqual(a)
  })

  it('per-link route demand matches link ids by substring, as before', () => {
    const acc = load()
    const all = acc.routeDemandForLink('')
    expect(all.routeIds).toEqual(['10_a', 'U2_b'])
    expect([...all.pax]).toEqual([5, 14])
    expect([...all.cap]).toEqual([200, 400])

    const l2 = acc.routeDemandForLink('L2')
    expect(l2.routeIds).toEqual(['10_a', 'U2_b'])
    expect([...l2.pax]).toEqual([5, 14])

    // "L" is a substring of every link string -- the quirk is kept on purpose
    expect(acc.routeDemandForLink('L').routeIds).toEqual(['10_a', 'U2_b'])
    expect(acc.routeDemandForLink('L3').routeIds).toEqual(['U2_b'])
    expect(acc.routeDemandForLink('nope').routeIds).toEqual([])
  })

  it('handles comma-separated link lists', () => {
    const acc = new DemandAccumulator()
    parseDemandCsv(
      new TextEncoder().encode(
        [CSV_HEADER, csvRow('10', '10_a', 'B', 4, 10, 0, 0, '"L1,L2"')].join('\n')
      ),
      acc
    )
    const d = acc.finish(['L1', 'L2'], ['B'])
    expect([...d.linkPax]).toEqual([4, 4])
  })
})
