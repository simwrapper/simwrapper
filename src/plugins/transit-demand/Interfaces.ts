export interface RouteDetails {
  id: string
  departures: number
  firstDeparture: string
  lastDeparture: string
  geojson: any
  routeProfile: string[]
  route: string[]
  transportMode: string
  uniqueRouteID?: number
}

export interface Network {
  nodes: { [id: string]: NetworkNode }
  links: { [id: string]: NetworkLink }
}

export interface NetworkNode {
  x: number
  y: number
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
  transitRoutes: RouteDetails[]
}
