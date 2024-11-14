export interface RouteDetails {
  id: string
  lineId: string
  firstDeparture: string
  lastDeparture: string
  geojson: any
  routeProfile: any[]
  route: string[]
  transportMode: string
  uniqueRouteID?: number
  gtfsRouteType?: number
  departures: number
  pax?: number
  cap?: number
  loadfac?: number
  color?: string
  currentColor?: string
}

export interface Network {
  nodes: { [id: string]: NetworkNode }
  links: { [id: string]: NetworkLink }
}

export interface NetworkNode {
  x: number
  y: number
  name?: string
  id?: string
  linkRefId?: string
}

export interface NetworkInputs {
  roadXML: any
  transitXML: any
}

export interface NetworkLink {
  readonly from: string
  readonly to: string
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
