<template lang="pug">
#container
  .status-blob(v-if="!thumbnail && loadingText"): p {{ loadingText }}

  left-data-panel.left-panel(v-if="routesOnLink.length > 0"
    title="Transit routes on selected link:")

    .dashboard-panel

      p.details.help-text(style="margin-top:20px" v-if="routesOnLink.length === 0") Select a link to see the routes traversing it.

      .route-list
        .route(v-for="route in routesOnLink"
            :key="route.uniqueRouteID"
            :class="{highlightedRoute: selectedRoute && route.id === selectedRoute.id}"
            @click="showRouteDetails(route.id)")
          h3.mytitle {{route.id}}
          p.details: b {{route.departures}} departures
          p.details First: {{route.firstDeparture}}
          p.details Last: {{route.lastDeparture}}

  .map-container(:class="{'hide-thumbnail': !thumbnail}")
    #mymap
      .stop-marker(v-for="stop in stopMarkers" :key="stop.i"
        v-bind:style="{transform: 'translate(-50%,-50%) rotate('+stop.bearing+'deg)', left: stop.xy.x + 'px', top: stop.xy.y+'px'}"
      )

  legend-box.legend(v-if="!thumbnail" :rows="legendRows")
</template>

<script lang="ts">
'use strict'

import * as turf from '@turf/turf'
import colormap from 'colormap'
import mapboxgl, { LngLatBoundsLike, LngLatLike } from 'mapbox-gl'
import nprogress from 'nprogress'
import xml2js from 'xml2js'
import yaml from 'yaml'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import LeftDataPanel from '@/components/LeftDataPanel.vue'

import { Network, NetworkInputs, NetworkNode, TransitLine, RouteDetails } from './Interfaces'
import XmlFetcher from '@/workers/XmlFetcher'
import TransitSupplyHelper from './TransitSupplyHelper'
import TransitSupplyHelperWorker from './TransitSupplyHelper.worker'
import LegendBox from './LegendBox.vue'

import { FileSystem, SVNProject, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import globalStore from '@/store'

const DEFAULT_PROJECTION = 'EPSG:31468' // 31468' // 2048'

const COLOR_CATEGORIES = 16
const SHOW_STOPS_AT_ZOOM_LEVEL = 11

class Departure {
  public total: number = 0
  public routes: Set<string> = new Set()
}

@Component({ components: { LeftDataPanel, LegendBox } })
class MyComponent extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private globalState = globalStore.state

  // -------------------------- //

  private vizDetails = {
    transitSchedule: '',
    network: '',
    projection: '',
    title: '',
    description: '',
  }

  private myState = {
    fileApi: this.fileApi,
    fileSystem: undefined as SVNProject | undefined,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
  }

  private loadingText: string = 'MATSim Transit Inspector'
  private mymap!: mapboxgl.Map
  private project: any = {}
  private projection: string = DEFAULT_PROJECTION
  private routesOnLink: any = []
  private selectedRoute: any = {}
  private stopMarkers: any[] = []

  private _attachedRouteLayers!: string[]
  private _departures!: { [linkID: string]: Departure }
  private _linkData!: any
  private _mapExtentXYXY!: any
  private _maximum!: number
  private _network!: Network
  private _routeData!: { [index: string]: RouteDetails }
  private _stopFacilities!: { [index: string]: NetworkNode }
  private _transitLines!: { [index: string]: TransitLine }
  private _roadFetcher!: XmlFetcher
  private _transitFetcher!: XmlFetcher
  private _transitHelper!: TransitSupplyHelper

  public created() {
    this._attachedRouteLayers = []
    this._departures = {}
    this._mapExtentXYXY = [180, 90, -180, -90]
    this._maximum = 0
    this._network = { nodes: {}, links: {} }
    this._routeData = {}
    this._stopFacilities = {}
    this._transitLines = {}
    this.selectedRoute = null
  }

  public destroyed() {
    globalStore.commit('setFullScreen', false)
  }

  @Watch('globalState.authAttempts') private async authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()
  }

  public beforeDestroy() {
    if (this._roadFetcher) this._roadFetcher.destroy()
    if (this._transitFetcher) this._transitFetcher.destroy()
    if (this._transitHelper) this._transitHelper.destroy()
  }

  public async mounted() {
    globalStore.commit('setFullScreen', !this.thumbnail)

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.generateBreadcrumbs()
    this.setupMap()
  }

  // this happens if viz is the full page, not a thumbnail on a project page
  private buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    const filesystem = this.getFileSystem(params.project)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config
  }

  private async generateBreadcrumbs() {
    if (!this.myState.fileSystem) return []

    const crumbs = [
      {
        label: this.myState.fileSystem.name,
        url: '/' + this.myState.fileSystem.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + this.myState.fileSystem.url + buildFolder,
      })
    }

    // get run title in there
    try {
      const metadata = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/metadata.yml'
      )
      const details = yaml.parse(metadata)

      if (details.title) {
        const lastElement = crumbs.pop()
        const url = lastElement ? lastElement.url : '/'
        crumbs.push({ label: details.title, url })
      }
    } catch (e) {
      // if something went wrong the UI will just show the folder name
      // which is fine
    }
    crumbs.push({
      label: this.vizDetails.title ? this.vizDetails.title : '',
      url: '#',
    })

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async getVizDetails() {
    // first get config
    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = yaml.parse(text)
    } catch (e) {
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.url)
      }
    }

    const t = this.vizDetails.title ? this.vizDetails.title : 'Transit Network'
    this.$emit('title', t)

    this.projection = this.vizDetails.projection

    nprogress.done()
  }

  private get legendRows() {
    return [
      ['#a03919', 'Rail'],
      ['#448', 'Bus'],
    ]
  }

  private isMobile() {
    const w = window
    const d = document
    const e = d.documentElement
    const g = d.getElementsByTagName('body')[0]
    const x = w.innerWidth || e.clientWidth || g.clientWidth
    const y = w.innerHeight || e.clientHeight || g.clientHeight

    return x < 640
  }

  private setupMap() {
    this.mymap = new mapboxgl.Map({
      bearing: 0,
      container: 'mymap',
      logoPosition: 'bottom-right',
      style: 'mapbox://styles/mapbox/dark-v9',
      pitch: 0,
    })

    try {
      const extent = localStorage.getItem(this.$route.fullPath + '-bounds')
      console.log({ extent })

      if (extent) {
        const lnglat = JSON.parse(extent)

        const mFac = this.isMobile() ? 0 : 1
        const padding = { top: 50 * mFac, bottom: 100 * mFac, right: 100 * mFac, left: 300 * mFac }

        if (this.thumbnail) {
          this.mymap.fitBounds(lnglat, {
            animate: false,
          })
        } else {
          this.mymap.fitBounds(lnglat, {
            // padding,
            animate: false,
          })
        }
      }
    } catch (E) {
      console.log({ E })
      // no worries
    }

    // Start doing stuff AFTER the MapBox library has fully initialized
    this.mymap.on('load', this.mapIsReady)

    this.mymap.on('move', this.handleMapMotion)
    this.mymap.on('zoom', this.handleMapMotion)
    this.mymap.on('click', this.handleEmptyClick)

    this.mymap.keyboard.disable() // so arrow keys don't pan

    this.mymap.addControl(new mapboxgl.NavigationControl(), 'top-right')
  }

  private handleMapMotion() {
    if (this.stopMarkers.length > 0) this.showTransitStops()
  }

  private handleEmptyClick(e: mapboxgl.MapMouseEvent) {
    this.removeStopMarkers()
    this.removeSelectedRoute()
    this.removeAttachedRoutes()
    this.routesOnLink = []
  }

  private showRouteDetails(routeID: string) {
    if (!routeID && !this.selectedRoute) return

    console.log({ routeID })

    if (routeID) this.showTransitRoute(routeID)
    else this.showTransitRoute(this.selectedRoute.id)

    this.showTransitStops()
  }

  private async mapIsReady() {
    const networks = await this.loadNetworks()
    if (networks) this.processInputs(networks)

    this.setupKeyListeners()
  }

  private setupKeyListeners() {
    const parent = this
    window.addEventListener('keyup', function(event) {
      if (event.keyCode === 27) {
        // ESC
        parent.pressedEscape()
      }
    })
    window.addEventListener('keydown', function(event) {
      if (event.keyCode === 38) {
        // UP
        parent.pressedArrowKey(-1)
      }
      if (event.keyCode === 40) {
        // DOWN
        parent.pressedArrowKey(+1)
      }
    })
  }

  private async loadNetworks() {
    try {
      console.log(this.vizDetails)
      if (!this.myState.fileSystem) return

      this.loadingText = 'Loading networks...'

      this._roadFetcher = await XmlFetcher.create({
        fileApi: this.myState.fileSystem.url,
        filePath: this.myState.subfolder + '/' + this.vizDetails.network,
      })
      this._transitFetcher = await XmlFetcher.create({
        fileApi: this.myState.fileSystem.url,
        filePath: this.myState.subfolder + '/' + this.vizDetails.transitSchedule,
      })

      // launch the long-running processes; these return promises
      const roadXMLPromise = this._roadFetcher.fetchXML()
      const transitXMLPromise = this._transitFetcher.fetchXML()

      // and wait for them to both complete
      const results = await Promise.all([roadXMLPromise, transitXMLPromise])

      this._roadFetcher.destroy()
      this._transitFetcher.destroy()

      return { roadXML: results[0], transitXML: results[1] }
    } catch (e) {
      console.error({ e })
      this.loadingText = '' + e
      return null
    }
  }

  private async processInputs(networks: NetworkInputs) {
    this.loadingText = 'Preparing...'
    // spawn transit helper web worker
    this._transitHelper = await TransitSupplyHelper.create({
      xml: networks,
      projection: this.projection,
    })

    this.loadingText = 'Crunching road network...'
    await this._transitHelper.createNodesAndLinks()

    this.loadingText = 'Converting coordinates...'
    await this._transitHelper.convertCoordinates()

    this.loadingText = 'Crunching transit network...'

    const result: any = await this._transitHelper.processTransit()
    this._network = result.network
    this._routeData = result.routeData
    this._stopFacilities = result.stopFacilities
    this._transitLines = result.transitLines
    this._mapExtentXYXY = result.mapExtent

    // await this.addLinksToMap() // --no links for now

    this.loadingText = 'Summarizing departures...'
    await this.processDepartures()

    const geodata = await this.constructDepartureFrequencyGeoJson()

    await this.addTransitToMap(geodata)

    localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))

    this.mymap.fitBounds(this._mapExtentXYXY, {
      padding: { top: 2, bottom: 2, right: 2, left: 2 },
      animate: false,
    })

    this.loadingText = ''
    nprogress.done()
  }

  private async addLinksToMap() {
    const linksAsGeojson = this.constructGeoJsonFromLinkData()

    this.mymap.addSource('link-data', {
      data: linksAsGeojson,
      type: 'geojson',
    } as any)

    this.mymap.addLayer({
      id: 'link-layer',
      source: 'link-data',
      type: 'line',
      paint: {
        'line-opacity': 1.0,
        'line-width': 3, // ['get', 'width'],
        'line-color': '#ccf', // ['get', 'color'],
      },
    })
  }

  private async processDepartures() {
    this.loadingText = 'Processing departures'

    for (const id in this._transitLines) {
      if (this._transitLines.hasOwnProperty(id)) {
        const transitLine = this._transitLines[id]
        for (const route of transitLine.transitRoutes) {
          for (const linkID of route.route) {
            if (!(linkID in this._departures))
              this._departures[linkID] = { total: 0, routes: new Set() }

            this._departures[linkID].total += route.departures
            this._departures[linkID].routes.add(route.id)

            this._maximum = Math.max(this._maximum, this._departures[linkID].total)
          }
        }
      }
    }
  }

  private async addTransitToMap(geodata: any) {
    this.mymap.addSource('transit-source', {
      data: geodata,
      type: 'geojson',
    } as any)

    this.mymap.addLayer({
      id: 'transit-link',
      source: 'transit-source',
      type: 'line',
      paint: {
        'line-opacity': 1.0,
        'line-width': ['get', 'width'],
        'line-color': ['get', 'color'],
      },
    })

    const parent = this
    this.mymap.on('click', 'transit-link', function(e: mapboxgl.MapMouseEvent) {
      parent.clickedOnTransitLink(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'transit-link', function(e: mapboxgl.MapMouseEvent) {
      parent.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'transit-link', function() {
      parent.mymap.getCanvas().style.cursor = 'grab'
    })
  }

  private constructGeoJsonFromLinkData() {
    const geojsonLinks = []

    for (const id in this._network.links) {
      if (this._network.links.hasOwnProperty(id)) {
        const link = this._network.links[id]
        const fromNode = this._network.nodes[link.from]
        const toNode = this._network.nodes[link.to]

        const coordinates = [
          [fromNode.x, fromNode.y],
          [toNode.x, toNode.y],
        ]

        const featureJson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
          properties: { id: id, color: '#aaa' },
        }

        geojsonLinks.push(featureJson)
      }
    }

    this._linkData = {
      type: 'FeatureCollection',
      features: geojsonLinks,
    }
    return this._linkData
  }

  private async constructDepartureFrequencyGeoJson() {
    this.loadingText = 'Construct departure frequencies'
    const geojson = []

    for (const linkID in this._departures) {
      if (this._departures.hasOwnProperty(linkID)) {
        const link = this._network.links[linkID]
        const coordinates = [
          [this._network.nodes[link.from].x, this._network.nodes[link.from].y],
          [this._network.nodes[link.to].x, this._network.nodes[link.to].y],
        ]

        const departures = this._departures[linkID].total

        // shift scale from 0->1 to 0.25->1.0, because dark blue is hard to see on a black map
        const ratio = 0.25 + (0.75 * (departures - 1)) / this._maximum
        const colorBin = Math.floor(COLOR_CATEGORIES * ratio)

        let isRail = true
        for (const route of this._departures[linkID].routes) {
          if (this._routeData[route].transportMode === 'bus') {
            isRail = false
          }
          // if (isRail) break
        }
        let line = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
          properties: {
            width: Math.max(3, 0.01 * this._departures[linkID].total),
            color: isRail ? '#a03919' : _colorScale[colorBin],
            colorBin: colorBin,
            departures: departures,
            id: linkID,
            isRail: isRail,
            from: link.from, // _stopFacilities[fromNode].name || fromNode,
            to: link.to, // _stopFacilities[toNode].name || toNode,
          },
        }

        line = this.offsetLineByMeters(line, -10)
        geojson.push(line)
      }
    }

    geojson.sort(function(a: any, b: any) {
      if (a.isRail && !b.isRail) return -1
      if (b.isRail && !a.isRail) return 1
      return 0
    })

    return { type: 'FeatureCollection', features: geojson }
  }

  private offsetLineByMeters(line: any, metersToTheRight: number) {
    try {
      const offsetLine = turf.lineOffset(line, metersToTheRight, { units: 'meters' })
      return offsetLine
    } catch (e) {
      // offset can fail if points are exactly on top of each other; ignore.
    }
    return line
  }

  private removeStopMarkers() {
    this.stopMarkers = []
  }

  private async showTransitStops() {
    this.removeStopMarkers()

    const route = this.selectedRoute
    const stopSizeClass = 'stopmarker' // this.mymap.getZoom() > SHOW_STOPS_AT_ZOOM_LEVEL ? 'stop-marker-big' : 'stop-marker'
    const mapBearing = this.mymap.getBearing()

    let bearing

    for (const [i, stop] of route.routeProfile.entries()) {
      const coord = [this._stopFacilities[stop.refId].x, this._stopFacilities[stop.refId].y]
      // recalc bearing for every node except the last
      if (i < route.routeProfile.length - 1) {
        const point1 = turf.point([coord[0], coord[1]])
        const point2 = turf.point([
          this._stopFacilities[route.routeProfile[i + 1].refId].x,
          this._stopFacilities[route.routeProfile[i + 1].refId].y,
        ])
        bearing = turf.bearing(point1, point2) - mapBearing // so icons rotate along with map
      }

      const xy = this.mymap.project([coord[0], coord[1]])

      // every marker has a latlng coord and a bearing
      const marker = { i, bearing, xy: { x: Math.floor(xy.x), y: Math.floor(xy.y) } }
      this.stopMarkers.push(marker)
    }
  }

  private showTransitRoute(routeID: string) {
    if (!routeID) return

    const route = this._routeData[routeID]
    console.log({ SELECTED_ROUTE: route })

    this.selectedRoute = route

    const source = this.mymap.getSource('selected-route-data') as any
    if (source) {
      source.setData(route.geojson)
    } else {
      this.mymap.addSource('selected-route-data', {
        data: route.geojson,
        type: 'geojson',
      })
    }

    if (!this.mymap.getLayer('selected-route')) {
      this.mymap.addLayer({
        id: 'selected-route',
        source: 'selected-route-data',
        type: 'line',
        paint: {
          'line-opacity': 1.0,
          'line-width': 5, // ['get', 'width'],
          'line-color': '#097c43', // ['get', 'color'],
        },
      })
    }
  }

  private removeSelectedRoute() {
    if (this.selectedRoute) {
      this.mymap.removeLayer('selected-route')
      this.selectedRoute = null
    }
  }

  private clickedOnTransitLink(e: any) {
    this.removeStopMarkers()
    this.removeSelectedRoute()

    // the browser delivers some details that we need, in the fn argument 'e'
    const props = e.features[0].properties
    const routeIDs = this._departures[props.id].routes

    const routes = []
    for (const id of routeIDs) {
      routes.push(this._routeData[id])
    }

    // sort by highest departures first
    routes.sort(function(a, b) {
      // return a.id < b.id ? -1 : 1
      return a.departures > b.departures ? -1 : 1
    })

    this.routesOnLink = routes
    this.highlightAllAttachedRoutes()

    // highlight the first route, if there is one
    if (routes.length > 0) this.showRouteDetails(routes[0].id)
  }

  private removeAttachedRoutes() {
    for (const layerID of this._attachedRouteLayers) {
      this.mymap.removeLayer('route-' + layerID)
      this.mymap.removeSource('source-route-' + layerID)
    }
    this._attachedRouteLayers = []
  }

  private highlightAllAttachedRoutes() {
    this.removeAttachedRoutes()

    for (const route of this.routesOnLink) {
      this.mymap.addSource('source-route-' + route.id, {
        data: route.geojson,
        type: 'geojson',
      })
      this.mymap.addLayer({
        id: 'route-' + route.id,
        source: 'source-route-' + route.id,
        type: 'line',
        paint: {
          'line-opacity': 0.7,
          'line-width': 8, // ['get', 'width'],
          'line-color': '#ccff33', // ['get', 'color'],
        },
      })
      this._attachedRouteLayers.push(route.id)
    }
  }

  private pressedEscape() {
    this.removeSelectedRoute()
    this.removeStopMarkers()
    this.removeAttachedRoutes()

    this.selectedRoute = null
    this.routesOnLink = []
  }

  private pressedArrowKey(delta: number) {
    if (!this.selectedRoute) return

    let i = this.routesOnLink.indexOf(this.selectedRoute)
    i = i + delta

    if (i < 0 || i >= this.routesOnLink.length) return

    this.showRouteDetails(this.routesOnLink[i].id)
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'transit-supply',
  prettyName: 'Transit Routes',
  description: 'The scheduled transit routes on a network',
  filePatterns: ['viz-transit*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent

const _colorScale = colormap({ colormap: 'viridis', nshades: COLOR_CATEGORIES })

const nodeReadAsync = function(filename: string) {
  const fs = require('fs')
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err: Error, data: string) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mapboxgl-popup-content {
  padding: 0px 20px 0px 0px;
  opacity: 0.95;
  box-shadow: 0 0 3px #00000080;
}

h4,
p {
  margin: 0px 10px;
}

.transit-popup {
  padding: 0px 0px;
  margin: 0px 0px;
  border-style: solid;
  border-width: 0px 0px 0px 20px;
}

#container {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  width: 100%;
}

.map-container {
  background: url('assets/thumbnail.jpg') no-repeat;
  background-color: #eee;
  background-size: cover;
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
}

.map-container.hide-thumbnail {
  background: none;
}

#mymap {
  height: 100%;
  width: 100%;
  flex: 1;
}

.status-blob {
  background-color: #fff;
  box-shadow: 0 0 8px #00000040;
  opacity: 0.97;
  margin: auto 0px auto -10px;
  padding: 3rem 0px;
  text-align: center;
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  z-index: 2;
  border-top: solid 1px #479ccc;
  border-bottom: solid 1px #479ccc;
}

.route {
  background-color: #414347;
  margin: 0px 0px;
  padding: 5px 0px;
  text-align: left;
  color: #fff;
  border-left: solid 8px #00000000;
  border-right: solid 8px #00000000;
}

.route:hover {
  background-color: #5b5e63;
  cursor: pointer;
}

h3 {
  margin: 0px 0px;
  font-size: 16px;
}

.mytitle {
  margin-left: 10px;
  color: #366ce0;
}

.details {
  font-size: 12px;
}

.stopmarker {
  width: 12px;
  height: 12px;
  cursor: pointer;
}

.stop-marker-big {
  background: url('assets/icon-stop-triangle.png') no-repeat;
  background-size: 100%;
  width: 16px;
  height: 16px;
}

.highlightedRoute {
  background-color: #faffae;
  border-left: solid 8px #606aff;
  color: black;
}

.highlightedRoute:hover {
  background-color: #faffae;
}

.bigtitle {
  font-weight: bold;
  font-style: italic;
  font-size: 20px;
  margin: 20px 0px;
}

.info-header {
  text-align: center;
  background-color: #097c43;
  padding: 0.5rem 0rem;
  border-top: solid 1px #888;
  border-bottom: solid 1px #888;
}

.project-summary-block {
  width: 16rem;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  margin: 0px auto auto 0px;
  z-index: 10;
}

.info-blob {
  display: flex;
  flex-direction: column;
  width: 16rem;
  height: 100%;
  background-color: #363a45;
  margin: 0px 0px;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
  text-align: center;
  opacity: 0.95;
  z-index: 5;
  animation: 0.3s ease 0s 1 slideInFromLeft;
}

@keyframes slideInFromLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.stop-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  background: url('assets/icon-stop-triangle.png') no-repeat;
  transform: translate(-50%, -50%);
  background-size: 100%;
  cursor: pointer;
}

.help-text {
  color: #ccc;
}

.status-blob p {
  color: #224;
}

.legend {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  margin: auto 0.25rem 3.5rem auto;
  z-index: 10;
}

.left-panel {
  position: absolute;
  top: 2.4rem;
  bottom: 0;
  overflow-y: auto;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  width: 16rem;
}

.dashboard-panel {
  display: flex;
  flex-direction: column;
}
</style>
