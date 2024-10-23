import { NetworkNode, TransitLine, RouteDetails } from './Interfaces'

import Coords from '@/js/Coords'

let params!: any
let projection!: string
let _xml!: any
let _avro: boolean = false

const _network: any = { nodes: {}, links: {} }
const _routeData: { [index: string]: RouteDetails } = {}
const _stopFacilities: { [index: string]: NetworkNode } = {}
const _transitLines: { [index: string]: TransitLine } = {}
const _mapExtentXYXY = [180, 90, -180, -90]

// -----------------------------------------------------------
onmessage = function (e) {
  params = e.data
  _xml = params.xml
  projection = params.projection

  // if __numNodes is on the element, this is an avro network
  // TODO: add an avro version/identifier to avro networks!
  _avro = !!_xml?.roadXML?.__numNodes

  try {
    if (_avro) {
      avroCreateNodesAndLinksFromXML()
    } else {
      createNodesAndLinksFromXML()
      convertCoords()
    }
    const answer = processTransit()
    postMessage(answer)
  } catch (e) {
    console.error('' + e)
    postMessage({ error: e })
  }
}
// -----------------------------------------------------------

// XML is sent in during worker initialization
function avroCreateNodesAndLinksFromXML() {
  postMessage({ status: 'Parsing road network...' })

  _network.nodes = _xml.roadXML.__nodes
  const numLinks = _xml.roadXML.__numLinks

  // build lookup: {linkID: index}
  for (let i = 0; i < numLinks; i++) {
    const id = _xml.roadXML.id[i]
    _network.links[id] = i
  }
  return { data: {}, transferrables: [] }
}

// XML is sent in during worker initialization
function createNodesAndLinksFromXML() {
  postMessage({ status: 'Parsing road network...' })

  const roadXML = _xml.roadXML
  const netNodes = roadXML.network.nodes.node
  const netLinks = roadXML.network.links.link

  for (const node of netNodes) {
    node.x = parseFloat(node.x)
    node.y = parseFloat(node.y)
    _network.nodes[node.id] = node
  }

  for (const link of netLinks) {
    _network.links[link.id] = link
  }
  return { data: {}, transferrables: [] }
}

function convertCoords() {
  postMessage({ status: 'Converting coordinates...' })

  for (const id in _network.nodes) {
    if (_network.nodes.hasOwnProperty(id)) {
      const node: NetworkNode = _network.nodes[id]
      const z = Coords.toLngLat(projection, node)
      node.x = z.x
      node.y = z.y
    }
  }
  return { data: {}, transferrables: [] }
}

function processTransit() {
  postMessage({ status: 'Analyzing route database...' })

  generateStopFacilitiesFromXML()
  let uniqueRouteID = 0

  const transitLines = _xml.transitXML.transitSchedule.transitLine

  for (const line of transitLines) {
    // get the GTFS route type from the attributes
    const gtfsRoute =
      line.attributes?.attribute instanceof Array
        ? (line.attributes.attribute as any[]).find(
            attribute => attribute.name === 'gtfs_route_type'
          )?.['#text'] ?? -1
        : -1

    const attr: TransitLine = {
      id: line.id,
      transitRoutes: [],
      gtfsRouteType: gtfsRoute,
    }

    if (!line.transitRoute) continue

    for (const route of line.transitRoute) {
      try {
        const details: RouteDetails = buildTransitRouteDetails(line.id, route, gtfsRoute)
        details.uniqueRouteID = uniqueRouteID++
        attr.transitRoutes.push(details)
      } catch (e) {
        console.warn('' + e)
        postMessage({
          error: `Error:: ${route.id} :: cannot parse route. Network or coord mismatch?`,
        })
      }
    }

    // attr.transitRoutes.sort((a, b) => (a.id < b.id ? -1 : 1))
    _transitLines[attr.id] = attr
  }

  return {
    network: _network,
    routeData: _routeData,
    stopFacilities: _stopFacilities,
    transitLines: _transitLines,
    mapExtent: _mapExtentXYXY,
  }
}

function generateStopFacilitiesFromXML() {
  const stopFacilities = _xml.transitXML.transitSchedule.transitStops.stopFacility

  const m = { x: 0, y: 0 }
  for (const stop of stopFacilities) {
    try {
      m.x = parseFloat(stop.x)
      m.y = parseFloat(stop.y)
      const longlat = Coords.toLngLat(projection, m)
      stop.x = longlat.x
      stop.y = longlat.y
      _stopFacilities[stop.id] = stop
    } catch (e) {
      console.warn('Stop has bad coords:', stop.id)
    }
  }
}

function buildTransitRouteDetails(lineId: string, route: any, gtfsRoute: number): RouteDetails {
  const allDepartures = route.departures.departure || [] // might be empty
  allDepartures.sort(function (a: any, b: any) {
    const timeA = a.departureTime
    const timeB = b.departureTime
    if (timeA < timeB) return -1
    if (timeA > timeB) return 1
    return 0
  })

  const niceId = lineId == route.id ? lineId : `${lineId} (${route.id})`
  const routeDetails: RouteDetails = {
    id: niceId,
    transportMode: route.transportMode,
    routeProfile: [],
    route: [],
    departures: allDepartures.length,
    firstDeparture: allDepartures.length ? allDepartures[0].departureTime : '',
    lastDeparture: allDepartures.length
      ? allDepartures[allDepartures.length - 1].departureTime
      : '',
    geojson: '',
    gtfsRouteType: gtfsRoute,
  }

  if (Array.isArray(route.routeProfile.stop)) {
    for (const stop of route.routeProfile.stop) {
      routeDetails.routeProfile.push(stop)
    }
  } else {
    console.warn('Route only has one stop: ', route)
    routeDetails.routeProfile.push(route.routeProfile.stop)
  }

  for (const link of route.route.link) {
    routeDetails.route.push(link.refId)
  }

  routeDetails.geojson = buildCoordinatesForRoute(routeDetails)
  _routeData[routeDetails.id] = routeDetails

  return routeDetails
}

function buildCoordinatesForRoute(transitRoute: RouteDetails) {
  const coords = []
  let previousLink: boolean = false

  if (_avro) {
    for (const linkID of transitRoute.route) {
      const linkIndex = _network.links[linkID]

      const nodeFrom = _xml.roadXML.from[linkIndex]
      const nodeTo = _xml.roadXML.to[linkIndex]

      if (!previousLink) {
        const x0 = _network.nodes[nodeFrom][0]
        const y0 = _network.nodes[nodeFrom][1]
        if (x0 !== undefined && y0 !== undefined) coords.push([x0, y0])
      }
      const x = _network.nodes[nodeTo][0]
      const y = _network.nodes[nodeTo][1]
      if (x !== undefined && y !== undefined) coords.push([x, y])
      previousLink = true
    }
  } else {
    for (const linkID of transitRoute.route) {
      const networkLink = _network.links[linkID]
      if (!previousLink) {
        const x0 = _network.nodes[networkLink?.from]?.x
        const y0 = _network.nodes[networkLink?.from]?.y
        if (x0 !== undefined && y0 !== undefined) coords.push([x0, y0])
      }
      const x = _network.nodes[networkLink?.to]?.x
      const y = _network.nodes[networkLink?.to]?.y
      if (x !== undefined && y !== undefined) coords.push([x, y])
      previousLink = true
    }
  }

  // save the extent of this line so map can zoom in on startup
  if (coords.length > 0) {
    updateMapExtent(coords[0])
    updateMapExtent(coords[coords.length - 1])
  }

  const geojson = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    properties: {
      id: transitRoute.id,
      from: coords[0],
      to: coords[coords.length - 1],
    },
  }
  return geojson
}

function updateMapExtent(coordinates: any) {
  _mapExtentXYXY[0] = Math.min(_mapExtentXYXY[0], coordinates[0])
  _mapExtentXYXY[1] = Math.min(_mapExtentXYXY[1], coordinates[1])
  _mapExtentXYXY[2] = Math.max(_mapExtentXYXY[2], coordinates[0])
  _mapExtentXYXY[3] = Math.max(_mapExtentXYXY[3], coordinates[1])
}

// make the typescript compiler happy on import
// export default null as any
