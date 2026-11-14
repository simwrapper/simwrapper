/**
 * Transit supply + demand processing for the transit viewer.
 *
 * Pure functions, no DOM or Vue: they run inside TransitTask.worker.ts and are unit-tested
 * directly. Results are typed arrays wherever the data is big, so the worker can hand
 * them to the main thread zero-copy.
 *
 * The semantics deliberately match the pre-worker implementation (which lived in
 * TransitDemand.vue and TransitSupplyHelper.worker.ts), quirks included -- e.g. a link's
 * color comes from the first route that uses it, and per-link demand matches link ids by
 * substring.
 */
import naturalSort from 'javascript-natural-sort'
import match from 'micromatch'
import * as turf from '@turf/turf'
import Papa from '@simwrapper/papaparse'

import Coords from '@/js/Coords'
import { colorToRGB, DEFAULT_ROUTE_COLORS } from './routeColors'
import type {
  ColorRule,
  DemandResult,
  NetworkColumns,
  RouteDemand,
  RouteDetails,
  SupplyResult,
} from './Interfaces'

export { DEFAULT_ROUTE_COLORS }

/** parseXML options for a transit schedule */
export const SCHEDULE_XML_OPTIONS = {
  attributeNamePrefix: '',
  alwaysArray: [
    'transitSchedule.transitLine.transitRoute',
    'transitSchedule.transitLine.transitRoute.departures.departure',
  ],
}

/**
 * naturalSort keeps its case mode in a global flag, and importing HTTPFileSystem flips it
 * to insensitive. Pin the mode per sort so results don't depend on what else got imported:
 * lines were always sorted case-sensitively (in the old helper worker), routes within a
 * line case-insensitively (on the main thread).
 */
function naturalCompare(a: string, b: string, insensitive: boolean) {
  const previous = (naturalSort as any).insensitive
  ;(naturalSort as any).insensitive = insensitive
  try {
    return naturalSort(a, b)
  } finally {
    ;(naturalSort as any).insensitive = previous
  }
}

const asArray = (x: any) => (x == null ? [] : Array.isArray(x) ? x : [x])

/** CRS from the schedule's own attributes, else the forced/fallback projection */
export function scheduleProjection(
  xml: any,
  forcedProjection: string | undefined,
  fallbackProjection: string
): string {
  if (forcedProjection) return forcedProjection
  try {
    let tCRS = xml?.transitSchedule?.attributes?.attribute
    // sometimes array, sometimes element.
    if (!tCRS.length) tCRS = [tCRS]
    tCRS = tCRS.filter((f: any) => f.name === 'coordinateReferenceSystem')
    if (tCRS.length) return tCRS[0]['#text']
  } catch {
    // no CRS in the schedule
  }
  return fallbackProjection
}

/** Growable typed array, so big CSR lists don't go through plain JS arrays */
class Grow<T extends Float64Array | Int32Array | Uint32Array> {
  public data: T
  public length = 0
  constructor(private Ctor: { new (n: number): T }, initial = 1024) {
    this.data = new Ctor(initial)
  }
  push(v: number) {
    if (this.length === this.data.length) {
      const bigger = new this.Ctor(this.data.length * 2)
      bigger.set(this.data as any)
      this.data = bigger
    }
    this.data[this.length++] = v
  }
  result(): T {
    return this.data.slice(0, this.length) as T
  }
}

// ---------------------------------------------------------------------------------------
// SUPPLY

interface RouteBuild {
  details: RouteDetails
  /** everything the color rules may match on */
  props: any
  linkIds: string[]
  stopRefIds: string[]
  path: number[]
}

export function buildSupply(props: {
  xml: any
  network: NetworkColumns
  projection: string
  colorRules: ColorRule[]
  onStatus?: (msg: string) => void
}): SupplyResult {
  const { xml, network, projection, colorRules } = props
  const status = props.onStatus || (() => {})

  // --- network lookups -----------------------------------------------------------------
  status('Parsing MATSim network...')

  const linkIndex: { [id: string]: number } = {}
  for (let i = 0; i < network.linkId.length; i++) linkIndex[network.linkId[i]] = i

  const hasNodes = !!(network.from && network.to && network.nodeCoordinates)
  const nc = network.nodeCoordinates as ArrayLike<number>

  // coords of a link's start/end; undefined if the link is unknown
  const fromXY = (i: number | undefined): [number, number] | undefined => {
    if (i === undefined) return undefined
    const x = hasNodes ? nc[2 * (network.from as any)[i]] : (network.source as any)[2 * i]
    const y = hasNodes ? nc[2 * (network.from as any)[i] + 1] : (network.source as any)[2 * i + 1]
    return x === undefined || y === undefined ? undefined : [x, y]
  }
  const toXY = (i: number | undefined): [number, number] | undefined => {
    if (i === undefined) return undefined
    const x = hasNodes ? nc[2 * (network.to as any)[i]] : (network.dest as any)[2 * i]
    const y = hasNodes ? nc[2 * (network.to as any)[i] + 1] : (network.dest as any)[2 * i + 1]
    return x === undefined || y === undefined ? undefined : [x, y]
  }

  // --- stops ---------------------------------------------------------------------------
  status('Building PT routes...')

  const stops: SupplyResult['stops'] = []
  const stopXY: number[] = []
  const stopIndex: { [id: string]: number } = {}
  const m = { x: 0, y: 0 }
  for (const stop of asArray(xml.transitSchedule.transitStops?.stopFacility)) {
    try {
      m.x = parseFloat(stop.x)
      m.y = parseFloat(stop.y)
      const longlat = Coords.toLngLat(projection, m)
      let i = stopIndex[stop.id]
      if (i === undefined) {
        i = stops.length
        stopIndex[stop.id] = i
      }
      stops[i] = { id: stop.id, name: stop.name || '', linkRefId: stop.linkRefId || '' }
      stopXY[2 * i] = longlat.x
      stopXY[2 * i + 1] = longlat.y
    } catch {
      console.warn('Stop has bad coords:', stop.id)
    }
  }

  // --- lines and routes ----------------------------------------------------------------
  const mapExtent = [180, 90, -180, -90]
  const updateMapExtent = (c: number[]) => {
    mapExtent[0] = Math.min(mapExtent[0], c[0])
    mapExtent[1] = Math.min(mapExtent[1], c[1])
    mapExtent[2] = Math.max(mapExtent[2], c[0])
    mapExtent[3] = Math.max(mapExtent[3], c[1])
  }

  const builds: RouteBuild[] = []
  // by route id; a duplicate id keeps the last route, as before
  const routeById: { [id: string]: RouteBuild } = {}
  const lineById: {
    [id: string]: { id: string; name: string; gtfsRouteType: any; routes: RouteBuild[] }
  } = {}
  const routeErrors: string[] = []
  let oneStopRoutes = 0

  for (const line of asArray(xml.transitSchedule.transitLine)) {
    // get the GTFS route type from the attributes
    const gtfsRoute =
      line.attributes?.attribute instanceof Array
        ? (line.attributes.attribute as any[]).find(a => a.name === 'gtfs_route_type')?.['#text'] ??
          -1
        : -1

    const lineEntry = {
      id: line.id,
      name: line.name || '',
      gtfsRouteType: gtfsRoute,
      routes: [] as RouteBuild[],
    }

    if (!line.transitRoute) continue

    for (const route of line.transitRoute) {
      try {
        const allDepartures = route.departures.departure || [] // might be empty
        allDepartures.sort((a: any, b: any) => {
          if (a.departureTime < b.departureTime) return -1
          if (a.departureTime > b.departureTime) return 1
          return 0
        })

        const details: RouteDetails = {
          id: route.id,
          lineId: line.id,
          transportMode: route.transportMode,
          departures: allDepartures.length,
          firstDeparture: allDepartures.length ? allDepartures[0].departureTime : '',
          lastDeparture: allDepartures.length
            ? allDepartures[allDepartures.length - 1].departureTime
            : '',
          gtfsRouteType: gtfsRoute,
          uniqueRouteID: -1,
        }

        let stopRefIds: string[]
        if (Array.isArray(route.routeProfile.stop)) {
          stopRefIds = route.routeProfile.stop.map((s: any) => s.refId)
        } else {
          oneStopRoutes++
          stopRefIds = [route.routeProfile.stop.refId]
        }

        const linkIds: string[] = []
        for (const link of route.route.link) linkIds.push(link.refId)

        // path: start of first link, then the end of every link
        const path: number[] = []
        const start = fromXY(linkIndex[linkIds[0]])
        if (start) path.push(start[0], start[1])
        for (const id of linkIds) {
          const end = toXY(linkIndex[id])
          if (end) path.push(end[0], end[1])
        }
        if (path.length) {
          updateMapExtent([path[0], path[1]])
          updateMapExtent([path[path.length - 2], path[path.length - 1]])
        }

        details.uniqueRouteID = builds.length
        // the color rules see the same fields the old route object had
        const ruleProps = { ...details, routeProfile: stopRefIds, route: linkIds }

        const build: RouteBuild = { details, props: ruleProps, linkIds, stopRefIds, path }
        builds.push(build)
        routeById[details.id] = build
        lineEntry.routes.push(build)
      } catch (e) {
        console.warn('' + e)
        routeErrors.push(`Error:: ${route.id} :: cannot parse route. Network or coord mismatch?`)
      }
    }

    lineById[lineEntry.id] = lineEntry
  }
  if (oneStopRoutes) console.warn(`${oneStopRoutes} route(s) only have one stop`)

  const sortedLines = Object.values(lineById).sort((a, b) => naturalCompare(a.id, b.id, false))

  // --- departures per link --------------------------------------------------------------
  status('Processing departures...')

  // plain object on purpose: same key order as before (integer-like ids first)
  const departures: { [linkId: string]: { total: number; routes: Set<string> } } = {}
  for (const line of sortedLines) {
    line.routes.sort((a, b) => naturalCompare(a.details.id, b.details.id, true))
    for (const route of line.routes) {
      for (const linkID of route.linkIds) {
        if (!(linkID in departures)) departures[linkID] = { total: 0, routes: new Set() }
        departures[linkID].total += route.details.departures
        departures[linkID].routes.add(route.details.id)
      }
    }
  }

  // --- drawn links ---------------------------------------------------------------------
  status('Summarizing departures...')

  const usedLabels: string[] = []
  let unmatched = 0

  const determineRouteColor = (id: string) => {
    let color: any = '#888'
    let hideThisLine = false
    const build = routeById[id]
    const rprops = build.props

    // first rule whose match conditions all match decides the color
    for (const config of colorRules) {
      hideThisLine = !!config.hide
      let matched = true

      // be nice to user: match can be a list or an object
      let matchRules = config.match
      try {
        if (Array.isArray(matchRules)) {
          const newRules = {} as any
          for (const row of matchRules) {
            const [key, value] = Object.entries(row)[0]
            newRules[key] = value
          }
          matchRules = newRules
        }
      } catch {
        console.warn('Match rules malformed', matchRules)
      }

      for (const [key, pattern] of Object.entries(matchRules) as any[]) {
        const value = rprops[key]
        if (!value) {
          matched = false
          break
        }
        // gtfsRouteType is an integer or integer array; micromatch doesn't handle those
        if (key === 'gtfsRouteType') {
          if (Array.isArray(pattern) ? !pattern.includes(value) : value !== pattern) {
            matched = false
            break
          }
        } else if (!match.isMatch(value, pattern)) {
          matched = false
          break
        }
      }

      if (matched) {
        color = config.color
        if (!usedLabels.includes(config.label) && !hideThisLine) usedLabels.push(config.label)
        break
      }
    }
    if (color == '#888') unmatched++

    const rgb = Array.isArray(color) ? color : colorToRGB(color)
    // side effect, as before: the route remembers the color it was given
    build.details.color = rgb
    rprops.color = rgb
    return { rgb, hideThisLine }
  }

  const linkIds: string[] = []
  const coords = new Grow(Float64Array, 4 * 4096)
  const colors: number[] = []
  const linkDeps: number[] = []
  const linkRouteOffsets = new Grow(Uint32Array, 4096)
  const linkRouteIdx = new Grow(Uint32Array, 4096)
  linkRouteOffsets.push(0)
  const drawnIndex: { [linkId: string]: number } = {}

  for (const linkID in departures) {
    const li = linkIndex[linkID]
    if (li == undefined) continue

    const a = fromXY(li)
    const b = toXY(li)
    const routes = [...departures[linkID].routes]
    const { rgb, hideThisLine } = determineRouteColor(routes[0])
    if (hideThisLine) continue

    let line = [
      [a ? a[0] : undefined, a ? a[1] : undefined],
      [b ? b[0] : undefined, b ? b[1] : undefined],
    ]
    try {
      const feature = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line },
        properties: {},
      }
      const offset = turf.lineOffset(feature as any, 5, { units: 'meters' })
      line = offset.geometry.coordinates as any
    } catch {
      // offset fails if points are exactly on top of each other; ignore.
    }

    drawnIndex[linkID] = linkIds.length
    linkIds.push(linkID)
    coords.push(line[0][0] as number)
    coords.push(line[0][1] as number)
    coords.push(line[1][0] as number)
    coords.push(line[1][1] as number)
    colors.push(rgb[0], rgb[1], rgb[2])
    linkDeps.push(departures[linkID].total)
    for (const id of routes) linkRouteIdx.push(routeById[id].details.uniqueRouteID)
    linkRouteOffsets.push(linkRouteIdx.length)
  }
  if (unmatched) console.log(`transit: ${unmatched} links matched no color rule`)

  if (!linkIds.length) throw Error('No links found. Does the network contain PT links?')

  // --- per-route CSRs ------------------------------------------------------------------
  const routeLinkOffsets = new Uint32Array(builds.length + 1)
  const routeLinkIdx = new Grow(Int32Array, 4096)
  const routePathOffsets = new Uint32Array(builds.length + 1)
  const routePath = new Grow(Float64Array, 4096)
  const routeStopOffsets = new Uint32Array(builds.length + 1)
  const routeStopIdx = new Grow(Int32Array, 4096)

  builds.forEach((b, r) => {
    for (const id of b.linkIds) {
      const d = drawnIndex[id]
      routeLinkIdx.push(d === undefined ? -1 : d)
    }
    routeLinkOffsets[r + 1] = routeLinkIdx.length
    for (const v of b.path) routePath.push(v)
    routePathOffsets[r + 1] = routePath.length / 2
    for (const id of b.stopRefIds) {
      const s = stopIndex[id]
      routeStopIdx.push(s === undefined ? -1 : s)
    }
    routeStopOffsets[r + 1] = routeStopIdx.length
  })

  return {
    projection,
    linkIds,
    linkCoords: coords.result(),
    linkColor: new Uint8Array(colors),
    linkDepartures: new Float64Array(linkDeps),
    linkRouteOffsets: linkRouteOffsets.result(),
    linkRouteIdx: linkRouteIdx.result(),
    routes: builds.map(b => b.details),
    routeLinkOffsets,
    routeLinkIdx: routeLinkIdx.result(),
    routePathOffsets,
    routePath: routePath.result(),
    routeStopOffsets,
    routeStopIdx: routeStopIdx.result(),
    stops,
    stopCoords: new Float64Array(stopXY),
    lines: sortedLines.map(l => ({
      id: l.id,
      name: l.name,
      gtfsRouteType: l.gtfsRouteType,
      routes: l.routes.map(r => r.details.uniqueRouteID),
    })),
    mapExtent,
    usedLabels,
    routeErrors,
  }
}

/** every typed-array buffer in a result, for Comlink.transfer */
export function transferables(result: object): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const v of Object.values(result)) {
    if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) buffers.add(v.buffer)
  }
  return [...buffers]
}

// ---------------------------------------------------------------------------------------
// DEMAND (pt_pax_volumes / ptStop2stop CSV)

const DEMAND_COLUMNS = [
  'transitLine',
  'transitRoute',
  'stop',
  'linkIdsSincePreviousStop',
  'passengersAlighting',
  'passengersAtArrival',
  'passengersBoarding',
  'totalVehicleCapacity',
] as const

/**
 * Aggregates demand rows chunk by chunk, keeping only compact per-row columns
 * (for per-link queries) and running per-stop / per-link sums.
 */
export class DemandAccumulator {
  private col: { [name: string]: number } | null = null

  private stopLevel: {
    [stopId: string]: {
      b: number
      a: number
      ptLines: { [line: string]: { b: number; a: number } }
    }
  } = {}
  private linkPax: { [linkId: string]: number } = {}
  private linkCap: { [linkId: string]: number } = {}

  // per-row columns
  private uniqueLinkStrings: string[] = []
  private linkStringIndex = new Map<string, number>()
  private demandRouteIds: string[] = []
  private demandRouteIndex = new Map<string, number>()
  private rowStr = new Grow(Int32Array, 1 << 16)
  private rowRoute = new Grow(Int32Array, 1 << 16)
  private rowPax = new Grow(Float64Array, 1 << 16)
  private rowCap = new Grow(Float64Array, 1 << 16)

  private allLinksCache: RouteDemand | null = null

  get rowCount() {
    return this.rowStr.length
  }

  /** rows as parsed by Papa with header:false; the first row ever seen is the header */
  addRows(rows: string[][]) {
    if (!rows.length) return
    let start = 0
    if (!this.col) {
      const header = rows[0]
      this.col = {}
      for (const name of DEMAND_COLUMNS) this.col[name] = header.indexOf(name)
      start = 1
    }
    const c = this.col
    const cLine = c.transitLine
    const cRoute = c.transitRoute
    const cStop = c.stop
    const cLinks = c.linkIdsSincePreviousStop
    const cAlight = c.passengersAlighting
    const cPax = c.passengersAtArrival
    const cBoard = c.passengersBoarding
    const cCap = c.totalVehicleCapacity

    // link IDs are split using what character? They changed the format again :-O
    let splitter = ','
    if (rows.length > start) splitter = (rows[start][cLinks] || '').indexOf(',') > -1 ? ',' : ';'

    for (let r = start; r < rows.length; r++) {
      const row = rows[r]
      const alight = parseFloat(row[cAlight])
      const board = parseFloat(row[cBoard])
      const pax = parseFloat(row[cPax])
      const cap = parseFloat(row[cCap])
      const stopId = row[cStop]
      const lineId = row[cLine]
      const routeId = row[cRoute]
      const links = row[cLinks]

      // stop-level boardings/alightings, total and per pt-line
      let stop = this.stopLevel[stopId]
      if (!stop) stop = this.stopLevel[stopId] = { b: 0, a: 0, ptLines: {} }
      stop.b += board
      stop.a += alight
      let pl = stop.ptLines[lineId]
      if (!pl) pl = stop.ptLines[lineId] = { b: 0, a: 0 }
      pl.a += alight
      pl.b += board

      // link-level passengers and capacity
      if (links) {
        for (const linkId of links.split(splitter)) {
          if (!this.linkPax[linkId]) this.linkPax[linkId] = 0
          this.linkPax[linkId] += pax
          if (!this.linkCap[linkId]) this.linkCap[linkId] = 0
          this.linkCap[linkId] += cap
        }
      }

      // compact row for per-link route queries
      const linkStr = links ?? ''
      let si = this.linkStringIndex.get(linkStr)
      if (si === undefined) {
        si = this.uniqueLinkStrings.length
        this.uniqueLinkStrings.push(linkStr)
        this.linkStringIndex.set(linkStr, si)
      }
      let ri = this.demandRouteIndex.get(routeId)
      if (ri === undefined) {
        ri = this.demandRouteIds.length
        this.demandRouteIds.push(routeId)
        this.demandRouteIndex.set(routeId, ri)
      }
      this.rowStr.push(si)
      this.rowRoute.push(ri)
      this.rowPax.push(pax)
      this.rowCap.push(cap)
    }
    this.allLinksCache = null
  }

  /** map the sums onto the supply's drawn links and stops */
  finish(linkIds: string[], stopIds: string[]): DemandResult {
    const n = linkIds.length
    const linkPax = new Float64Array(n)
    const linkCap = new Float64Array(n)
    const linkLoadfac = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const pax = this.linkPax[linkIds[i]] || 0
      const cap = this.linkCap[linkIds[i]] || 0
      linkPax[i] = pax
      linkCap[i] = cap
      linkLoadfac[i] = Math.round((1000 * pax) / cap) / 1000
    }

    const s = stopIds.length
    const stopHasDemand = new Uint8Array(s)
    const stopBoard = new Float64Array(s)
    const stopAlight = new Float64Array(s)
    const stopLineOffsets = new Uint32Array(s + 1)
    const stopLineIdx: number[] = []
    const stopLineB: number[] = []
    const stopLineA: number[] = []
    const demandLineIds: string[] = []
    const demandLineIndex = new Map<string, number>()

    for (let i = 0; i < s; i++) {
      const d = this.stopLevel[stopIds[i]]
      if (d) {
        stopHasDemand[i] = 1
        stopBoard[i] = d.b
        stopAlight[i] = d.a
        for (const [lineId, v] of Object.entries(d.ptLines)) {
          let li = demandLineIndex.get(lineId)
          if (li === undefined) {
            li = demandLineIds.length
            demandLineIds.push(lineId)
            demandLineIndex.set(lineId, li)
          }
          stopLineIdx.push(li)
          stopLineB.push(v.b)
          stopLineA.push(v.a)
        }
      }
      stopLineOffsets[i + 1] = stopLineIdx.length
    }

    // the per-stop and per-link maps aren't needed any more
    this.stopLevel = {}
    this.linkPax = {}
    this.linkCap = {}

    return {
      linkPax,
      linkCap,
      linkLoadfac,
      stopHasDemand,
      stopBoard,
      stopAlight,
      stopLineOffsets,
      stopLineIdx: new Uint32Array(stopLineIdx),
      stopLineB: new Float64Array(stopLineB),
      stopLineA: new Float64Array(stopLineA),
      demandLineIds,
    }
  }

  /**
   * Per-route passengers and capacity over the rows whose linkIdsSincePreviousStop
   * *contains* linkId as a substring (the old crossfilter behavior); '' matches every row.
   */
  routeDemandForLink(linkId: string): RouteDemand {
    if (!linkId && this.allLinksCache) return this.allLinksCache

    const strings = this.uniqueLinkStrings
    const hit = new Uint8Array(strings.length)
    for (let i = 0; i < strings.length; i++) hit[i] = strings[i].indexOf(linkId) > -1 ? 1 : 0

    const numRoutes = this.demandRouteIds.length
    const pax = new Float64Array(numRoutes)
    const cap = new Float64Array(numRoutes)
    const seen = new Uint8Array(numRoutes)
    const rowStr = this.rowStr.data
    const rowRoute = this.rowRoute.data
    const rowPax = this.rowPax.data
    const rowCap = this.rowCap.data
    for (let r = 0; r < this.rowStr.length; r++) {
      if (!hit[rowStr[r]]) continue
      const ri = rowRoute[r]
      seen[ri] = 1
      pax[ri] += rowPax[r]
      cap[ri] += rowCap[r]
    }

    const routeIds: string[] = []
    const outPax: number[] = []
    const outCap: number[] = []
    for (let i = 0; i < numRoutes; i++) {
      if (!seen[i]) continue
      routeIds.push(this.demandRouteIds[i])
      outPax.push(pax[i])
      outCap.push(cap[i])
    }
    const result = { routeIds, pax: new Float64Array(outPax), cap: new Float64Array(outCap) }
    if (!linkId) this.allLinksCache = result
    return result
  }
}

/**
 * Parse a whole demand CSV (already decompressed) in newline-aligned chunks, so neither
 * TextDecoder nor Papa ever sees one giant string. Row objects never outlive their chunk.
 */
export function parseDemandCsv(
  bytes: Uint8Array,
  acc: DemandAccumulator,
  chunkSize = 32 * 1024 * 1024
) {
  const decoder = new TextDecoder('utf-8')
  let offset = 0
  while (offset < bytes.length) {
    let end = Math.min(offset + chunkSize, bytes.length)
    if (end < bytes.length) {
      // break after the last \n in this window
      let nl = end - 1
      while (nl > offset && bytes[nl] !== 10) nl--
      if (bytes[nl] !== 10) {
        // a line longer than the window: extend to its end instead
        nl = end
        while (nl < bytes.length && bytes[nl] !== 10) nl++
      }
      end = Math.min(nl + 1, bytes.length)
    }
    const text = decoder.decode(bytes.subarray(offset, end))
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: true, dynamicTyping: false })
    acc.addRows(parsed.data as string[][])
    offset = end
  }
}
