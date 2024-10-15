<template lang="pug">
.transit-viz(:class="{'hide-thumbnail': !thumbnail}")

  .main-layout(v-if="!thumbnail"
    @mousemove.stop="dividerDragging"
    @mouseup="dividerDragEnd"
  )

    .dragger(v-show="showLegend"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

    .new-rightside-info-panel(v-show="showLegend" :style="{width: `${legendSectionWidth}px`}")

      p(style="margin-top: 0.5rem; font-size: 0.9rem")
        b TRANSIT ROUTES

      .panel-item(v-if="metrics.length > 1")
        .metric-buttons
          button.button.is-small.metric-button(
            v-for="metric,i in metrics" :key="metric.field"
            :style="{'color': activeMetric===metric.field ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'background-color': activeMetric===metric.field ? buttonColors[i] : isDarkMode ? '#333':'white'}"
            @click="handleClickedMetric(metric)") {{ $i18n.locale === 'de' ? metric.name_de : metric.name_en }}

      b-input.searchbox(
        v-model="searchText" style="padding: 0.5rem 0.5rem 1rem 0" size="is-small" placeholder="Search..."
      )

      p(v-if="!routesOnLink.length" style="font-size: 0.9rem") Select a link to view its routes.

      .panel-items
        .route-list(v-if="routesOnLink.length > 0")

          .link-summary.flex-col(v-if="summaryStats.departures")
            p: b LINK SUMMARY
            .indent.flex-col(style="margin-left: 0.5rem")
              p Departures: {{ summaryStats.departures }}
              p(v-if="cfDemand") Passengers: {{ summaryStats.pax }}
              p(v-if="cfDemand") Load factor: {{ summaryStats.loadfac }}

          p: b ROUTES ON LINK
          .route(v-for="route in routesOnLink"
              :key="route.uniqueRouteID"
              :class="{highlightedRoute: selectedRoute && route.id === selectedRoute.id}"
              @click="showRouteDetails(route.id)"
          )
            .route-title {{route.id}}
            .detailed-route-data
              .col
                p: b {{route.departures}} departures
                p {{route.firstDeparture}} — {{route.lastDeparture}}
              .col(v-if="route.passengersAtArrival")
                p: b {{ route.passengersAtArrival }} passengers
                p {{ route.totalVehicleCapacity }} capacity

      legend-box.legend(v-if="!thumbnail"
        :rows="legendRows"
      )

      //-   .status-bar(v-show="false && statusText") {{ statusText }}

    .map-container(:class="{'hide-thumbnail': !thumbnail }")
      div.map-styles(:id="mapID")
        .stop-html(v-if="stopHTML.html" v-html="stopHTML.html"
          :style="{left: stopHTML.x + 'px', top: stopHTML.y+'px'}"
        )
        .stop-marker(v-for="stop,i in stopMarkers" :key="`${i}${stop.name}`"
          @mouseenter="hoverOverStop(stop, $event)"
          :style="{transform: 'translate(-50%,-50%) rotate('+stop.bearing+'deg)', left: stop.xy.x + 'px', top: stop.xy.y+'px'}"
        )

      zoom-buttons
      //- drawing-tool(v-if="!thumbnail")

      .status-corner(v-if="loadingText")
        p {{ loadingText }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { metrics: 'Metrics', viewer: 'Transit Network' },
    de: { metrics: 'Metrics', viewer: 'ÖV Netzwerk' },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import * as turf from '@turf/turf'
import avro from '@/js/avro'
import colormap from 'colormap'
import crossfilter from 'crossfilter2'
import { debounce } from 'debounce'
import maplibregl, { GeoJSONSource, LngLatBoundsLike, LngLatLike, Popup } from 'maplibre-gl'
import Papa from '@simwrapper/papaparse'
import yaml from 'yaml'
import match from 'micromatch'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LeftDataPanel from '@/components/LeftDataPanel.vue'
import { Network, NetworkInputs, NetworkNode, TransitLine, RouteDetails } from './Interfaces'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'
import TransitSupplyWorker from './TransitSupplyHelper.worker?worker'
import LegendBox from './LegendBox.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DashboardDataManager from '@/js/DashboardDataManager'

import { FileSystem, FileSystemConfig, ColorScheme, VisualizationPlugin } from '@/Globals'

import GzipWorker from '@/workers/GzipFetcher.worker?worker'

const DEFAULT_PROJECTION = 'EPSG:31468' // 31468' // 2048'

const COLOR_CATEGORIES = 10
const SHOW_STOPS_AT_ZOOM_LEVEL = 11

const DEFAULT_ROUTE_COLORS = [
  {
    match: {
      transportMode: 'bus',
      // gtfsRouteType: [3, 700, 701, 702, 703, 704],
    },
    color: '#95276E',
    label: 'Bus',
  },
  {
    match: {
      transportMode: 'rail',
      id: 'U*',
      // gtfsRouteType: [1, 400, 401, 402, 403, 404, 405],
    },
    color: '#115D91',
    label: 'U-Bahn',
  },
  {
    match: {
      transportMode: 'rail',
      id: 'S*',
      // gtfsRouteType: [109],
    },
    color: '#408335',
    label: 'S-Bahn',
  },
  {
    match: {
      transportMode: 'rail',
      // gtfsRouteType: [2, 100, 101, 102, 103, 104, 105, 106, 107, 108],
    },
    color: '#EC0016 ',
    label: 'Long-distance train services',
  },
  {
    match: {
      transportMode: 'ferry',
      // gtfsRouteType: [4, 1000, 1200],
    },
    color: '#0480c1',
    label: 'Ferry',
  },
  {
    match: {
      transportMode: 'tram',
      // gtfsRouteType: [0, 900, 901, 902, 903, 904, 905, 906]
    },
    color: '#BE1414',
    label: 'Tram',
  },
  {
    match: { transportMode: 'pt' },
    color: '#00a',
    label: 'Public Transport',
  },
  // {
  //   match: { transportMode: 'train' },
  //   color: '#0a0',
  //   label: 'Rail',
  // },
  {
    match: { id: '**' },
    color: '#aae',
    label: 'Other',
  },
] as { match: any; color: string; label: string; hide: boolean }[]

class Departure {
  public total: number = 0
  public routes: Set<string> = new Set()
}

const MyComponent = defineComponent({
  name: 'TransitViewer',
  i18n,
  components: { CollapsiblePanel, LeftDataPanel, LegendBox, DrawingTool, ZoomButtons },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: { type: Object as any },
    thumbnail: Boolean,
    datamanager: { type: Object as PropType<DashboardDataManager> },
  },

  data() {
    const metrics = [{ field: 'departures', name_en: 'Departures', name_de: 'Abfahrten' }]

    return {
      searchText: '',
      //drag
      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 250,
      showLegend: true,
      //
      stopHTML: { html: '', x: 0, y: 0 },
      mapPopup: new Popup({
        closeButton: false,
        closeOnClick: false,
      }),
      buttonColors: ['#5E8AAE', '#BF7230', '#269367', '#9C439C'],
      metrics: metrics,
      activeMetric: metrics[0].field as any,
      vizDetails: {
        transitSchedule: '',
        network: '',
        demand: '',
        projection: '',
        title: '',
        description: '',
        customRouteTypes: [] as { match: any; color: string; label: string; hide: boolean }[],
      },
      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      debounceHandleSearchText: {} as any,

      myState: {
        subfolder: '',
        yamlConfig: '',
        thumbnail: true,
      },
      avroNetwork: null as any,
      isDarkMode: globalStore.state.isDarkMode,
      isMapMoving: false,
      loadingText: 'MATSim Transit Inspector',
      mymap: null as any,
      mapID: `map-id-${Math.floor(1e12 * Math.random())}` as any,
      projection: DEFAULT_PROJECTION,
      routesOnLink: [] as any[],
      selectedRoute: null as any,
      summaryStats: { departures: 0, pax: 0, loadfac: 0 },
      stopMarkers: [] as any[],
      _attachedRouteLayers: [] as string[],
      _departures: {} as { [linkID: string]: Departure },
      _linkData: null as any,
      _mapExtentXYXY: null as any,
      _maximum: -Infinity,
      _network: {} as Network,
      _routeData: {} as { [index: string]: RouteDetails },
      _stopFacilities: {} as { [index: string]: NetworkNode },
      _transitLines: {} as { [index: string]: TransitLine },
      _roadFetcher: {} as any,
      _transitFetcher: {} as any,
      _transitHelper: {} as any,
      _transitLinks: null as any,
      _geoTransitLinks: null as any,

      resolvers: {} as { [id: number]: any },
      resolverId: 0,
      xmlWorker: null as null | Worker,
      cfDemand: null as crossfilter.Crossfilter<any> | null,
      cfDemandLink: null as crossfilter.Dimension<any, any> | null,
      hoverWait: false,
      routeColors: [] as { match: any; color: string; label: string; hide: boolean }[],
      usedLabels: [] as string[],
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    legendRows(): string[][] {
      return this.routeColors
        .filter(r => this.usedLabels.includes(r.label))
        .map(r => [r.color, r.label])
    },
  },

  watch: {
    searchText() {
      this.debounceHandleSearchText()
    },

    '$store.state.resizeEvents'() {
      if (this.mymap) this.mymap.resize()
    },

    '$store.state.viewState'({ bearing, longitude, latitude, zoom, pitch }: any) {
      // ignore my own farts; they smell like roses
      if (!this.mymap || this.isMapMoving) {
        this.isMapMoving = false
        return
      }

      // sometimes closing a view returns a null map, ignore it!
      if (!zoom) return

      this.mymap.off('move', this.handleMapMotion)

      this.mymap.jumpTo({
        bearing,
        zoom,
        center: [longitude, latitude],
        pitch,
      })

      this.mymap.on('move', this.handleMapMotion)

      if (this.stopMarkers.length > 0) this.showTransitStops()
    },

    '$store.state.colorScheme'() {
      this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
      if (!this.mymap) return

      this.removeAttachedRoutes()

      this.mymap.setStyle(globalStore.getters.mapStyle)

      this.mymap.on('style.load', () => {
        if (this._geoTransitLinks) this.addTransitToMap(this._geoTransitLinks)
        this.highlightAllAttachedRoutes()
        if (this.selectedRoute) this.showTransitRoute(this.selectedRoute.id)
      })
    },
  },

  methods: {
    handleSearchText() {
      this.handleEmptyClick(null, true)
      let foundRoutes = [] as any[]
      const searchTerm = this.searchText.trim().toLocaleLowerCase()

      if (searchTerm) {
        foundRoutes = Object.keys(this._routeData).filter(
          routeID => routeID.toLocaleLowerCase().indexOf(searchTerm) > -1
        )
      }

      // show/hide background transit routes
      // this.showAllTransit(!foundRoutes.length)

      // show selected routes
      this.routesOnLink = foundRoutes.map(id => this._routeData[id])

      this.highlightAllAttachedRoutes()
      if (this.routesOnLink.length) {
        this.selectedRoute = this.routesOnLink[0].id
        this.showTransitRoute(this.selectedRoute)
      }

      this.setTransitLayerOpacity(searchTerm ? 0.2 : 1.0)
    },

    hoverOverStop(stop: any, e: MouseEvent) {
      this.stopHTML.html = ''
      const lines = [] as string[]
      if (stop.name) lines.push(`<b>${stop.name}</b>`)
      for (const attr of ['id', 'linkRefId']) {
        if (stop[attr]) lines.push(`${attr}: ${stop[attr]}`)
      }
      this.stopHTML.html = '<p>' + lines.join('<br/>') + '</p>'
      this.stopHTML.x = stop.xy.x + 8
      this.stopHTML.y = stop.xy.y - 36
    },

    dividerDragStart(e: MouseEvent) {
      console.log('dragstart')
      // console.log('dragStart', e)
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.legendSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      const deltaX = this.isDraggingDivider - e.clientX
      this.legendSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
      // localStorage.setItem('leftPanelWidth', `${this.legendSectionWidth}`)
      this.mymap.resize()
    },

    async getVizDetails() {
      // are we in a dashboard?
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        return true
      }

      // if a YAML file was passed in, just use it
      if (this.myState.yamlConfig?.endsWith('yaml') || this.myState.yamlConfig?.endsWith('yml')) {
        return this.loadYamlConfig()
      }

      // Build the config based on folder contents
      const title = this.myState.yamlConfig.substring(
        0,
        15 + this.myState.yamlConfig.indexOf('transitSchedule')
      )

      this.vizDetails = {
        transitSchedule: this.myState.yamlConfig,
        network: '',
        title,
        description: '',
        demand: '',
        projection: '',
        customRouteTypes: [],
      }

      this.$emit('title', title)
      return true
    },

    async prepareView() {
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)

      // Road network: first try the most obvious network filename:
      let network =
        this.vizDetails.network ?? this.myState.yamlConfig.replaceAll('transitSchedule', 'network')

      // if the obvious network file doesn't exist, just grab... the first network file:
      if (files.indexOf(network) == -1) {
        const allNetworks = files.filter(f => f.endsWith('network.xml.gz'))
        if (allNetworks.length) network = allNetworks[0]
        else {
          this.loadingText = 'No road network found.'
          network = ''
        }
      }

      // Departures: use them if we are in an output folder (and they exist)
      let demandFiles = [] as string[]
      if (this.myState.yamlConfig.indexOf('output_transitSchedule') > -1) {
        demandFiles = files.filter(f => f.endsWith('pt_stop2stop_departures.csv.gz'))
      }

      // Save everything
      this.vizDetails.network = network
      if (demandFiles.length) this.vizDetails.demand = demandFiles[0]
    },

    async guessProjection(networks: any): Promise<string> {
      // 00. If it's in config, use it
      if (this.vizDetails.projection) return this.vizDetails.projection
      if (this.config?.projection) return this.config.projection

      // 0. If it's in the AVRO network, use it
      if (networks?.roadXML?.attributes?.coordinateReferenceSystem) {
        return networks?.roadXML?.attributes?.coordinateReferenceSystem
      }

      // 0. If it's in the network, use it
      if (networks?.roadXML?.network?.attributes?.attribute?.name === 'coordinateReferenceSystem') {
        return networks?.roadXML?.network?.attributes?.attribute['#text']
      }

      // 1. if we have it in storage already, use it
      const storagePath = `${this.root}/${this.subfolder}`
      let savedConfig = undefined // localStorage.getItem(storagePath) as any

      const goodEPSG = /EPSG:.\d/

      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig)

          if (goodEPSG.test(config.networkProjection)) {
            return config.networkProjection
          } else {
            savedConfig = {}
          }
        } catch (e) {
          console.error('bad saved config in storage', savedConfig)
          savedConfig = {}
          // fail! ok try something else
        }
      }

      // 2. try to get it from config
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)
      const outputConfigs = files.filter(
        f => f.indexOf('.output_config.xml') > -1 || f.indexOf('.output_config_reduced.xml') > -1
      )
      if (outputConfigs.length && this.fileSystem) {
        // console.log('trying to find CRS in', outputConfigs[0])

        for (const xmlConfigFileName of outputConfigs) {
          try {
            const configXML: any = await this.fetchXML({
              worker: null,
              slug: this.fileSystem.slug,
              filePath: this.myState.subfolder + '/' + xmlConfigFileName,
            })

            const global = configXML.config.module.filter((f: any) => f.$name === 'global')[0]
            const crs = global.param.filter((p: any) => p.$name === 'coordinateSystem')[0]

            const crsValue = crs.$value

            // save it
            // savedConfig = savedConfig || {}
            // savedConfig.networkProjection = crsValue
            // localStorage.setItem(storagePath, JSON.stringify(savedConfig))
            return crsValue
          } catch (e) {
            console.warn('Failed parsing', xmlConfigFileName)
          }
        }
      }

      // 3. ask the user
      let entry = prompt('Need coordinate EPSG number:', '') || ''

      // if user cancelled, give up
      if (!entry) return ''
      // if user gave bad answer, try again
      if (Number.isNaN(parseInt(entry, 10)) && !goodEPSG.test(entry))
        return this.guessProjection(networks)

      // hopefully user gave a good EPSG number
      if (!entry.startsWith('EPSG:')) entry = 'EPSG:' + entry

      const networkProjection = entry
      localStorage.setItem(storagePath, JSON.stringify({ networkProjection }))
      return networkProjection
    },

    async loadYamlConfig() {
      const filename =
        this.myState.yamlConfig.indexOf('/') > -1
          ? this.myState.yamlConfig
          : this.myState.subfolder + '/' + this.myState.yamlConfig

      try {
        const text = await this.fileApi.getFileText(filename)
        this.vizDetails = yaml.parse(text)
      } catch (e) {
        // maybe it failed because password?
        const err = e as any
        if (this.fileSystem && this.fileSystem.needPassword && err.status === 401) {
          this.$store.commit('requestLogin', this.fileSystem.slug)
        } else {
          const msg = 'Could not load ' + filename
          this.$emit('error', msg)
          this.loadingText = msg
        }
        return false
      }

      const t = this.vizDetails.title ? this.vizDetails.title : 'Transit Ridership'
      this.$emit('title', t)

      this.projection = this.vizDetails.projection
      return true
    },

    isMobile() {
      const w = window
      const d = document
      const e = d.documentElement
      const g = d.getElementsByTagName('body')[0]
      const x = w.innerWidth || e.clientWidth || g.clientWidth
      const y = w.innerHeight || e.clientHeight || g.clientHeight
      return x < 640
    },

    setupMap() {
      try {
        this.mymap = new maplibregl.Map({
          bearing: 0,
          container: this.mapID,
          logoPosition: 'bottom-left',
          style: globalStore.getters.mapStyle,
          pitch: 0,
        })

        const extent = localStorage.getItem(this.$route.fullPath + '-bounds')

        if (extent) {
          try {
            const lnglat = JSON.parse(extent)
            const mFac = this.isMobile() ? 0 : 1
            const padding = { top: 50 * mFac, bottom: 50 * mFac, right: 50 * mFac, left: 50 * mFac }

            this.mymap.fitBounds(lnglat, {
              animate: false,
              padding,
            })
          } catch (e) {
            // ignore this, it's ok
          }
        }
        // Start doing stuff AFTER the MapBox library has fully initialized
        this.mymap.on('load', this.mapIsReady)
        this.mymap.on('move', this.handleMapMotion)
        this.mymap.on('click', this.handleEmptyClick)

        this.mymap.keyboard.disable() // so arrow keys don't pan
      } catch (e) {
        console.error('' + e)

        // no worries
      }
    },

    drawMetric() {
      let widthExpression: any = 3

      switch (this.activeMetric) {
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
    },

    handleClickedMetric(metric: { field: string }) {
      console.log('transit metric:', metric.field)
      this.activeMetric = metric.field
      this.drawMetric()
    },

    handleMapMotion() {
      const mapCamera = {
        longitude: this.mymap.getCenter().lng,
        latitude: this.mymap.getCenter().lat,
        bearing: this.mymap.getBearing(),
        zoom: this.mymap.getZoom(),
        pitch: this.mymap.getPitch(),
      }

      if (!this.isMapMoving) this.$store.commit('setMapCamera', mapCamera)
      this.isMapMoving = true

      if (this.stopMarkers.length > 0) this.showTransitStops()
      this.stopHTML.html = ''
    },

    handleEmptyClick(e: any, force?: boolean) {
      this.setTransitLayerOpacity(1.0)

      // clear search box if user clicked away
      if (!force) this.searchText = ''

      // don't clear map if search box has text
      if (this.searchText && !force) return

      this.removeStopMarkers()
      this.removeSelectedRoute()
      this.removeAttachedRoutes()
      this.routesOnLink = []
      this.stopHTML.html = ''
      this.summaryStats = { departures: 0, pax: 0, loadfac: 0 }
    },

    showRouteDetails(routeID: string) {
      if (!routeID && !this.selectedRoute) return

      console.log({ routeID })

      if (routeID) this.showTransitRoute(routeID)
      else this.showTransitRoute(this.selectedRoute.id)

      this.showTransitStops()
    },

    async mapIsReady() {
      const networks = await this.loadNetworks()
      const projection = await this.guessProjection(networks)
      this.vizDetails.projection = projection
      this.projection = this.vizDetails.projection

      if (networks) this.processInputs(networks)

      // TODO remove for now until we research whether this causes a memory leak:
      // this.setupKeyListeners()
    },

    setupKeyListeners() {
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
    },

    fetchXML(props: { worker: any; slug: string; filePath: string; options?: any }) {
      let xmlWorker = props.worker

      xmlWorker.onmessage = (message: MessageEvent) => {
        // message.data will have .id and either .error or .xml
        const { resolve, reject } = this.resolvers[message.data.id]

        xmlWorker.terminate()

        if (message.data.error) reject(message.data.error)
        resolve(message.data.xml)
      }

      // save the promise by id so we can look it up when we get messages
      const id = this.resolverId++

      xmlWorker.postMessage({
        id,
        fileSystem: this.fileSystem,
        filePath: props.filePath,
        options: props.options,
      })

      const promise = new Promise((resolve, reject) => {
        this.resolvers[id] = { resolve, reject }
      })
      return promise
    },

    async updateStatus(message: string) {
      this.loadingText = message
    },

    async loadAvroRoadNetwork() {
      const filename = `${this.subfolder}/${this.vizDetails.network}`
      const blob = await this.fileApi.getFileBlob(filename)

      const records: any[] = await new Promise((resolve, reject) => {
        const rows = [] as any[]
        avro
          .createBlobDecoder(blob)
          .on('metadata', (schema: any) => {
            // console.log(schema)
          })
          .on('data', (row: any) => {
            rows.push(row)
          })
          .on('end', () => {
            resolve(rows)
          })
      })

      // console.log({ records })
      this.avroNetwork = records[0]
      return records[0]
    },

    async loadNetworks() {
      try {
        if (!this.fileSystem || !this.vizDetails.network || !this.vizDetails.transitSchedule) return

        this.loadingText = 'Loading networks...'

        const filename = this.vizDetails.network

        const roads =
          filename.indexOf('.avro') > -1
            ? // AVRO networks have a separate reader:
              this.loadAvroRoadNetwork()
            : // normal MATSim network
              this.fetchXML({
                worker: this._roadFetcher,
                slug: this.fileSystem.slug,
                filePath: this.myState.subfolder + '/' + this.vizDetails.network,
                options: { attributeNamePrefix: '' },
              })

        const transit = this.fetchXML({
          worker: this._transitFetcher,
          slug: this.fileSystem.slug,
          filePath: this.myState.subfolder + '/' + this.vizDetails.transitSchedule,
          options: {
            attributeNamePrefix: '',
            alwaysArray: [
              'transitSchedule.transitLine.transitRoute',
              'transitSchedule.transitLine.transitRoute.departures.departure',
            ],
          },
        })

        // and wait for them to all complete
        const results = await Promise.all([roads, transit])
        return { roadXML: results[0], transitXML: results[1], ridership: [] }
      } catch (e) {
        console.error('TRANSIT:', e)
        this.loadingText
        this.$emit('error', '' + e)
        return null
      }
    },

    loadDemandData(filename: string): Promise<any[]> {
      const promise: Promise<any[]> = new Promise<any[]>((resolve, reject) => {
        if (!filename) resolve([])
        this.loadingText = 'Loading demand...'
        const worker = new GzipWorker() as Worker

        worker.onmessage = (event: MessageEvent) => {
          this.loadingText = 'Processing demand...'
          worker.terminate()

          if (event.data.error) {
            this.$emit('error', event.data.error)
            this.loadingText = ''
            return
          }

          const csvData = new TextDecoder('utf-8').decode(event.data)

          Papa.parse(csvData, {
            // preview: 10000,
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            worker: true,
            complete: (results: any) => {
              resolve(this.processDemand(results))
            },
          })
        }

        worker.postMessage({
          filePath: this.myState.subfolder + '/' + filename,
          fileSystem: this.fileSystem,
        })
      })
      return promise
    },

    processDemand(results: any) {
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
          Math.round(
            (1000 * linkPassengersById[transitLink.properties.id]) /
              capacity[transitLink.properties.id]
          ) / 1000
      }

      this.metrics = this.metrics.concat([
        { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
        { field: 'loadfac', name_en: 'Load Factor', name_de: 'Auslastung' },
      ])

      const source = this.mymap.getSource('transit-source') as GeoJSONSource
      source.setData(this._transitLinks)

      this.loadingText = ''
      return []
    },

    async processInputs(networks: NetworkInputs) {
      this.loadingText = 'Preparing...'
      // spawn transit helper web worker
      this._transitHelper = new TransitSupplyWorker()

      this._transitHelper.onmessage = async (buffer: MessageEvent) => {
        this.receivedProcessedTransit(buffer)
      }

      this._transitHelper.postMessage({
        xml: networks,
        projection: this.projection,
      })
    },

    async receivedProcessedTransit(buffer: MessageEvent) {
      if (buffer.data.status) {
        this.loadingText = buffer.data.status
        return
      }

      if (buffer.data.error) {
        console.error(buffer.data.error)
        this.$emit('error', buffer.data.error)
        return
      }

      const { network, routeData, stopFacilities, transitLines, mapExtent } = buffer.data

      this._network = network
      this._routeData = routeData
      this._stopFacilities = stopFacilities
      this._transitLines = transitLines
      this._mapExtentXYXY = mapExtent

      this._transitHelper.terminate()

      this.loadingText = 'Summarizing departures...'

      // Use custom colors if they exist, otherwise use defaults
      if (this.vizDetails.customRouteTypes && this.vizDetails.customRouteTypes.length > 0) {
        this.routeColors = this.vizDetails.customRouteTypes
      } else {
        this.routeColors = DEFAULT_ROUTE_COLORS
      }

      await this.processDepartures()

      // Build the links layer and add it
      this._transitLinks = await this.constructDepartureFrequencyGeoJson()
      this.addTransitToMap(this._transitLinks)

      this.handleClickedMetric({ field: 'departures' })

      localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))
      this.mymap.fitBounds(this._mapExtentXYXY, { animate: false })

      if (this.vizDetails.demand) await this.loadDemandData(this.vizDetails.demand)

      this.loadingText = ''
    },

    async processDepartures() {
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
    },

    setTransitLayerOpacity(opacity: number) {
      const layer = this.mymap.getLayer('transit-link')
      if (!layer) return

      this.mymap.setPaintProperty('transit-link', 'line-opacity', opacity)
      this.mymap.setPaintProperty(
        'transit-link',
        'line-color',
        opacity == 1 ? ['get', 'color'] : '#888888'
      )
    },

    showAllTransit(show: boolean) {
      if (!show) {
        if (this.mymap.getLayer('transit-link')) this.mymap.removeLayer('transit-link')
        return
      }

      if (!this.mymap.getLayer('transit-link')) {
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
      }

      this.mymap.on('click', 'transit-link', (e: maplibregl.MapMouseEvent) => {
        this.clickedOnTransitLink(e)
      })

      // turn "hover cursor" into a pointer, so user knows they can click.
      this.mymap.on('mousemove', 'transit-link', (e: maplibregl.MapLayerMouseEvent) => {
        this.mymap.getCanvas().style.cursor = e ? 'pointer' : 'grab'
        this.hoveredOnElement(e)
      })

      // and back to normal when they mouse away
      this.mymap.on('mouseleave', 'transit-link', () => {
        this.mymap.getCanvas().style.cursor = 'grab'
        this.mapPopup.remove()
      })

      this.drawMetric()
    },

    addTransitToMap(geodata: any) {
      this._geoTransitLinks = geodata

      this.mymap.addSource('transit-source', {
        data: geodata,
        type: 'geojson',
      } as any)

      this.showAllTransit(true)
    },

    hoveredOnElement(event: any) {
      const props = event.features[0].properties

      let content = '<div class="map-popup">'

      for (const metric of this.metrics) {
        let label = this.$i18n.locale == 'de' ? metric.name_de : metric.name_en
        label = label.replaceAll(' ', '&nbsp;')

        if (!isNaN(props[metric.field]))
          content += `
          <div style="display: flex">
            <div>${label}:&nbsp;&nbsp;</div>
            <b style="margin-left: auto; text-align: right">${props[metric.field]}</b>
          </div>`
      }

      content += '<div>'
      this.mapPopup.setLngLat(event.lngLat).setHTML(content).addTo(this.mymap)
    },

    async constructDepartureFrequencyGeoJson() {
      const geojson = []
      this.usedLabels = []

      for (const linkID in this._departures) {
        if (this._departures.hasOwnProperty(linkID)) {
          const link = this._network.links[linkID] as any
          if (link == undefined) continue

          let coordinates

          try {
            if (this.avroNetwork) {
              // link is an INDEX to the link column arrays
              const nodeFrom = this.avroNetwork.from[link]
              const nodeTo = this.avroNetwork.to[link]

              const coordsFrom = this.avroNetwork.__nodes[nodeFrom]
              const coordsTo = this.avroNetwork.__nodes[nodeTo]
              coordinates = [coordsFrom, coordsTo]
            } else {
              // link is an object with values
              coordinates = [
                [this._network.nodes[link.from].x, this._network.nodes[link.from].y],
                [this._network.nodes[link.to].x, this._network.nodes[link.to].y],
              ]
            }
          } catch (e) {
            console.warn('' + e)
            continue
          }

          const departures = this._departures[linkID].total

          // shift scale from 0->1 to 0.25->1.0, because dark blue is hard to see on a black map
          // const ratio = 0.25 + (0.75 * (departures - 1)) / this._maximum
          // const colorBin = Math.floor(COLOR_CATEGORIES * ratio)

          let isRail = true
          let color = '#888'
          let hideThisLine = false // stores if this line should be hidden

          for (const route of this._departures[linkID].routes) {
            const props = this._routeData[route] as any

            // all match entries must match to select a color
            for (const config of this.routeColors) {
              hideThisLine = false
              if (config.hide) hideThisLine = true

              let matched = true
              for (const [key, pattern] of Object.entries(config.match) as any[]) {
                const valueForThisProp = props[key]
                // quit if route doesn't include this match property
                if (!valueForThisProp) {
                  matched = false
                  break
                }

                // because the gtfsRouteType is an integer or an integer array micromatch doesn't work
                if (key === 'gtfsRouteType') {
                  if (Array.isArray(pattern)) {
                    // array of gtfs values
                    if (!pattern.includes(valueForThisProp)) {
                      matched = false
                      break
                    }
                  } else {
                    // numeric - just one value
                    if (valueForThisProp !== pattern) {
                      matched = false
                      break
                    }
                  }
                } else {
                  // text-match the pattern
                  if (!match.isMatch(valueForThisProp, pattern)) {
                    matched = false
                    break
                  }
                }
              }
              // Set color and quit searching after first successful match
              // the label will only be added if the route should not be hidden
              if (matched) {
                color = config.color
                if (!this.usedLabels.includes(config.label) && !hideThisLine)
                  this.usedLabels.push(config.label)
                break
              }
            }
            // no rules matched; sad!
            if (color == '#888') console.log('OHE NOES', route)
          }

          let line = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            properties: {
              color: color, // isRail ? '#a03919' : _colorScale[colorBin],
              // colorBin: colorBin,
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

          // Add the line to the geojson array only if the line should not be hidden
          if (!hideThisLine) geojson.push(line)
        }
      }

      geojson.sort(function (a: any, b: any) {
        if (a.isRail && !b.isRail) return -1
        if (b.isRail && !a.isRail) return 1
        return 0
      })

      return { type: 'FeatureCollection', features: geojson }
    },

    offsetLineByMeters(line: any, metersToTheRight: number) {
      try {
        const offsetLine = turf.lineOffset(line, metersToTheRight, { units: 'meters' })
        return offsetLine
      } catch (e) {
        // offset can fail if points are exactly on top of each other; ignore.
      }
      return line
    },

    removeStopMarkers() {
      this.stopMarkers = []
      this.stopHTML.html = ''
    },

    showTransitStops() {
      this.removeStopMarkers()

      const route = this.selectedRoute
      const stopSizeClass = 'stopmarker' // this.mymap.getZoom() > SHOW_STOPS_AT_ZOOM_LEVEL ? 'stop-marker-big' : 'stop-marker'
      const mapBearing = this.mymap.getBearing()

      let bearing

      const markers = []

      for (const [i, stop] of route.routeProfile.entries()) {
        const stopFacility = this._stopFacilities[stop.refId]
        const coord = [stopFacility.x, stopFacility.y]
        // const coord = [this._stopFacilities[stop.refId].x, this._stopFacilities[stop.refId].y]

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
        const marker = {
          i,
          bearing,
          xy: { x: Math.floor(xy.x), y: Math.floor(xy.y) },
          name: stopFacility.name || '',
          id: stopFacility.id || '',
          linkRefId: stopFacility.linkRefId || '',
        }
        markers.push(marker)
      }
      this.stopMarkers = markers
    },

    showTransitRoute(routeID: string) {
      if (!routeID) return

      this.stopHTML.html = ''

      const route = this._routeData[routeID]
      // console.log({ selectedRoute: route })

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
            'line-width': 7, // ['get', 'width'],
            'line-color': '#fbff66', // 95f', // ['get', 'color'],
          },
        })
      }
    },

    removeSelectedRoute() {
      if (this.selectedRoute) {
        try {
          if (this.mymap.getLayer('selected-route')) this.mymap.removeLayer('selected-route')
        } catch (e) {
          // oh well
        }
        this.selectedRoute = null
      }
    },

    clickedOnTransitLink(e: any) {
      this.removeStopMarkers()
      this.removeSelectedRoute()

      // the browser delivers some details that we need, in the fn argument 'e'
      const props = e.features[0].properties

      console.log('CLICKED ON', props.id)

      const routeIDs = this._departures[props.id].routes

      this.calculatePassengerVolumes(props.id)

      const routes = []
      for (const id of routeIDs) {
        routes.push(this._routeData[id])
      }

      // sort by highest departures first
      routes.sort(function (a, b) {
        return a.departures > b.departures ? -1 : 1
      })

      this.routesOnLink = routes
      this.highlightAllAttachedRoutes()

      // highlight the first route, if there is one
      if (routes.length > 0) this.showRouteDetails(routes[0].id)

      this.setTransitLayerOpacity(0.2)
    },

    calculatePassengerVolumes(id: string) {
      let empty = { departures: 0, pax: 0, loadfac: 0 }

      const found = this._transitLinks.features.find((link: any) => link.properties.id == id)

      console.log({ found })

      this.summaryStats = found ? found.properties : empty
    },

    //   if (!this.cfDemandLink || !this.cfDemand) return

    //   this.cfDemandLink.filter(id)

    //   const allLinks = this.cfDemand.allFiltered()
    //   let sum = 0

    //   allLinks.map(d => {
    //     // sum = sum + d.passengersBoarding + d.passengersAtArrival - d.passengersAlighting
    //     sum += d.passengersAtArrival
    //   })

    //   console.log({ sum, allLinks })
    //   this.currentLinkPax = sum
    // },

    removeAttachedRoutes() {
      for (const layerID of this._attachedRouteLayers) {
        try {
          this.mymap.removeLayer('route-' + layerID)
          this.mymap.removeSource('source-route-' + layerID)
        } catch (e) {
          //meh
        }
      }
      this._attachedRouteLayers = []
    },

    highlightAllAttachedRoutes() {
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
            'line-opacity': 0.9,
            'line-width': 10, // ['get', 'width'],
            'line-color': '#44c378', // '#ccff33', // ['get', 'color'],
          },
        })
        this._attachedRouteLayers.push(route.id)
        this.mymap.on('click', 'route-' + route.id, (e: maplibregl.MapMouseEvent) => {
          console.log('click!', e)
          this.clickedOnTransitLink(e)
        })
      }
    },

    pressedEscape() {
      this.removeSelectedRoute()
      this.removeStopMarkers()
      this.removeAttachedRoutes()

      this.selectedRoute = null
      this.routesOnLink = []
    },

    pressedArrowKey(delta: number) {
      if (!this.selectedRoute) return

      let i = this.routesOnLink.indexOf(this.selectedRoute)
      i = i + delta

      if (i < 0 || i >= this.routesOnLink.length) return

      this.showRouteDetails(this.routesOnLink[i].id)
    },

    clearData() {
      this._attachedRouteLayers = []
      this._departures = {}
      this._mapExtentXYXY = [180, 90, -180, -90]
      this._maximum = 0
      this._network = { nodes: {}, links: {} }
      this._routeData = {}
      this._stopFacilities = {}
      this._transitLinks = null
      this._transitLines = {}
      this.selectedRoute = null
      this.cfDemand = null
      this.cfDemandLink?.dispose()
      this.resolvers = {}
      this.routesOnLink = []
      this.selectedRoute = {}
      this.stopMarkers = []
      this._linkData = null
      this._geoTransitLinks = null
    },
  },

  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.debounceHandleSearchText = debounce(this.handleSearchText, 350)
    this.clearData()

    this._roadFetcher = new NewXmlFetcher()
    this._transitFetcher = new NewXmlFetcher()
    this._transitHelper = new TransitSupplyWorker()

    // populate props after we attach, not before!
    this.myState.subfolder = this.subfolder
    this.myState.yamlConfig = this.yamlConfig ?? ''
    this.myState.thumbnail = this.thumbnail

    const status = await this.getVizDetails()
    if (!status) return

    if (this.thumbnail) return

    await this.prepareView()
    this.setupMap()
  },

  beforeDestroy() {
    if (this.mymap) this.mymap.remove()

    this.clearData()

    if (this.xmlWorker) this.xmlWorker.terminate()
    if (this._roadFetcher) this._roadFetcher.terminate()
    if (this._transitFetcher) this._transitFetcher.terminate()
    if (this._transitHelper) this._transitHelper.terminate()

    this.$store.commit('setFullScreen', false)
  },
})

const _colorScale = colormap({ colormap: 'viridis', nshades: COLOR_CATEGORIES })

export default MyComponent
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
  margin: 0px 0px;
}

.transit-popup {
  padding: 0px 0px;
  margin: 0px 0px;
  border-style: solid;
  border-width: 0px 0px 0px 20px;
}

.transit-viz {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  // background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  // pointer-events: none;
}

.map-container {
  position: relative;
  flex: 1;
  pointer-events: auto;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-color: #eee;
  background-size: cover;
  min-height: $thumbnailHeight;
}

.hide-thumbnail {
  background: none;
  z-index: 0;
}

.control-panel {
  position: absolute;
  bottom: 0;
  display: flex;
  flex-direction: row;
  font-size: 0.8rem;
  margin: 0 0 0.5rem 0.5rem;
  pointer-events: auto;
  background-color: var(--bgPanel);
  padding: 0.5rem 0.5rem;
  filter: drop-shadow(0px 2px 4px #22222233);
}

.is-dashboard {
  position: static;
  margin: 0 0;
  padding: 0.25rem 0 0 0;
  filter: unset;
  background-color: unset;
}

.legend {
  background-color: var(--bgPanel);
  padding: 0.25rem 0.5rem;
}

.control-label {
  margin: 0 0;
  font-size: 0.8rem;
  font-weight: bold;
}

.route {
  padding: 5px 0px;
  text-align: left;
  color: var(--text);
}

.route:hover {
  background-color: var(--bgCream3);
  cursor: pointer;
}

h3 {
  margin: 0px 0px;
  font-size: 1.5rem;
  line-height: 1.7rem;
}

.route-title {
  font-weight: bold;
  line-height: 1.2rem;
  margin: 0 0.25rem;
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

.stop-html {
  position: absolute;
  top: 0;
  left: 0;
  background-color: var(--bgPanel);
  padding: 0.25rem;
  line-height: 1.1rem;
  z-index: 2;
}

.stop-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  background: url('assets/icon-stop-triangle.png') no-repeat;
  transform: translate(-50%, -50%);
  background-size: 100%;
  // pointer-events: none;
  z-index: 1;
  cursor: pointer;
}

.help-text {
  color: #ccc;
}

.panel-items {
  flex: 1;
  color: var(--text);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
  margin: 0;
  font-size: 0.9rem;
}

.panel-item {
  display: flex;
  flex-direction: column;

  h3 {
    padding: 0.5rem 1rem 1.5rem 0.5rem;
  }
}

.route-list {
  position: absolute;
  top: 0;
  bottom: 0;
  user-select: none;
  overflow-x: hidden;
  cursor: pointer;
  scrollbar-color: #888 var(--bgCream);
  -webkit-scrollbar-color: #888 var(--bgCream);
  width: 100%;

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
  flex-direction: row;
  gap: 0px;
  margin: 0.25rem 0.5rem 0.25rem 0;
}

.metric-button {
  border-radius: 0;
  flex: 1;
}

.detailed-route-data {
  display: flex;
  flex-direction: row;
  padding: 0 0.25rem;
}

.col {
  display: flex;
  flex-direction: column;
  line-height: 1.1rem;
}

.map-styles {
  height: 100%;
}

.status-corner {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  flex-direction: row;
  background-color: var(--bgPanel);
  padding: 0rem 3rem;
  margin: auto auto;
  width: 25rem;
  height: 4rem;
  border: 3px solid #cccccc80;
  // filter: $filterShadow;

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
    line-height: 2.6rem;
    margin: auto auto auto auto;
    padding: 0 0;
    text-align: center;
  }
}

.main-layout {
  display: grid;
  // one unit, full height/width. Layers will go on top:
  grid-template-rows: 1fr;
  grid-template-columns: 1fr auto auto;
  min-height: $thumbnailHeight;
  height: 100%;
  background-color: var(--bg);
}

.map-layout.hide-thumbnail {
  background: unset;
  z-index: 0;
}

.area-map {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  background-color: var(--bgBold);
  position: relative;
}

.map-layers {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.dragger {
  grid-row: 1 / 2;
  grid-column: 2 / 3;
  width: 0.5rem;
  background-color: var(--bgBold);
  user-select: none;
  z-index: 20;
}

.dragger:hover,
.dragger:active {
  background-color: var(--sliderThumb);
  transition: background-color 0.3s ease;
  transition-delay: 0.1s;
  cursor: ew-resize;
}

.link-summary {
  margin-bottom: 1rem;
  margin-right: 0.5rem;
  // border: 1px solid #80808066;
  // padding: 0.25rem;
}

.searchbox {
  margin-top: 0.25rem;
}

.new-rightside-info-panel {
  grid-row: 1 / 2;
  grid-column: 3 / 4;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);

  .legend {
    margin: 0.5rem 0.25rem 0.25rem 0rem;
    display: flex;
    flex-direction: column;
    background-color: var(--bgCardFrame);
    border: 1px solid #88888844;
    .description {
      margin-top: 0.5rem;
    }
  }

  .tooltip-html {
    font-size: 0.8rem;
    padding: 0.25rem;
    text-align: left;
    background-color: var(--bgCardFrame);
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid #88888880;
  }
}
</style>
