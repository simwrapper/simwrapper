import AsyncBackgroundWorker, { MethodCall, MethodResult } from '@/workers/AsyncBackgroundWorker'
import { InitParams, MethodNames } from './TransitSupplyHelperContract'
import { NetworkNode, TransitLine, RouteDetails } from './Interfaces'

import proj4 from 'proj4'
import EPSGdefinitions from 'epsg'

class TransitSupplyHelper extends AsyncBackgroundWorker {
  private params!: InitParams
  private projection!: string
  private _xml!: any
  private _network: any = { nodes: {}, links: {} }
  private _routeData: { [index: string]: RouteDetails } = {}
  private _stopFacilities: { [index: string]: NetworkNode } = {}
  private _transitLines: { [index: string]: TransitLine } = {}
  private _mapExtentXYXY = [180, 90, -180, -90]

  public handleInitialize(call: MethodCall) {
    this.params = call.parameters as InitParams
    this._xml = this.params.xml
    this.projection = this.params.projection

    this.addProj4Definitions()
  }

  public async handleMethodCall(call: MethodCall): Promise<MethodResult> {
    switch (call.method) {
      case MethodNames.CreateNodesAndLinks:
        return this.createNodesAndLinksFromXML()
      case MethodNames.ConvertCoordinates:
        return this.convertCoords()
      case MethodNames.ProcessTransit:
        return this.processTransit()
      default:
        throw new Error('No method with name ' + call.method)
    }
  }

  /** Add various projections that we use here */
  private addProj4Definitions() {
    for (const [key, epsg] of Object.entries(EPSGdefinitions) as any[]) {
      if (epsg) proj4.defs(key, epsg)
    }

    proj4.defs([
      [
        // south africa
        'EPSG:2048',
        '+proj=tmerc +lat_0=0 +lon_0=19 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      ],
      [
        // berlin
        'EPSG:31468',
        '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs',
      ],
      [
        // cottbus
        'EPSG:25833',
        '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs',
      ],
      [
        // avoev
        'EPSG:25832',
        '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      ],
    ])
  }

  // XML is sent in during worker initialization
  private createNodesAndLinksFromXML() {
    const roadXML = this._xml.roadXML
    const netNodes = roadXML.network.nodes.node
    const netLinks = roadXML.network.links.link

    for (const node of netNodes) {
      node.x = parseFloat(node.x)
      node.y = parseFloat(node.y)
      this._network.nodes[node.id] = node
    }

    for (const link of netLinks) {
      this._network.links[link.id] = link
    }
    return { data: {}, transferrables: [] }
  }

  private convertCoords() {
    for (const id in this._network.nodes) {
      if (this._network.nodes.hasOwnProperty(id)) {
        const node: NetworkNode = this._network.nodes[id]
        const z = proj4(this.projection, 'EPSG:4326', node) as any
        node.x = z.x
        node.y = z.y
      }
    }
    return { data: {}, transferrables: [] }
  }

  private async processTransit() {
    this.generateStopFacilitiesFromXML()

    let uniqueRouteID = 0

    const transitLines = this._xml.transitXML.transitSchedule.transitLine

    for (const line of transitLines) {
      const attr: TransitLine = {
        id: line.id,
        transitRoutes: [],
      }

      if (!line.transitRoute) continue

      for (const route of line.transitRoute) {
        const details: RouteDetails = this.buildTransitRouteDetails(line.id, route)
        details.uniqueRouteID = uniqueRouteID++
        attr.transitRoutes.push(details)
      }

      // attr.transitRoutes.sort((a, b) => (a.id < b.id ? -1 : 1))
      this._transitLines[attr.id] = attr
    }

    return {
      data: {
        network: this._network,
        routeData: this._routeData,
        stopFacilities: this._stopFacilities,
        transitLines: this._transitLines,
        mapExtent: this._mapExtentXYXY,
      },
      transferrables: [],
    }
  }

  private generateStopFacilitiesFromXML() {
    const stopFacilities = this._xml.transitXML.transitSchedule.transitStops.stopFacility

    for (const stop of stopFacilities) {
      stop.x = parseFloat(stop.x)
      stop.y = parseFloat(stop.y)
      // convert coords
      const z = proj4(this.projection, 'EPSG:4326', stop) as any
      stop.x = z.x
      stop.y = z.y

      this._stopFacilities[stop.id] = stop
    }
  }

  private buildTransitRouteDetails(lineId: string, route: any): RouteDetails {
    const allDepartures = route.departures.departure
    allDepartures.sort(function (a: any, b: any) {
      const timeA = a.departureTime
      const timeB = b.departureTime
      if (timeA < timeB) return -1
      if (timeA > timeB) return 1
      return 0
    })

    const routeDetails: RouteDetails = {
      id: `${lineId} (${route.id})`,
      transportMode: route.transportMode,
      routeProfile: [],
      route: [],
      departures: route.departures.departure.length,
      firstDeparture: allDepartures.departureTime,
      lastDeparture: allDepartures[allDepartures.length - 1].departureTime,
      geojson: '',
    }

    for (const stop of route.routeProfile.stop) {
      routeDetails.routeProfile.push(stop)
    }

    for (const link of route.route.link) {
      routeDetails.route.push(link.refId)
    }

    routeDetails.geojson = this.buildCoordinatesForRoute(routeDetails)
    this._routeData[routeDetails.id] = routeDetails

    return routeDetails
  }

  private buildCoordinatesForRoute(transitRoute: RouteDetails) {
    const coords = []
    let previousLink: boolean = false

    for (const linkID of transitRoute.route) {
      if (!previousLink) {
        const x0 = this._network.nodes[this._network.links[linkID].from].x
        const y0 = this._network.nodes[this._network.links[linkID].from].y
        coords.push([x0, y0])
      }
      const x = this._network.nodes[this._network.links[linkID].to].x
      const y = this._network.nodes[this._network.links[linkID].to].y
      coords.push([x, y])
      previousLink = true
    }

    // save the extent of this line so map can zoom in on startup
    if (coords.length > 0) {
      this.updateMapExtent(coords[0])
      this.updateMapExtent(coords[coords.length - 1])
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

  private updateMapExtent(coordinates: any) {
    this._mapExtentXYXY[0] = Math.min(this._mapExtentXYXY[0], coordinates[0])
    this._mapExtentXYXY[1] = Math.min(this._mapExtentXYXY[1], coordinates[1])
    this._mapExtentXYXY[2] = Math.max(this._mapExtentXYXY[2], coordinates[0])
    this._mapExtentXYXY[3] = Math.max(this._mapExtentXYXY[3], coordinates[1])
  }
}

// make the typescript compiler happy on import
export default null as any
