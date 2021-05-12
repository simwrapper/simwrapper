<i18n>
en:
  metrics: 'Metrics'
de:
  metrics: 'Metrics'
</i18n>

<template lang="pug">
.transit-viz(:class="{'hide-thumbnail': !thumbnail}")

  .map-container(:class="{'hide-thumbnail': !thumbnail }")
    #mymap
      .stop-marker(v-for="stop in stopMarkers" :key="stop.i"
        :style="{transform: 'translate(-50%,-50%) rotate('+stop.bearing+'deg)', left: stop.xy.x + 'px', top: stop.xy.y+'px'}"
      )

  collapsible-panel.left-side(v-if="!thumbnail && routesOnLink.length > 0" :darkMode="isDarkMode" :width="500" direction="left")
    .panel-items
      .panel-item
        h3 {{ vizDetails.title }}
        p {{ vizDetails.description }}

        p.details.help-text(style="margin-top:20px" v-if="routesOnLink.length === 0") Select a link to see the routes traversing it.

      .route-list
        .route(v-for="route in routesOnLink"
            :key="route.uniqueRouteID"
            :class="{highlightedRoute: selectedRoute && route.id === selectedRoute.id}"
            @click="showRouteDetails(route.id)")
          h3.mytitle {{route.id}}
          .detailed-route-data
            .col
              p: b {{route.departures}} departures
              p First: {{route.firstDeparture}}
              p Last: {{route.lastDeparture}}
            .col(v-if="route.passengersAtArrival")
              p: b {{ route.passengersAtArrival }} passengers
              p {{ route.totalVehicleCapacity }} capacity

  collapsible-panel.right-side(v-if="!thumbnail" :darkMode="isDarkMode" :width="300" direction="right")
    .panel-item
      h3 {{  $t('metrics') }}:
      .metric-buttons
        button.button.is-small.metric-button(
          v-for="metric,i in metrics" :key="metric.field"
          :style="{'color': activeMetric===metric.field ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'border-right': `0.4rem solid ${buttonColors[i]}`,'border-radius': '4px', 'background-color': activeMetric===metric.field ? buttonColors[i] : isDarkMode ? '#333':'white'}"
          @click="handleClickedMetric(metric)") {{ $i18n.locale === 'de' ? metric.name_de : metric.name_en }}

    legend-box(:rows="legendRows")

  .status-corner(v-if="!thumbnail && loadingText")
    p {{ loadingText }}

</template>

<script lang="ts">
'use strict'

import * as turf from '@turf/turf'
import colormap from 'colormap'
import crossfilter from 'crossfilter2'
import mapboxgl, { GeoJSONSource, LngLatBoundsLike, LngLatLike } from 'mapbox-gl'
import nprogress from 'nprogress'
import Papaparse from 'papaparse'
import yaml from 'yaml'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import LeftDataPanel from '@/components/LeftDataPanel.vue'

import { Network, NetworkInputs, NetworkNode, TransitLine, RouteDetails } from './Interfaces'
import XmlFetcher from '@/workers/XmlFetcher'
import TransitSupplyHelper from './TransitSupplyHelper'
import LegendBox from './LegendBox.vue'

import { FileSystem, SVNProject, ColorScheme, VisualizationPlugin, MAP_STYLES } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import globalStore from '@/store'

import GzipWorker from '@/workers/GzipFetcher.worker'
import { ParseResult } from 'markdown-it/lib/helpers/parse_link_destination'

const DEFAULT_PROJECTION = 'EPSG:31468' // 31468' // 2048'

const COLOR_CATEGORIES = 10
const SHOW_STOPS_AT_ZOOM_LEVEL = 11

class Departure {
  public total: number = 0
  public routes: Set<string> = new Set()
}

@Component({ components: { CollapsiblePanel, LeftDataPanel, LegendBox } })
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

  private buttonColors = ['#5E8AAE', '#BF7230', '#269367', '#9C439C']
  private metrics = [{ field: 'departures', name_en: 'Departures', name_de: 'Abfahrten' }]
  private activeMetric: any = this.metrics[0].field

  private vizDetails = {
    transitSchedule: '',
    network: '',
    demand: '',
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

  private isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode

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

  @Watch('globalState.colorScheme') private swapTheme() {
    this.isDarkMode = this.globalState.colorScheme === ColorScheme.DarkMode
    if (!this.mymap) return

    this.removeAttachedRoutes()

    this.mymap.setStyle(this.isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light)

    this.mymap.on('style.load', () => {
      if (this._geoTransitLinks) this.addTransitToMap(this._geoTransitLinks)
      this.highlightAllAttachedRoutes()
      if (this.selectedRoute) this.showTransitRoute(this.selectedRoute.id)
    })
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

    const t = this.vizDetails.title ? this.vizDetails.title : 'Transit Ridership'
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
    try {
      this.mymap = new mapboxgl.Map({
        bearing: 0,
        container: 'mymap',
        logoPosition: 'bottom-left',
        // style: { version: 8, sources: {}, layers: [] },
        style: this.isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light,
        pitch: 0,
      })

      const extent = localStorage.getItem(this.$route.fullPath + '-bounds')

      if (extent) {
        const lnglat = JSON.parse(extent)

        const mFac = this.isMobile() ? 0 : 1
        const padding = { top: 50 * mFac, bottom: 50 * mFac, right: 50 * mFac, left: 50 * mFac }

        this.mymap.fitBounds(lnglat, {
          animate: false,
        })
      }
    } catch (E) {
      console.error({ E })
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

  private handleClickedMetric(metric: { field: string }) {
    console.log(metric.field)

    this.activeMetric = metric.field

    let widthExpression: any = 3

    switch (metric.field) {
      case 'departures':
        widthExpression = ['max', 2, ['*', 0.03, ['get', 'departures']]]
        break

      case 'pax':
        widthExpression = ['max', 2, ['*', 0.003, ['get', 'pax']]]
        break

      case 'loadfac':
        widthExpression = ['max', 2, ['*', 200, ['get', 'loadfac']]]
        break
    }

    this.mymap.setPaintProperty('transit-link', 'line-width', widthExpression)
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
    // const parent = this
    window.addEventListener('keyup', event => {
      if (event.keyCode === 27) {
        // ESC
        this.pressedEscape()
      }
    })
    window.addEventListener('keydown', event => {
      if (event.keyCode === 38) {
        this.pressedArrowKey(-1) // UP
      }
      if (event.keyCode === 40) {
        this.pressedArrowKey(+1) // DOWN
      }
    })
  }

  private async loadNetworks() {
    try {
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

      const ridership = this.loadDemandData(this.vizDetails.demand)
      return { roadXML: results[0], transitXML: results[1], ridership }
    } catch (e) {
      console.error({ e })
      this.loadingText = '' + e
      return null
    }
  }

  private loadDemandData(filename: string) {
    if (!filename) return []

    this.loadingText = 'Loading demand...'
    const worker = new GzipWorker() as Worker

    worker.onmessage = (event: MessageEvent) => {
      this.loadingText = 'Processing demand...'
      const buf = event.data
      const decoder = new TextDecoder('utf-8')
      const csvData = decoder.decode(buf)

      Papaparse.parse(csvData, {
        // preview: 10000,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        worker: true,
        complete: results => {
          this.processDemand(results)
        },
      })
    }

    worker.postMessage({
      filePath: this.myState.subfolder + '/' + filename,
      fileSystem: this.myState.fileSystem,
    })
  }

  private cfDemand: crossfilter.Crossfilter<any> | null = null
  private cfDemandLink: crossfilter.Dimension<any, any> | null = null

  private processDemand(results: Papaparse.ParseResult<unknown>) {
    // todo: make sure meta contains fields we need!
    this.loadingText = 'Processing demand data...'

    // build crossfilter
    console.log('BUILD crossfilter')
    this.cfDemand = crossfilter(results.data)
    this.cfDemandLink = this.cfDemand.dimension((d: any) => d.linkIdsSincePreviousStop)

    // build link-level passenger ridership
    console.log('COUNTING RIDERSHIP')

    const linkPassengersById = {} as any
    const group = this.cfDemandLink.group()
    group
      .reduceSum((d: any) => d.passengersAtArrival)
      .all()
      .map(link => {
        linkPassengersById[link.key as any] = link.value
      })

    // and pax load-factors
    const capacity = {} as any
    group
      .reduceSum((d: any) => d.totalVehicleCapacity)
      .all()
      .map(link => {
        capacity[link.key as any] = link.value
      })

    // update passenger value in the transit-link geojson.
    for (const transitLink of this._transitLinks.features) {
      transitLink.properties['pax'] = linkPassengersById[transitLink.properties.id]
      transitLink.properties['cap'] = capacity[transitLink.properties.id]
      transitLink.properties['loadfac'] =
        linkPassengersById[transitLink.properties.id] / capacity[transitLink.properties.id]
    }

    this.metrics = this.metrics.concat([
      { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
      { field: 'loadfac', name_en: 'Load Factors', name_de: 'Auslastung' },
    ])

    const source = this.mymap.getSource('transit-source') as GeoJSONSource
    source.setData(this._transitLinks)

    this.loadingText = ''
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

    const {
      network,
      routeData,
      stopFacilities,
      transitLines,
      mapExtent,
    }: any = await this._transitHelper.processTransit()

    this._network = network
    this._routeData = routeData
    this._stopFacilities = stopFacilities
    this._transitLines = transitLines
    this._mapExtentXYXY = mapExtent

    // await this.addLinksToMap() // --no links for now

    this.loadingText = 'Summarizing departures...'
    await this.processDepartures()

    // Build the links layer and add it
    this._transitLinks = await this.constructDepartureFrequencyGeoJson()
    this.addTransitToMap(this._transitLinks)

    this.handleClickedMetric({ field: 'departures' })

    localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))
    this.mymap.fitBounds(this._mapExtentXYXY, {
      animate: false,
    })

    if (!this.vizDetails.demand) this.loadingText = ''
    nprogress.done()
  }

  private _transitLinks: any

  private async processDepartures() {
    this.loadingText = 'Processing departures...'

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

  private _geoTransitLinks: any

  private addTransitToMap(geodata: any) {
    this._geoTransitLinks = geodata

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
        'line-width': 1,
        'line-color': ['get', 'color'],
      },
    })

    this.mymap.on('click', 'transit-link', (e: mapboxgl.MapMouseEvent) => {
      this.clickedOnTransitLink(e)
    })

    // turn "hover cursor" into a pointer, so user knows they can click.
    this.mymap.on('mousemove', 'transit-link', (e: mapboxgl.MapMouseEvent) => {
      this.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
    })

    // and back to normal when they mouse away
    this.mymap.on('mouseleave', 'transit-link', () => {
      this.mymap.getCanvas().style.cursor = 'grab'
    })
  }

  private async constructDepartureFrequencyGeoJson() {
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
        }

        let line = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
          properties: {
            color: isRail ? '#a03919' : _colorScale[colorBin],
            colorBin: colorBin,
            departures: departures,
            // pax: 0,
            // loadfac: 0,
            // cap: 0,
            id: linkID,
            isRail: isRail,
            from: link.from, // _stopFacilities[fromNode].name || fromNode,
            to: link.to, // _stopFacilities[toNode].name || toNode,
          },
        }

        line = this.offsetLineByMeters(line, 15)
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
    console.log({ selectedRoute: route })

    this.selectedRoute = route

    const source = this.mymap.getSource('selected-route-data') as GeoJSONSource
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

    this.calculatePassengerVolumes(props.id)

    const routes = []
    for (const id of routeIDs) {
      routes.push(this._routeData[id])
    }

    // sort by highest departures first
    routes.sort(function(a, b) {
      return a.departures > b.departures ? -1 : 1
    })

    this.routesOnLink = routes
    this.highlightAllAttachedRoutes()

    // highlight the first route, if there is one
    if (routes.length > 0) this.showRouteDetails(routes[0].id)
  }

  private calculatePassengerVolumes(id: string) {
    if (!this.cfDemandLink || !this.cfDemand) return

    this.cfDemandLink.filter(id)

    const allLinks = this.cfDemand.allFiltered()
    let sum = 0

    allLinks.map(d => {
      sum = sum + d.passengersBoarding + d.passengersAtArrival - d.passengersAlighting
    })

    console.log({ sum, allLinks })
  }

  private removeAttachedRoutes() {
    for (const layerID of this._attachedRouteLayers) {
      try {
        this.mymap.removeLayer('route-' + layerID)
        this.mymap.removeSource('source-route-' + layerID)
      } catch (e) {
        //meh
      }
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
  kebabName: 'transit-demand',
  prettyName: 'Transit Demand',
  description: 'Transit passengers and ridership',
  filePatterns: ['viz-pt-demand*.y?(a)ml'],
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

.transit-viz {
  display: grid;
  pointer-events: none;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'title      rightside'
    'leftside   rightside'
    'playback   clock';
}

.map-container {
  pointer-events: auto;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-color: #eee;
  background-size: cover;
  grid-column: 1 / 5;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
}

.hide-thumbnail {
  background: none;
}

#mymap {
  height: 100%;
  width: 100%;
  flex: 1;
}

.route {
  padding: 5px 0px;
  text-align: left;
  color: var(--text);
  border-left: solid 8px #00000000;
  border-right: solid 8px #00000000;
}

.route:hover {
  background-color: var(--bgCream3);
  cursor: pointer;
}

h3 {
  margin: 0px 0px;
  font-size: 1rem;
}

.mytitle {
  margin-left: 10px;
  color: var(--link);
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

.left-side {
  z-index: 1;
  position: absolute;
  top: 0rem;
  left: 0;
  margin: 7rem 0 0 0;
  color: white;
  display: flex;
  flex-direction: row;
  pointer-events: auto;
  max-height: calc(100% - 10rem);
}

.right-side {
  z-index: 1;
  position: absolute;
  bottom: 0;
  right: 0;
  margin: 0 0 3rem 0;
  color: white;
  display: flex;
  flex-direction: row;
  pointer-events: auto;
}

.panel-items {
  color: var(--text);
  display: flex;
  flex-direction: column;
  margin: 0 0;
  max-height: 100%;
  h3 {
    padding: 0 0.5rem;
  }
}

.panel-item {
  color: var(--text);
  padding: 0 0.5rem;
  margin-top: 0.25rem;
  margin-bottom: 1rem;

  h1 {
    font-size: 2rem;
  }
}

.route-list {
  user-select: none;
  position: relative;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: pointer;
  scrollbar-color: #888 var(--bgCream);
  -webkit-scrollbar-color: #888 var(--bgCream);

  h3 {
    font-size: 1.2rem;
  }
}

.dashboard-panel {
  display: flex;
  flex-direction: column;
}

.metric-buttons {
  display: flex;
  flex-direction: column;
}

.metric-button {
  margin-bottom: 0.25rem;
}

.detailed-route-data {
  display: flex;
  flex-direction: row;
}

.col {
  display: flex;
  flex-direction: column;
}
.status-corner {
  z-index: 5;
  grid-column: 1 / 3;
  grid-row: 1 / 3;
  box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0rem 3rem;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    color: var(--textFancy);
    font-weight: normal;
    font-size: 1.3rem;
    line-height: 2.5rem;
    margin: auto 0.5rem auto 0;
    padding: 0 0;
  }
}
</style>
