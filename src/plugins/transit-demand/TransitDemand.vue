<template lang="pug">
  .transit-viz(:class="{'hide-thumbnail': !thumbnail}")

    //- @mousemove.stop
    .main-layout(v-if="!thumbnail"
      @mousemove="dividerDragging"
      @mouseup="dividerDragEnd"
    )
      .dragger(
        @mousedown="dividerDragStart"
        @mouseup="dividerDragEnd"
        @mousemove.stop="dividerDragging"
      )

      .map-container(:class="{'hide-thumbnail': !thumbnail }" oncontextmenu="return false")

          transit-layers.map-styles(v-if="transitLinks?.features.length"
            :viewId="viewId"
            :links="transitLinks"
            :selectedFeatures="selectedFeatures"
            :stopMarkers="stopMarkers"
            :handleClickEvent="handleMapClick"
            :pieSlider="pieSlider"
            :widthSlider="widthSlider"
            :transitLines="activeTransitLines"
            :vizDetails="vizDetails"
          )

          .width-sliders.flex-row(v-if="transitLines.length" :style="{backgroundColor: isDarkMode ? '#00000099': '#ffffffaa'}")
              //- width slider
              img.icon-blue-ramp(:src="icons.blueramp")
              b-slider.pie-slider(type="is-success" :tooltip="false" size="is-small"  v-model="widthSlider")
              //- pie slider
              img.icon-pie-slider(v-if="crossFilters.length" :src="icons.piechart")
              b-slider.pie-slider(v-if="crossFilters.length" type="is-success" :tooltip="false" size="is-small"  v-model="pieSlider")

          zoom-buttons

          .status-corner(v-if="loadingText")
            p {{ loadingText }}
            b-progress.load-progress(v-if="loadProgress > 0"
              :value="loadProgress" :rounded="false" type='is-success')

      .right-panel-holder(:style="{width: `${legendSectionWidth}px`}")

        .right-side-column

          p(style="margin-top: 0.25rem")
            b TRANSIT INSPECTOR

          .panel-item(v-if="metrics.length > 1")
            .metric-buttons
              button.button.is-small.metric-button(
                v-for="metric,i in metrics" :key="metric.field"
                :style="{'color': activeMetric===metric.field ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'background-color': activeMetric===metric.field ? buttonColors[i] : isDarkMode ? '#333':'white'}"
                @click="handleClickedMetric(metric)") {{ $i18n.locale === 'de' ? metric.name_de : metric.name_en }}

          //- p(v-if="transitLines.length" style="margin: 0.75rem 0 0rem 0"): b LINES AND ROUTES

          b-input.searchbox(v-if="transitLines.length"
            v-model="searchText" style="padding: 0rem 0.5rem 0.75rem 0" size="is-small" placeholder="Search line ID or /regex/"
          )

          .transit-lines.flex-col.flex1

            lazy-list.flex1(
              :highlightedTransitLines="highlightedTransitLines"
              :listProps="routeListProps"
            )

          .summary-stats.flex-col
            .sum-stat-title: b SUMMARY STATISTICS
            p(:style="{visibility: selectedRouteIds.length ? 'visible' : 'hidden'}")
              b {{ selectedRouteIds.length }}
              | &nbsp; selected route{{ selectedRouteIds.length != 1 ? 's':''}}
            .flex-row(:style="{visibility: selectedRouteIds.length ? 'visible':'hidden', gap: '0.5rem'}")
              .aa
                b {{ summaryStats.departures }}
                | &nbsp;Departures
              .aa(v-if="crossFilters.length")
                b {{ summaryStats.pax }}
                | &nbsp;Passengers

          legend-box.legend(v-if="!thumbnail"
            :rows="legendRows"
            @click="clickedLegend"
          )

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
import Papa from '@simwrapper/papaparse'
import yaml from 'yaml'
import match from 'micromatch'
import naturalSort from 'javascript-natural-sort'
import { color } from 'd3-color'

import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LeftDataPanel from '@/components/LeftDataPanel.vue'
import { Network, NetworkInputs, NetworkNode, TransitLine, RouteDetails } from './Interfaces'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'
import TransitSupplyWorker from './TransitSupplyHelper.worker?worker'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import TransitLayers from './TransitLayers'
import LegendBox from './LegendBox.vue'
import RouteDropDown from './RouteDropDown.vue'
import LazyList from './LazyList.vue'

import {
  FileSystem,
  FileSystemConfig,
  ColorScheme,
  VisualizationPlugin,
  REACT_VIEW_HANDLES,
} from '@/Globals'

import GzipWorker from '@/workers/GzipFetcher.worker?worker'
import IconPieChart from './assets/icon-pie-chart.png'
import IconBlueRamp from './assets/icon-blue-ramp.png'

const DEFAULT_PROJECTION = 'EPSG:31468' // 31468' // 2048'
const COLOR_CATEGORIES = 10
const SHOW_STOPS_AT_ZOOM_LEVEL = 11

interface PtData {
  name: string
  a: number
  b: number
}

interface StopLevelData {
  [ptLine: string]: PtData | number
}

const DEFAULT_ROUTE_COLORS = [
  // ---------------------------------------------------
  // GTFS codes first, they are most accurate.
  {
    match: {
      gtfsRouteType: [3, 700, 701, 702, 703, 704],
    },
    color: '#95276E',
    label: 'Bus (GTFS)',
  },
  {
    match: {
      gtfsRouteType: [109],
    },
    color: '#408335',
    label: 'S-Bahn (GTFS)',
  },
  {
    match: {
      gtfsRouteType: [401, 402],
    },
    color: '#115D91',
    label: 'U-Bahn (GTFS)',
  },
  {
    match: {
      gtfsRouteType: [0, 3, 900, 901, 902, 903, 904, 905, 906],
    },
    color: '#BE1414',
    label: 'Tram (GTFS)',
  },
  {
    match: {
      gtfsRouteType: [4, 1000, 1200],
    },
    color: '#0480c1',
    label: 'Ferry (GTFS)',
  },
  // ---------------------------------------------------
  // MATSim transportMode and string-id next; less accurate but consistent.
  {
    match: {
      transportMode: ['rail', 'subway'],
      id: 'U*',
    },
    color: '#115D91',
    label: 'U-Bahn',
  },
  {
    match: {
      transportMode: 'rail',
      id: 'S*',
    },
    color: '#408335',
    label: 'S-Bahn',
  },
  {
    match: {
      transportMode: 'ferry',
    },
    color: '#0480c1',
    label: 'Ferry',
  },
  {
    match: {
      transportMode: 'tram',
    },
    color: '#9E1444',
    label: 'Tram',
  },
  {
    match: { transportMode: 'pt' },
    color: '#05c',
    label: 'Public Transport',
  },
  {
    match: {
      transportMode: 'rail',
    },
    color: '#EC0016 ',
    label: 'Train',
  },
  {
    match: { transportMode: 'train' },
    color: '#0a0',
    label: 'Rail',
  },
  {
    match: {
      transportMode: 'bus',
    },
    color: '#95276E',
    label: 'Bus',
  },
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
  components: {
    CollapsiblePanel,
    DrawingTool,
    LeftDataPanel,
    LegendBox,
    RouteDropDown,
    TransitLayers,
    ZoomButtons,
    LazyList,
  },

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
      viewId: Math.floor(1e12 * Math.random()),

      icons: {
        piechart: IconPieChart,
        blueramp: IconBlueRamp,
      },

      loadProgress: 0,
      loadSteps: 0,
      totalLoadSteps: 7,
      searchText: '',
      //drag
      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 275,
      //
      stopHTML: { html: '', x: 0, y: 0 },
      buttonColors: ['#5E8AAE', '#BF7230', '#269367', '#9C439C'],
      metrics: metrics,
      activeMetric: metrics[0].field as any,
      activeRoutes: [] as RouteDetails[],
      checkedTransitLines: [] as string[],
      vizDetails: {
        transitSchedule: '',
        network: '',
        demand: '',
        ptStop2stopFile: '',
        projection: '',
        title: '',
        description: '',
        colors: [] as { match: any; color: string; label: string; hide: boolean }[],
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
      isHighlightingLink: false,
      loadingText: 'MATSim Transit Inspector',
      projection: DEFAULT_PROJECTION,
      routesOnLink: [] as RouteDetails[],
      selectedLinkId: '',
      selectedRouteIds: [] as string[],
      selectedTransitLine: '',
      selectedFeatures: [] as any[],
      summaryStats: { departures: 0, pax: 0, loadfac: 0 },
      stopMarkers: [] as any[],
      _departures: {} as { [linkID: string]: Departure },
      _mapExtentXYXY: null as any,
      _maximum: -Infinity,
      _network: {} as Network,
      transitLinks: { type: 'FeatureCollection', features: [] } as any, // GeoJSON.FeatureCollection,
      transitLinkOffset: {} as { [linkId: string]: number },
      routeData: {} as { [index: string]: RouteDetails },
      _stopFacilities: {} as { [index: string]: NetworkNode },

      transitLines: [] as TransitLine[],
      highlightedTransitLineIds: new Set(),

      _roadFetcher: {} as any,
      _transitFetcher: {} as any,
      _transitHelper: {} as any,

      pieSlider: 20,
      widthSlider: 20,

      resolvers: {} as { [id: number]: any },
      resolverId: 0,
      xmlWorker: null as null | Worker,
      crossFilters: [] as {
        cfDemand: crossfilter.Crossfilter<any>
        cfDemandLink: crossfilter.Dimension<any, any>
        cfDemandStop: crossfilter.Dimension<any, any>
      }[],

      stopLevelDemand: {} as {
        [id: string]: {
          b: number
          a: number
          ptLines: { [ptLineId: string]: { name: string; b: number; a: number } }
        }
      },

      routeColors: [] as { match: any; color: string; label: string; hide: boolean }[],
      usedLabels: [] as string[],

      listComponent: RouteDropDown,
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

    routeListProps() {
      return {
        activeTransitLines: this.activeTransitLines,
        selectedRoutes: this.selectedRouteIds,
        searchTerm: this.searchTermClean,
        color: '#06f',
        cbToggleLineChecked: this.toggleLineChecked,
        cbToggleLineOpen: this.toggleLineOpen,
        cbToggleRouteChecked: this.toggleRouteChecked,
      }
    },

    searchTermClean() {
      return this.searchText.trim().toLocaleLowerCase()
    },

    highlightedTransitLines() {
      const showAll = !this.highlightedTransitLineIds.size
      this.transitLines.forEach(line => {
        line.show = showAll || this.highlightedTransitLineIds.has(line.id)
      })
      return [...this.transitLines]
    },

    activeTransitLines() {
      const lines = {} as {
        [id: string]: { id: string; routes: RouteDetails[]; isOpen: boolean; stats: any }
      }

      this.routesOnLink.forEach(route => {
        if (!(route.lineId in lines)) {
          lines[route.lineId] = {
            id: route.lineId,
            routes: [],
            isOpen: false,
            stats: {
              departures: 0,
              pax: 0,
              cap: 0,
            },
          }
        }
        lines[route.lineId].routes.push(route)
      })

      // if (!this.selectedLinkId) return lines

      // store demand data for these links
      const demandLookup = {} as { [routeId: string]: any[] }

      // run the cross filters for each data subsection
      this.crossFilters.forEach(cf => {
        cf.cfDemandStop.filterAll()
        cf.cfDemandLink.filter((id: any) => id.indexOf(this.selectedLinkId) > -1)
        let demandData = cf.cfDemand.allFiltered()
        if (demandData) {
          demandData.forEach(row => {
            if (!(row.transitRoute in demandLookup)) demandLookup[row.transitRoute] = []
            demandLookup[row.transitRoute].push(row)
          })
        }
      })

      Object.values(lines).forEach(line => {
        // sort by nice names
        line.routes.sort((a, b) => naturalSort(a.id, b.id))

        // statistics
        line.routes.forEach(route => {
          route.pax = 0
          route.cap = 0
          line.stats.departures += route.departures
          const routeRuns = demandLookup[route.id]
          if (routeRuns) {
            const pax = routeRuns.reduce((a, b) => {
              return a + b.passengersAtArrival
            }, 0)
            line.stats.pax += pax
            route.pax += pax

            const cap = routeRuns.reduce((a, b) => {
              return a + b.totalVehicleCapacity
            }, 0)
            line.stats.cap += cap
            route.cap += cap
          }
          route.loadfac = route.pax / route.cap
        })
      })

      return lines
    },

    legendRows(): string[][] {
      return this.routeColors
        .filter(r => this.usedLabels.includes(r.label))
        .map(r => [r.color, r.label])
    },
  },

  watch: {
    '$store.state.viewState'() {
      if (!REACT_VIEW_HANDLES[this.viewId]) return
      REACT_VIEW_HANDLES[this.viewId]()
    },

    '$store.state.colorScheme'() {
      this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
      this.highlightAllAttachedRoutes()
    },

    selectedRouteIds() {
      this.showTransitRoutes()
      this.showTransitStops()
      this.updateSummaryStats()
    },

    searchText() {
      this.debounceHandleSearchText()
    },
  },

  methods: {
    clickedLegend(e: any) {
      console.log('boop!', e)
    },

    toggleRouteChecked(props: { route: string; isChecked: boolean }) {
      if (props.isChecked) {
        // highlight if checked
        this.routesOnLink.push(this.routeData[props.route])
      } else {
        // remove
        this.routesOnLink = this.routesOnLink.filter(route => route.id !== props.route)
      }

      if (this.routesOnLink.length) {
        this.highlightAllAttachedRoutes()
      } else {
        this.selectedLinkId = ''
        this.resetLinkColors()
        this.highlightedTransitLineIds = new Set()
        // trigger redraw
        this.transitLinks = { ...this.transitLinks }
      }

      this.selectedRouteIds = this.routesOnLink.map(route => route.id)
    },

    toggleLineOpen(event: { offset: number; isOpen: boolean }) {
      const line = this.transitLines[event.offset]
      line.isOpen = event.isOpen
    },

    toggleLineChecked(event: { offset: number; isChecked: boolean }) {
      const line = this.transitLines[event.offset]
      const lineTerm = line.id.toLocaleLowerCase()
      line.check = event.isChecked

      const foundRoutes = Object.values(this.routeData).filter(
        route => route.lineId.toLocaleLowerCase() == lineTerm
      )

      if (line.check) {
        // add routes that are not already present
        foundRoutes.forEach(route => {
          if (!this.selectedRouteIds.includes(route.id)) this.routesOnLink.push(route)
        })
        this.selectedTransitLine = line.id
      } else {
        // remove highlighted routes
        const foundIds = foundRoutes.map(r => r.id)
        this.routesOnLink = this.routesOnLink.filter(route => !foundIds.includes(route.id))
      }

      this.selectedRouteIds = this.routesOnLink.map(route => route.id)

      // console.log('new routes on link', this.routesOnLink)
      if (this.routesOnLink.length) {
        this.highlightAllAttachedRoutes()
      } else {
        this.selectedLinkId = ''
        this.resetLinkColors()
        this.highlightedTransitLineIds = new Set()
        // trigger redraw
        this.transitLinks = { ...this.transitLinks }
      }
    },

    updateSummaryStats() {
      this.summaryStats = { departures: 0, pax: 0, loadfac: 0 }
      for (const routeId of this.selectedRouteIds) {
        const r = this.routeData[routeId]
        if (r.departures) this.summaryStats.departures += r.departures
        if (r.pax) this.summaryStats.pax += r.pax
      }
    },

    handleMapClick(e: any) {
      if (e.index > -1 && e.layer?.id === 'linkLayer') {
        // clicked on a link thing
        this.clickedOnTransitLink(e.index)
      } else if (e.index > -1) {
        // clicked on some other object
        return
      } else {
        // empty map click
        this.handleEmptyClick(true, false)
      }
    },

    incrementLoadProgress() {
      this.loadSteps += 1
      this.loadProgress = (100 * this.loadSteps) / this.totalLoadSteps
    },

    handleSearchText() {
      this.handleEmptyClick(null, true)
      this.selectedLinkId = ''

      const searchTerm = this.searchText.trim().toLocaleLowerCase()

      if (!searchTerm) {
        this.resetLinkColors()
        return
      }

      let foundRoutes = [] as any[]
      let foundLines = [] as any[]
      let regexp

      // user provided /regex/ ?
      if (searchTerm.startsWith('/') && searchTerm.endsWith('/')) {
        const regexTerm = this.searchText.slice(1, this.searchText.length - 1)
        regexp = new RegExp(regexTerm, 'gu') // global, unicode
      }

      if (regexp) {
        foundRoutes = Object.keys(this.routeData).filter(routeID => routeID.match(regexp))
        foundLines = this.transitLines.filter(line => line.id.match(regexp)).map(line => line.id)
      } else {
        foundRoutes = Object.keys(this.routeData).filter(
          routeID => routeID.toLocaleLowerCase().indexOf(searchTerm) > -1
        )
        foundLines = this.transitLines
          .filter(line => line.id.toLocaleLowerCase().indexOf(searchTerm) > -1)
          .map(line => line.id)
      }

      // show selected route snakepaths
      this.routesOnLink = foundRoutes.map(id => this.routeData[id])
      this.highlightAllAttachedRoutes()

      // show found lines in list
      this.highlightedTransitLineIds = new Set(foundLines)
      this.selectedRouteIds = this.routesOnLink.map(route => route.id)
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
        ptStop2stopFile: '',
        projection: '',
        colors: [],
      }

      this.$emit('title', title)
      return true
    },

    async findInputFiles() {
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)

      let network = this.vizDetails.network
      // First see if we have an avro network
      // network.includes(".avro")
      if (!network) {
        const avroNetworkFiles = files
          .filter(f => f.toLocaleLowerCase().endsWith('.avro'))
          .filter(f => f.toLocaleLowerCase().indexOf('network') > -1)
        if (avroNetworkFiles.length) {
          console.log('avro network found')
          network = avroNetworkFiles[0]
        }
        if (avroNetworkFiles.length > 1)
          console.warn('MULTIPLE Avro files found - using first of ', avroNetworkFiles)
      }

      // Try the most obvious network filename:
      if (!network) network = this.myState.yamlConfig.replaceAll('transitSchedule', 'network')

      // if the obvious network file doesn't exist, just grab... the first network file:
      if (files.indexOf(network) == -1) {
        const allNetworks = files.filter(f => f.endsWith('network.xml.gz'))
        if (allNetworks.length) network = allNetworks[0]
        else {
          this.loadingText = 'No road network found.'
          network = ''
        }
      }
      // Demand: use them if we are in an output folder (and they exist)
      let demandFiles = [] as string[]
      if (this.myState.yamlConfig.indexOf('output_transitSchedule') > -1) {
        try {
          const analysisPtFolder = await this.fileApi.getDirectory(
            `${this.myState.subfolder}/analysis/pt/`
          )
          demandFiles = analysisPtFolder.files.filter(f => f.includes('pt_pax_volumes.'))
        } catch (e) {
          // we can skip pax loads if file not found
          console.warn('error', '' + e)
        }
      }

      // Save everything
      this.vizDetails.network = network
      if (demandFiles.length) this.vizDetails.demand = `analysis/pt/${demandFiles[0]}`
    },

    async guessProjection(networks: any): Promise<string> {
      // 00. If it's in config, use it
      if (this.vizDetails.projection) return this.vizDetails.projection
      if (this.config?.projection) return this.config.projection

      // 0. If it's in the AVRO network, use it
      if (networks?.roadXML?.crs) return networks?.roadXML?.crs

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

    // setupMap() {
    //   try {
    //     const extent = localStorage.getItem(this.$route.fullPath + '-bounds')

    //     if (extent) {
    //       try {
    //         const lnglat = JSON.parse(extent)
    //         const mFac = this.isMobile() ? 0 : 1
    //         const padding = { top: 50 * mFac, bottom: 50 * mFac, right: 50 * mFac, left: 50 * mFac }
    //       } catch (e) {
    //         // ignore this, it's ok
    //       }
    //     }
    //   } catch (e) {
    //     console.warn('' + e)

    //     // no worries
    //   }
    // },

    drawMetric() {
      let widthExpression: any = 3

      this.transitLinks.features.forEach((link: any) => {
        let width = 1
        switch (this.activeMetric) {
          case 'departures':
            width = link.properties.departures
            break
          case 'pax':
            width = link.properties.pax
            break
          case 'loadfac':
            width = link.properties.loadfac * 10000
            break
        }
        link.properties.width = width
      })

      this.transitLinks = { ...this.transitLinks }
    },

    handleClickedMetric(metric: { field: string }) {
      console.log('metric:', metric.field)
      this.activeMetric = metric.field
      this.drawMetric()
    },

    handleEmptyClick(e: any, force?: boolean) {
      // this is here because zeroing out the search box also cascades the zeroing out
      // of our selected link. Bad!
      if (!e && this.isHighlightingLink) {
        this.isHighlightingLink = false
        return
      }

      this.isHighlightingLink = false
      this.highlightedTransitLineIds = new Set()

      // clear search box if user clicked away
      if (!force) this.searchText = ''

      // don't clear map if search box has text
      if (this.searchText && !force) return

      this.removeStopMarkers()
      this.removeSelectedRoute()
      this.resetLinkColors()

      this.routesOnLink = []
      this.stopHTML.html = ''
      this.summaryStats = { departures: 0, pax: 0, loadfac: 0 }

      this.transitLinks = { ...this.transitLinks }
    },

    async loadEverything() {
      const networks = await this.loadNetworks()
      if (!networks) return

      const projection = await this.guessProjection(networks)
      this.projection = projection

      // comment this for now; this is what the user really asked for: NOT A GUESS.
      // this.vizDetails.projection = projection

      this.processInputs(networks)
      // console.log(networks)

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
      console.log('LOADING AVRO:', this.vizDetails.network)
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
        this.incrementLoadProgress()

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
        this.loadingText = ''
        this.$emit('error', '' + e)
        return null
      }
    },

    loadDemandData(filename: string): Promise<any[]> {
      this.totalLoadSteps += 3
      this.loadingText = 'Loading demand...'

      const promise: Promise<any[]> = new Promise<any[]>((resolve, reject) => {
        if (!filename) resolve([])
        this.incrementLoadProgress()

        const worker = new GzipWorker() as Worker

        worker.onmessage = (event: MessageEvent) => {
          this.loadingText = 'Processing demand...'
          this.incrementLoadProgress()

          worker.terminate()

          if (event.data.error) {
            this.$emit('error', event.data.error)
            this.loadingText = ''
            return
          }

          // SPLIT loaded data into chunks because TextDecoder, PapaParse, and CrossFilter all bork on > 500k lines
          // at some point, we can't do all of this in the browser....

          const chunkSize = 100000000
          let offset = 0
          let rawData = new Uint8Array(event.data)

          // first build header
          const decoder = new TextDecoder('utf-8')
          const header = decoder.decode(rawData.subarray(0, 1024)).split('\n')[0]

          // then chunk over raw text
          while (offset < event.data.byteLength) {
            let high = offset + chunkSize
            let chunk = new Uint8Array(event.data).subarray(offset, high)
            let currentChunkLength = chunk.length

            // find last \n so we break on line ending
            while (chunk[currentChunkLength] !== 10 && currentChunkLength > 0) {
              currentChunkLength--
            }

            if (!currentChunkLength) break

            chunk = new Uint8Array(event.data).subarray(offset, offset + currentChunkLength)
            let csvData = decoder.decode(chunk)

            if (offset > 0) csvData = header + csvData

            const results = Papa.parse(csvData, {
              // preview: 10000,
              header: true,
              skipEmptyLines: true,
              dynamicTyping: false,
              // worker: true,
              // complete: (results: any) => {
              //   const result = this.processDemand(results)
              //   resolve(result)
              // },
            })
            this.processDemand(results)
            offset += currentChunkLength
          }

          this.metrics = this.metrics.concat([
            { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
            { field: 'loadfac', name_en: 'Load Factor', name_de: 'Auslastung' },
          ])

          this.loadProgress = 100

          // update load factors now that we are all done
          this.transitLinks.features.forEach((transitLink: any) => {
            try {
              transitLink.properties.loadfac =
                Math.round((1000 * transitLink.properties.pax) / transitLink.properties.cap) / 1000
            } catch {
              transitLink.properties.loadfac = 0
            }
          })

          resolve([])
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
      this.loadingText = 'Summarizing demand data...'
      this.incrementLoadProgress()

      const numericCols = [
        'passengersAlighting',
        'passengersAtArrival',
        'passengersBoarding',
        'stopSequence',
        'totalVehicleCapacity',
      ]
      results.data.forEach((row: any) => {
        for (const key of numericCols) row[key] = parseFloat(row[key])
      })

      // build the crossfilters for this data subsection
      const cfDemand = crossfilter(results.data)
      this.crossFilters.push({
        cfDemand,
        cfDemandLink: cfDemand.dimension((d: any) => d.linkIdsSincePreviousStop),
        cfDemandStop: cfDemand.dimension((d: any) => d.stop),
      })

      // make stopLevelDemand a 2-dimensional array? stop ID and then pt-line?
      for (const row of results.data) {
        const stopId = row.stop
        if (!this.stopLevelDemand[stopId]) {
          this.stopLevelDemand[stopId] = { b: 0, a: 0, ptLines: {} }
        }
        this.stopLevelDemand[stopId].b += row.passengersBoarding
        this.stopLevelDemand[stopId].a += row.passengersAlighting
        const ptLineId = row.transitLine
        if (!this.stopLevelDemand[stopId].ptLines[ptLineId])
          this.stopLevelDemand[stopId].ptLines[ptLineId] = { name: ptLineId, b: 0, a: 0 }
        this.stopLevelDemand[stopId].ptLines[ptLineId].a += row.passengersAlighting
        this.stopLevelDemand[stopId].ptLines[ptLineId].b += row.passengersBoarding
      }
      // build link-level passenger ridership ----------
      console.log('---Calculating link-by-link pax/cap')

      const linkPassengersById = {} as any
      const linkCapacity = {} as any

      // link IDs are split using what character? They changed the format again :-O
      let splitter = ','
      if (results.data.length)
        splitter = results.data[0].linkIdsSincePreviousStop.indexOf(',') > -1 ? ',' : ';'

      // loop through rows
      for (const row of results.data) {
        // console.log(row)
        if (row.linkIdsSincePreviousStop) {
          const traversedLinks = row.linkIdsSincePreviousStop.split(splitter)
          for (const linkId of traversedLinks) {
            // pax
            if (!linkPassengersById[linkId]) linkPassengersById[linkId] = 0
            linkPassengersById[linkId] += row.passengersAtArrival
            // cap
            if (!linkCapacity[linkId]) linkCapacity[linkId] = 0
            linkCapacity[linkId] += row.totalVehicleCapacity
          }
        }
      }

      // update passenger value in the transit-link geojson.
      for (const transitLink of this.transitLinks.features) {
        if (!transitLink.properties) transitLink.properties = { pax: 0, cap: 0, loadfac: 0 }
        transitLink.properties.pax =
          (transitLink.properties.pax || 0) + (linkPassengersById[transitLink.properties.id] || 0)
        transitLink.properties.cap =
          (transitLink.properties.cap || 0) + (linkCapacity[transitLink.properties.id] || 0)
      }

      return []
    },

    async processInputs(networks: NetworkInputs) {
      this.loadingText = 'Examining networks...'
      this.incrementLoadProgress()

      // spawn transit helper web worker
      this._transitHelper = new TransitSupplyWorker()

      this._transitHelper.onmessage = (buffer: MessageEvent) => {
        this.receivedProcessedTransit(buffer)
      }

      // Transit schedule: this might have a different projection than the network,
      // because Avro networks are always EPSG:4326 even if original network is not.
      let transitProjection = this.vizDetails.projection
      if (!transitProjection) {
        // see if transit network has its own projection
        let tCRS = networks?.transitXML?.transitSchedule?.attributes?.attribute
        // sometimes array, sometimes element.
        if (!tCRS.length) tCRS = [tCRS]
        tCRS = tCRS.filter((f: any) => f.name === 'coordinateReferenceSystem')
        if (tCRS.length) {
          transitProjection = tCRS[0]['#text']
        } else {
          // otherwise use roadnetwork project
          transitProjection = this.projection
        }
      }

      console.log('Transit schedule using', transitProjection)
      this._transitHelper.postMessage({
        xml: networks,
        projection: transitProjection,
      })
    },

    async receivedProcessedTransit(buffer: MessageEvent) {
      if (buffer.data.status) {
        this.loadingText = buffer.data.status
        this.incrementLoadProgress()
        return
      }

      if (buffer.data.error) {
        console.error(buffer.data.error)
        this.$emit('error', '' + buffer.data.error)
        this.loadingText = ''
        return
      }

      const { network, routeData, stopFacilities, transitLines, mapExtent } = buffer.data

      this._network = network
      this.routeData = routeData
      this._stopFacilities = stopFacilities
      this.transitLines = transitLines
      this._mapExtentXYXY = mapExtent

      this._transitHelper.terminate()

      this.loadingText = 'Summarizing departures...'
      this.incrementLoadProgress()

      // Use custom colors if they exist, otherwise use defaults
      //@ts-ignore
      const customColors = this.vizDetails.customRouteTypes || this.vizDetails.colors || null
      if (customColors && Array.isArray(customColors) && customColors.length > 0) {
        this.routeColors = customColors
      } else if (customColors && !Array.isArray(customColors)) {
        this.$emit('error', 'YAML colors must be a list of rules, see docs')
        this.routeColors = DEFAULT_ROUTE_COLORS
      } else {
        this.routeColors = DEFAULT_ROUTE_COLORS
      }

      await this.processDepartures()

      // Build the links layer and add it
      try {
        this.transitLinks = await this.constructDepartureFrequencyGeoJson()
      } catch (e) {
        const msg = '' + e || 'Failed processing departure links'
        this.$emit('error', msg)
      }
      // don't keep the network lying around wasting memory
      this._network = { links: {}, nodes: {} }
      // build the lookup for transit links by linkId
      this.transitLinkOffset = {}
      this.transitLinks.features.forEach((feature: any, i: number) => {
        //@ts-ignore
        this.transitLinkOffset[feature.properties.id] = i
      })

      this.drawMetric()
      this.handleClickedMetric({ field: 'departures' })

      const longitude = 0.5 * (this._mapExtentXYXY[0] + this._mapExtentXYXY[2])
      const latitude = 0.5 * (this._mapExtentXYXY[1] + this._mapExtentXYXY[3])

      const span = Math.abs(this._mapExtentXYXY[0] - this._mapExtentXYXY[2])
      const zoom = Math.floor(Math.log2(360 / span))

      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        zoom,
        initial: true,
      })

      localStorage.setItem(this.$route.fullPath + '-bounds', JSON.stringify(this._mapExtentXYXY))

      const demand = this.vizDetails.demand || this.vizDetails.ptStop2stopFile
      if (demand) await this.loadDemandData(demand)

      this.loadingText = ''
    },

    async processDepartures() {
      this.loadingText = 'Processing departures...'
      this.incrementLoadProgress()

      for (const transitLine of this.transitLines) {
        transitLine.transitRoutes.sort((a, b) => naturalSort(a.id, b.id))

        for (const route of transitLine.transitRoutes) {
          for (const linkID of route.route) {
            if (!(linkID in this._departures)) {
              this._departures[linkID] = { total: 0, routes: new Set() }
            }
            this._departures[linkID].total += route.departures
            this._departures[linkID].routes.add(route.id)
          }
        }
      }

      // get max so we can scale line widths nicely
      Object.values(this._departures).forEach(
        e => (this._maximum = Math.max(this._maximum, e.total))
      )
    },

    async constructDepartureFrequencyGeoJson() {
      const geojson = [] as any
      this.usedLabels = []

      const allCoords = this.avroNetwork?.nodeCoordinates

      for (const linkID in this._departures) {
        if (this._departures.hasOwnProperty(linkID)) {
          const link = this._network.links[linkID] as any
          if (link == undefined) continue

          let coordinates

          try {
            if (this.avroNetwork) {
              // link is an INDEX to the node column arrays
              const offsetFrom = 2 * this.avroNetwork.from[link]
              const offsetTo = 2 * this.avroNetwork.to[link]
              coordinates = [
                [allCoords[offsetFrom], allCoords[1 + offsetFrom]],
                [allCoords[offsetTo], allCoords[1 + offsetTo]],
              ]
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
          const routes = [...this._departures[linkID].routes]

          // TODO for now take color from... first route?
          // for (const routeId of this._departures[linkID].routes) {
          const routeId = routes[0]

          const { color, hideThisLine } = this.determineRouteColor(routeId)

          // Add the line to the geojson array only if the line should not be hidden
          if (!hideThisLine) {
            let line = {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates,
              },
              properties: {
                ...this.$props,
                color,
                departures: departures,
                id: linkID,
                from: link.from,
                to: link.to,
                currentColor: color,
              },
            }
            line = this.offsetLineByMeters(line, 5)
            geojson.push(line)
          }
        }
      }

      if (!geojson.length) {
        throw Error('No links found. Does the network contain PT links?')
      }
      return { type: 'FeatureCollection', features: geojson } as GeoJSON.FeatureCollection
    },

    determineRouteColor(id: string) {
      let color = '#888'
      let hideThisLine = false // stores if this line should be hidden from view

      const props = this.routeData[id] as any
      // routeColors is a list of possible matches by GTFS code, modestring, etc.
      // For each route, we loop through the list of metrics.  The first set of
      // match conditions that match all parameters determines the route color.
      for (const config of this.routeColors) {
        hideThisLine = false
        if (config.hide) hideThisLine = true

        let matched = true

        // loop through all parameters in this match definition
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
        } catch (e) {
          console.warn('Match rules malformed', matchRules)
        }

        for (const [key, pattern] of Object.entries(matchRules) as any[]) {
          const valueForThisProp = props[key]
          // fail if route doesn't include this match property
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
        // Set color and stop searching after first successful match
        // the label will only be added if the route should not be hidden
        if (matched) {
          color = config.color
          if (!this.usedLabels.includes(config.label) && !hideThisLine)
            this.usedLabels.push(config.label)
          break
        }
      }
      // no rules matched; sad!
      if (color == '#888') console.log('OHE NOES', id)

      // save color in the route props before returning. HA! Side effects, woot! :-/
      // convert css colors to rgb[]
      const rgb = Array.isArray(color) ? color : this.colorToRGB(color)
      props.color = rgb

      return { color: rgb, hideThisLine }
    },

    colorToRGB(colorString: string) {
      try {
        const rgb = color(colorString)
        if (!rgb) return [0, 0, 0]
        // d3.color provides r, g, b properties directly
        return [rgb.r, rgb.g, rgb.b]
      } catch (error) {
        return [0, 0, 0]
      }
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

    XXtoggleTransitLine(line: any) {
      line.isOpen = !line.isOpen

      if (line.isOpen) {
        // upon open, highlight ALL routes that are in this transit-line
        this.selectedTransitLine = line.id

        this.selectAllRoutesInLine(line)
      } else {
        // de-highlight upon closing
        this.selectedTransitLine = ''
        this.removeStopMarkers()
        this.removeSelectedRoute()
      }

      this.$forceUpdate()
    },

    selectAllRoutesInLine(line: { routes: RouteDetails[] }) {
      const selectedIds = line.routes.map(route => route.id)
      this.selectedRouteIds = selectedIds
      this.showTransitRoutes()
      this.showTransitStops()
    },

    showRouteDetails(routeID: string, numRoutes: number) {
      // special case: if ALL routes in the current line are selected, AND nothing else is selected,
      // AND the user just asked to remove "one" route, they probably want to see JUST that route
      if (numRoutes > 1 && this.selectedRouteIds.length == numRoutes) {
        this.selectedRouteIds = [routeID]
      } else {
        const shownRoutes = new Set(this.selectedRouteIds)

        if (shownRoutes.has(routeID)) shownRoutes.delete(routeID)
        else shownRoutes.add(routeID)

        this.selectedRouteIds = [...shownRoutes]
      }

      this.showTransitRoutes()
      this.showTransitStops()
    },

    showTransitStops() {
      const markers = {} as { [stopId: string]: any }

      this.selectedRouteIds.forEach(routeId => {
        const route = this.routeData[routeId]

        const allStops = route.routeProfile
        const numStops = allStops.length
        // purposely unitialized so that final stop retains previous value
        let bearing

        for (const [i, stop] of allStops.entries()) {
          // figure out bearing direction for stop icon
          const startFacility = this._stopFacilities[stop.refId]
          const startCoord = turf.point([startFacility.x, startFacility.y])
          if (i < numStops - 1) {
            const endFacility = this._stopFacilities[route.routeProfile[i + 1].refId]
            const endCoord = turf.point([endFacility.x, endFacility.y])
            // deck.gl layer will rotate these bearing along with the map
            bearing = turf.bearing(startCoord, endCoord)
          }

          // every marker has a latlng coord and a bearing
          const marker = {
            i,
            bearing,
            xy: [startFacility.x, startFacility.y],
            name: startFacility.name || '',
            id: stop.refId || '', // startFacility.id || '',
            linkRefId: startFacility.linkRefId || '',
          } as any

          // figure out boardings/alightings at each stop
          if (this.stopLevelDemand) {
            const ridership = this.stopLevelDemand[stop.refId]
            if (ridership) {
              marker.boardings = ridership.b
              marker.alightings = ridership.a
              marker.ptLines = ridership.ptLines
            }
          }

          // merge stop-level stats for routes that share the same stop
          if (marker.id in markers) {
            markers[marker.id].boardings = marker.boardings // +=
            markers[marker.id].alightings = marker.alightings // +=
          } else {
            markers[marker.id] = marker
          }
        }
      })

      this.stopMarkers = Object.values(markers)
    },

    showTransitRoutes() {
      this.stopHTML.html = ''

      const featureCollection = [] as any[]

      this.selectedRouteIds.forEach(id => {
        const route = this.routeData[id]
        featureCollection.push(route.geojson)
      })

      this.selectedFeatures = featureCollection
    },

    removeSelectedRoute() {
      this.selectedFeatures = []
      this.selectedRouteIds = []
    },

    clickedOnTransitLink(index: number) {
      this.isHighlightingLink = true
      this.removeStopMarkers()
      this.removeSelectedRoute()

      // the browser delivers some details that we need, in the fn argument 'e'
      const props = this.transitLinks.features[index].properties

      this.selectedLinkId = props.id
      const routeIDs = this._departures[props.id].routes

      // overall link statistics
      let empty = { departures: 0, pax: 0, loadfac: 0 }
      const foundLink = this.transitLinks[this.transitLinkOffset[props.id]]
      this.summaryStats = foundLink ? foundLink.properties : empty

      // routes and lines on this link
      const routes = []
      const lines = new Set()
      for (const id of routeIDs) {
        const details = this.routeData[id]
        details.color = props.color
        details.currentColor = props.color
        routes.push(details)
        lines.add(details.lineId)
      }

      this.routesOnLink = routes

      // highlight selected routes
      this.highlightAllAttachedRoutes()
      this.selectedRouteIds = this.routesOnLink.map(route => route.id)

      // tell right-panel which lines are highlighted
      this.highlightedTransitLineIds = lines
    },

    resetLinkColors(color?: number[]) {
      if (color) {
        for (const link of this.transitLinks.features) {
          link.properties.currentColor = color
          link.properties.sort = 0
        }
      } else {
        for (const link of this.transitLinks.features) {
          link.properties.currentColor = link.properties.color
          link.properties.sort = 1
        }
      }
    },

    highlightAllAttachedRoutes() {
      if (!this.transitLinks) return

      if (this.routesOnLink.length) {
        const gray = this.colorToRGB(this.isDarkMode ? '#333344' : '#ccccdd')
        this.resetLinkColors(gray)
      } else {
        this.resetLinkColors()
      }

      for (const routeDetails of this.routesOnLink) {
        for (const linkId of routeDetails.route) {
          const offset = this.transitLinkOffset[linkId]
          const transitLink = this.transitLinks.features[offset]
          transitLink.properties.currentColor = routeDetails.color || transitLink.properties.color
          transitLink.properties.sort = 5
        }
      }

      // selected link all the way on top
      if (this.selectedLinkId) {
        const selectedLink = this.transitLinks.features[this.transitLinkOffset[this.selectedLinkId]]
        selectedLink.properties.currentColor = this.colorToRGB('#f4f')
        selectedLink.properties.sort = 5
      }

      // trigger redraw
      this.transitLinks = { ...this.transitLinks }
    },

    pressedEscape() {
      console.log('ESC')
      this.removeSelectedRoute()
      this.removeStopMarkers()
      this.resetLinkColors()
      this.routesOnLink = []
    },

    pressedArrowKey(delta: number) {
      return
      // if (!this.selectedRouteIds.length) return

      // let i = this.routesOnLink.indexOf(this.selectedRoute)
      // i = i + delta

      // if (i < 0 || i >= this.routesOnLink.length) return

      // this.showRouteDetails(this.routesOnLink[i].id)
    },

    clearData() {
      this._departures = {}
      this._mapExtentXYXY = [180, 90, -180, -90]
      this._maximum = 0
      this._network = { nodes: {}, links: {} }
      this.routeData = {}
      this._stopFacilities = {}
      this.transitLinks = { type: 'FeatureCollection', features: [] }
      this.transitLines = []
      this.selectedRouteIds = []
      this.resolvers = {}
      this.routesOnLink = []
      this.stopMarkers = []
      this.searchText = ''
      this.crossFilters.forEach(cf => {
        cf.cfDemandLink.dispose()
        cf.cfDemandStop.dispose()
        cf.cfDemand = null as any
      })
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

    // If we don't have a network file yet, try and find one
    if (!this.vizDetails.network) await this.findInputFiles()

    this.loadEverything()
  },

  beforeDestroy() {
    this.clearData()

    if (this.xmlWorker) this.xmlWorker.terminate()
    if (this._roadFetcher) this._roadFetcher.terminate()
    if (this._transitFetcher) this._transitFetcher.terminate()
    if (this._transitHelper) this._transitHelper.terminate()

    this.$store.commit('setFullScreen', false)
  },
})

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

.transit-viz {
  position: absolute;
  top: 0;
  bottom: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  background-size: cover;
}

.map-container {
  position: relative;
  flex: 1;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-color: #eee;
  background-size: cover;
  min-height: $thumbnailHeight;
}

.hide-thumbnail {
  background: none;
  z-index: 0;
}

.legend {
  background-color: var(--bgPanel);
  padding: 0.25rem 0.5rem;
}

.summary-stats {
  border: 1px solid #80808040;
  margin: 0.5rem 0.25rem 0 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.9rem;
  line-height: 1.2rem;
}

.route {
  padding: 5px 0px 5px 1.5rem;
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
  margin: 0;
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
  color: var(--text);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  // position: relative;
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
  margin: 0.25rem 0.5rem 0.5rem 0;
}

.metric-button {
  border-radius: 0;
  flex: 1;
}

.detailed-route-data {
  display: flex;
  flex-direction: row;
  color: #666;
  font-weight: normal;
  gap: 0.5rem;
}

.col {
  display: flex;
  flex-direction: column;
  line-height: 1.1rem;
  color: #666;
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
  flex-direction: column;
  background-color: var(--bgPanel);
  padding: 0.5rem 3rem;
  margin: auto auto;
  width: 25rem;
  height: 5rem;
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
    line-height: 1rem;
    margin: auto 0;
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

.load-progress {
  padding: 0 5rem;
  height: 3px;
  margin-top: 2px;
  margin-bottom: 0.5rem;
}

.right-side-column {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);
}

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

.transit-lines {
  overflow-x: hidden;
  overflow-y: auto;
  cursor: pointer;
  scrollbar-color: #888 var(--bgCream);
  -webkit-scrollbar-color: #888 var(--bgCream);
}

.transit-line {
  .line-header {
    padding: 0.5rem 0.5rem;
    background-color: var(--bgPanel3);
    font-weight: bold;
    font-size: 1.1rem;
    margin: 1px;
  }

  .stats {
    gap: 0.5rem;
    background-color: var(--bgPanel3);
    font-size: 0.9rem;
    font-weight: normal;
  }
}

.width-sliders {
  position: absolute;
  bottom: 0;
  left: 0;
  user-select: none;
  border-top-right-radius: 5px;
}

.icon-blue-ramp {
  margin: 8px -2px 4px 10px;
  height: 1rem;
  width: 1.4rem;
}

.icon-pie-slider {
  margin: 7px -2px 4px 2px;
  height: 1.4rem;
  width: 1.4rem;
}

.pie-slider {
  width: 10rem;
  padding: 1rem;
  margin: 0;
}

.right-panel-holder {
  position: relative;
  grid-row: 1/2;
  grid-column: 3/4;
  max-height: 100%;
}

.lazy-transit-list {
  background-color: #ffa;
  overflow-y: auto;
}
</style>
