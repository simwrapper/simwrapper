/**
 * Slim per-route record that lives on the main thread. The heavy per-route data (link
 * lists, path geometry, stop lists) stays in typed arrays; see SupplyResult.
 */
export interface RouteDetails {
  id: string
  lineId: string
  firstDeparture: string
  lastDeparture: string
  transportMode: string
  uniqueRouteID: number
  gtfsRouteType?: number
  departures: number
  pax?: number
  cap?: number
  loadfac?: number
  /** rgb; only set for routes whose color was looked up (first route on some link) */
  color?: number[]
  currentColor?: number[]
}

export interface NetworkNode {
  x: number
  y: number
  name?: string
  id?: string
  linkRefId?: string
}

export interface TransitLine {
  id: string
  name?: string
  transitRoutes: RouteDetails[]
  gtfsRouteType: number
  check?: boolean
  show?: boolean
  isOpen?: boolean
}

export interface ColorRule {
  match: any
  color: string | number[]
  label: string
  hide?: boolean
}

/** The road-network columns the transit worker needs. All loaders in DashboardDataManager provide them. */
export interface NetworkColumns {
  linkId: string[]
  /** node-index columns + node coordinates (avro and WASM-XML networks) */
  from?: ArrayLike<number>
  to?: ArrayLike<number>
  nodeCoordinates?: ArrayLike<number>
  /** link-endpoint coordinates (every loader) */
  source?: ArrayLike<number>
  dest?: ArrayLike<number>
}

/**
 * Everything the main thread needs about the transit supply.
 * N = drawn links, R = routes, S = stops. "CSR" = offsets array (length+1) plus a flat array.
 */
export interface SupplyResult {
  projection: string
  linkIds: string[]
  /** x0,y0,x1,y1 per link, already offset 5 m to the right */
  linkCoords: Float64Array
  /** rgb per link */
  linkColor: Uint8Array
  linkDepartures: Float64Array
  /** CSR: routes using each link, in first-seen order */
  linkRouteOffsets: Uint32Array
  linkRouteIdx: Uint32Array

  /** index == uniqueRouteID */
  routes: RouteDetails[]
  /** CSR: link index per route link, -1 if that link is not drawn */
  routeLinkOffsets: Uint32Array
  routeLinkIdx: Int32Array
  /** CSR in points: x,y pairs of each route's path */
  routePathOffsets: Uint32Array
  routePath: Float64Array
  /** CSR: stop index per route-profile stop, -1 if unknown */
  routeStopOffsets: Uint32Array
  routeStopIdx: Int32Array

  stops: { id: string; name: string; linkRefId: string }[]
  stopCoords: Float64Array

  lines: { id: string; name: string; gtfsRouteType: number; routes: number[] }[]
  mapExtent: number[]
  usedLabels: string[]
  routeErrors: string[]
}

export interface DemandResult {
  /** per drawn link */
  linkPax: Float64Array
  linkCap: Float64Array
  linkLoadfac: Float64Array
  /** per stop (supply stop index) */
  stopHasDemand: Uint8Array
  stopBoard: Float64Array
  stopAlight: Float64Array
  /** CSR per stop into demandLineIds / stopLineB / stopLineA */
  stopLineOffsets: Uint32Array
  stopLineIdx: Uint32Array
  stopLineB: Float64Array
  stopLineA: Float64Array
  demandLineIds: string[]
}

/** per-route sums of the demand rows that matched a link filter */
export interface RouteDemand {
  routeIds: string[]
  pax: Float64Array
  cap: Float64Array
}

/**
 * Per-link render state, handed to the deck.gl layer as typed arrays. Lives outside Vue
 * reactivity (markRaw); `linkVersion` is bumped whenever any of it changes.
 */
export interface LinkRenderData {
  length: number
  /** x0,y0,x1,y1 per link */
  coords: Float64Array
  baseColors: Uint8Array
  colors: Uint8Array
  widths: Float64Array
  /** 0 = grayed out, 1 = normal, 5 = highlighted; also used as z for draw order */
  sort: Uint8Array
  departures: Float64Array
  pax?: Float64Array
  cap?: Float64Array
  loadfac?: Float64Array
}
