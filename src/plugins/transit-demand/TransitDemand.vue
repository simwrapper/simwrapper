<template lang="pug">
  #transit-viz.transit-viz(:class="{'hide-thumbnail': !thumbnail}")

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

          transit-layers.map-styles(v-if="linkCount"
            :viewId="viewId"
            :linkData="net.linkData"
            :linkVersion="linkVersion"
            :selectedFeatures="selectedFeatures"
            :stopMarkers="stopMarkers"
            :handleClickEvent="handleMapClick"
            :pieSlider="pieSlider || 0"
            :widthSlider="widthSlider"
            :transitLines="activeTransitLines"
            :vizDetails="vizDetails"
            :isAtlantis="isAtlantis"
            :bgLayers="backgroundLayers"
            :show3dBuildings="show3dBuildings"
          )

          .width-sliders.flex-row(v-if="transitLines.length" :style="{backgroundColor: isDarkMode ? '#00000099': '#ffffffaa'}")
              //- width slider
              img.icon-blue-ramp(:src="icons.blueramp")
              o-slider.pie-slider(:tooltip="false" size="small"  v-model="widthSlider")
              //- pie slider
              img.icon-pie-slider(v-if="hasDemand" :src="icons.piechart")
              o-slider.pie-slider(v-if="hasDemand" :tooltip="false" size="small"  v-model="pieSlider")

          zoom-buttons(corner="top-left" :show3dToggle="true" :is3dBuildings="show3dBuildings" :onToggle3dBuildings="toggle3dBuildings")

          .status-corner.flex-col(v-if="loadingText" :style="{'height': networkOptions.length ? '15rem':'5rem'}")
            p {{ loadingText }}
            progress.progress.load-progress.is-success(v-if="loadProgress > 0" :value="loadProgress" max="100")
            .network-options.flex-col(v-if="networkOptions.length")
              o-button.xbutton.center(v-for="networkFile of networkOptions" :key="networkFile"
                size="small"
                expanded
                @click="selectNetwork(networkFile)"
              )  {{ networkFile }}

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

          //- Oruga hands our class/style to the inner <input>, so the layout lives on a wrapper
          .searchbox(v-if="transitLines.length")
            o-input(v-model="searchText" size="small" placeholder="Search line ID or /regex/")

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
              .aa(v-if="hasDemand")
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

import { defineComponent, markRaw } from 'vue'
import type { PropType } from 'vue'

import * as Comlink from 'comlink'
import * as turf from '@turf/turf'
import { debounce } from 'debounce'
import yaml from 'yaml'
import naturalSort from 'javascript-natural-sort'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import {
  ColorRule,
  DemandResult,
  LinkRenderData,
  RouteDemand,
  RouteDetails,
  SupplyResult,
  TransitLine,
} from './Interfaces'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'
import TransitTaskWorker from './TransitTask.worker?worker'
import type { TransitTaskApi } from './TransitTask.worker'
import { colorToRGB, DEFAULT_ROUTE_COLORS } from './routeColors'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import TransitLayers from './DeckMapComponent.vue'
import LegendBox from './LegendBox.vue'
import LazyList from './LazyList.vue'
import { unreactive } from '@/js/util'

import { FileSystemConfig, ColorScheme } from '@/Globals'

import IconPieChart from './assets/icon-pie-chart.png'
import IconBlueRamp from './assets/icon-blue-ramp.png'
import BackgroundLayers from '@/js/BackgroundLayers'

const DEFAULT_PROJECTION = 'EPSG:31468' // 31468' // 2048'

type RouteDemandMap = { [routeId: string]: { pax: number; cap: number } }

const emptyNet = () => ({
  supply: null as SupplyResult | null,
  demand: null as DemandResult | null,
  linkData: null as LinkRenderData | null,
  linkIndexById: {} as { [linkId: string]: number },
  // by route id; a duplicate id keeps the last route
  routeData: {} as { [id: string]: RouteDetails },
})

const MyComponent = defineComponent({
  name: 'TransitViewer',
  i18n,
  components: {
    LegendBox,
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
      backgroundLayers: null as null | BackgroundLayers,

      loadProgress: 0,
      loadSteps: 0,
      totalLoadSteps: 7,
      searchText: '',
      isAtlantis: false,
      show3dBuildings: false,
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
        colors: [] as ColorRule[],
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

      isDarkMode: globalStore.state.isDarkMode,
      isMapMoving: false,
      isHighlightingLink: false,
      loadingText: 'MATSim Transit Inspector',
      networkOptions: [] as string[],
      projection: DEFAULT_PROJECTION,
      routesOnLink: [] as RouteDetails[],
      selectedLinkId: '',
      selectedRouteIds: [] as string[],
      selectedTransitLine: '',
      selectedFeatures: [] as any[],
      summaryStats: { departures: 0, pax: 0, loadfac: 0 },
      stopMarkers: [] as any[],

      // Big data: typed arrays and lookups, never reactive. Replaced wholesale only.
      net: markRaw(emptyNet()),
      linkCount: 0,
      linkVersion: 0,
      hasDemand: false,
      /** per-route demand over all rows (no link selected) */
      routeDemandAll: null as RouteDemandMap | null,
      /** per-route demand for the selected link, once the worker has answered */
      routeDemandLink: null as null | { linkId: string; map: RouteDemandMap },
      linkDemandRequest: 0,

      // Comlink remotes must never be stored in reactive state: keep them in a raw holder
      task: markRaw({
        worker: null as Worker | null,
        api: null as Comlink.Remote<TransitTaskApi> | null,
      }),

      _mapExtentXYXY: null as any,

      transitLines: [] as TransitLine[],
      highlightedTransitLineIds: new Set(),

      pieSlider: 20,
      widthSlider: 20,

      resolvers: {} as { [id: number]: any },
      resolverId: 0,

      routeColors: [] as ColorRule[],
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

    /** demand rows filtered by the selected link (all rows if none), summed per route */
    currentRouteDemand(): RouteDemandMap | null {
      if (!this.hasDemand) return null
      if (!this.selectedLinkId) return this.routeDemandAll
      const answer = this.routeDemandLink
      return answer && answer.linkId === this.selectedLinkId ? answer.map : null
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

      const demandLookup = this.currentRouteDemand || {}

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
            line.stats.pax += routeRuns.pax
            route.pax += routeRuns.pax
            line.stats.cap += routeRuns.cap
            route.cap += routeRuns.cap
          }
          route.loadfac = route.pax / route.cap
        })
      })

      return lines
    },

    legendRows(): string[][] {
      return this.routeColors
        .filter(r => this.usedLabels.includes(r.label))
        .map(r => [r.color as string, r.label])
    },
  },

  watch: {
    '$store.state.colorScheme'() {
      this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
      this.highlightAllAttachedRoutes()
    },

    selectedRouteIds() {
      this.showTransitRoutes()
      this.showTransitStops()
      this.updateSummaryStats()
      this.updateTestData()
    },

    linkCount() {
      this.updateTestData()
    },

    selectedLinkId() {
      this.requestLinkDemand()
    },

    searchText() {
      this.debounceHandleSearchText()
    },
  },

  methods: {
    updateTestData() {
      //@ts-ignore
      window.__testdata__ = {
        transitLinks: this.net.supply?.linkIds || [],
        transitLines: this.transitLines,
        selectedRouteIds: this.selectedRouteIds,
        hasDemand: this.hasDemand,
      }
    },

    /** tell the deck layer that the per-link arrays changed */
    redrawLinks() {
      this.linkVersion++
    },

    async selectNetwork(filename: string) {
      console.log(filename)
      this.vizDetails.network = filename
      this.networkOptions = []
      await this.findInputFiles()
      await this.loadEverything()
    },

    clickedLegend(e: any) {
      console.log('boop!', e)
    },

    toggleRouteChecked(props: { route: string; isChecked: boolean }) {
      if (props.isChecked) {
        // highlight if checked
        this.routesOnLink.push(this.net.routeData[props.route])
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
        this.redrawLinks()
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

      const foundRoutes = Object.values(this.net.routeData).filter(
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

      if (this.routesOnLink.length) {
        this.highlightAllAttachedRoutes()
      } else {
        this.selectedLinkId = ''
        this.resetLinkColors()
        this.highlightedTransitLineIds = new Set()
        this.redrawLinks()
      }
    },

    updateSummaryStats() {
      this.summaryStats = { departures: 0, pax: 0, loadfac: 0 }
      for (const routeId of this.selectedRouteIds) {
        const r = this.net.routeData[routeId]
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
        this.redrawLinks()
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

      const routeData = this.net.routeData
      if (regexp) {
        foundRoutes = Object.keys(routeData).filter(routeID => routeID.match(regexp))
        foundLines = this.transitLines.filter(line => line.id.match(regexp)).map(line => line.id)
      } else {
        foundRoutes = Object.keys(routeData).filter(
          routeID => routeID.toLocaleLowerCase().indexOf(searchTerm) > -1
        )
        foundLines = this.transitLines
          .filter(line => line.id.toLocaleLowerCase().indexOf(searchTerm) > -1)
          .map(line => line.id)
      }

      // show selected route snakepaths
      this.routesOnLink = foundRoutes.map(id => routeData[id])
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
        this.sync3dBuildingsSetting()
        return true
      }

      // if a YAML file was passed in, just use it
      if (this.myState.yamlConfig?.endsWith('yaml') || this.myState.yamlConfig?.endsWith('yml')) {
        return this.loadYamlConfig()
      }

      // Build the config based on folder contents
      const title = this.myState.yamlConfig

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
      this.sync3dBuildingsSetting()
      return true
    },

    sync3dBuildingsSetting() {
      this.show3dBuildings = !!(
        (this.vizDetails as any).buildings3d ?? (this.vizDetails as any).show3dBuildings
      )
    },

    toggle3dBuildings() {
      this.show3dBuildings = !this.show3dBuildings
    },

    async findInputFiles() {
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)

      let network = this.vizDetails.network
      // First see if we have an avro network
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
      // Try the most obvious network filename first:
      if (!network && this.myState.yamlConfig.indexOf('transitSchedule') > -1) {
        network = this.myState.yamlConfig.replaceAll('transitSchedule', 'network')
      }

      // if the obvious network file doesn't exist, pick from all networks in this folder:
      if (files.indexOf(network) == -1) {
        const allXML = files.filter(f => f.toLocaleLowerCase().match(/\.xml(\.gz)?(\.zst)?$/))
        const allNetworks = [] as string[]
        await Promise.all(
          allXML.map(async (f: any) => {
            const path = `${this.myState.subfolder}/${f}`
            const t = await this.fileApi.probeXmlFileType(path)
            if (t === 'network') allNetworks.push(f)
          })
        )
        console.log('all networks', allNetworks)
        // if there is only ONE network file in this folder, use it
        if (allNetworks.length == 1) network = allNetworks[0]
        else {
          // give up; ask the user to choose
          this.loadingText = 'Choose network file:'
          network = ''
          this.networkOptions = allNetworks
          return
          // findInputFiles will get called again when user clicks on an option
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
          console.log('no transit demand file: pt_pax_volumes')
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

      const goodEPSG = /EPSG:.\d/

      // 1. try to get it from config
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)
      const outputConfigs = files.filter(
        f => f.indexOf('.output_config.xml') > -1 || f.indexOf('.output_config_reduced.xml') > -1
      )
      if (outputConfigs.length && this.fileSystem) {
        for (const xmlConfigFileName of outputConfigs) {
          try {
            const configXML: any = await this.fetchXML({
              worker: new NewXmlFetcher(),
              slug: this.fileSystem.slug,
              filePath: this.myState.subfolder + '/' + xmlConfigFileName,
            })

            const global = configXML.config.module.filter((f: any) => f.$name === 'global')[0]
            const crs = global.param.filter((p: any) => p.$name === 'coordinateSystem')[0]

            const crsValue = crs.$value

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
      this.sync3dBuildingsSetting()
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

    drawMetric() {
      const L = this.net.linkData
      if (!L) return

      for (let i = 0; i < L.length; i++) {
        let width = 1
        switch (this.activeMetric) {
          case 'departures':
            width = L.departures[i]
            break
          case 'pax':
            width = L.pax ? L.pax[i] : NaN
            break
          case 'loadfac':
            width = L.loadfac ? L.loadfac[i] * 10000 : NaN
            break
        }
        L.widths[i] = width
      }

      this.redrawLinks()
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

      this.redrawLinks()
    },

    async loadEverything() {
      const networks = await this.loadNetworks()
      if (!networks) return

      const projection = await this.guessProjection(networks)
      this.projection = projection

      // comment this for now; this is what the user really asked for: NOT A GUESS.
      // this.vizDetails.projection = projection

      await this.processInputs(networks)
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

      // unreactive: a reactive Proxy cannot be structuredClone'd
      xmlWorker.postMessage(
        unreactive({
          id,
          fileSystem: this.fileSystem,
          filePath: props.filePath,
          options: props.options,
        })
      )

      const promise = new Promise((resolve, reject) => {
        this.resolvers[id] = { resolve, reject }
      })
      return promise
    },

    async updateStatus(message: string) {
      this.loadingText = message
    },

    /** the Comlink remote for this component's transit worker, created on first use */
    transitTask(): Comlink.Remote<TransitTaskApi> {
      if (!this.task.api) {
        this.task.worker = new TransitTaskWorker()
        this.task.api = Comlink.wrap<TransitTaskApi>(this.task.worker)
      }
      return this.task.api
    },

    /** worker status messages advance the progress bar */
    statusCallback() {
      return Comlink.proxy((message: string) => {
        this.loadingText = message
        this.incrementLoadProgress()
      })
    },

    async loadNetworks() {
      try {
        if (!this.fileSystem || !this.vizDetails.network || !this.vizDetails.transitSchedule) return

        this.loadingText = 'Loading networks...'
        this.incrementLoadProgress()

        // the worker fetches and parses the schedule while we wait for the road network
        const transit = this.transitTask().loadSchedule(
          unreactive({
            fileSystem: this.fileSystem,
            schedulePath: this.myState.subfolder + '/' + this.vizDetails.transitSchedule,
          })
        )

        const roads = (await this.myDataManager.getRoadNetwork(
          this.vizDetails.network,
          this.subfolder,
          this.vizDetails,
          this.updateStatus
        )) as any

        this.isAtlantis = !!roads.isAtlantis

        await transit
        return { roadXML: roads }
      } catch (e) {
        console.error('TRANSIT:', e)
        this.loadingText = ''
        this.$emit('error', '' + e)
        return null
      }
    },

    async processInputs(networks: { roadXML: any }) {
      this.loadingText = 'Examining networks...'
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

      // Only the columns the worker needs. They are copied, not transferred: the data
      // manager caches this network for other panels. Not run through unreactive() --
      // it comes straight off a worker and never passes through reactive state.
      const roads = networks.roadXML
      const network = {
        linkId: roads.linkId,
        from: roads.from,
        to: roads.to,
        nodeCoordinates: roads.nodeCoordinates,
        source: roads.source,
        dest: roads.dest,
      }

      let supply: SupplyResult
      try {
        supply = await this.transitTask().buildSupply(
          {
            network,
            // Transit schedule might have a different projection than the network,
            // because Avro networks are always EPSG:4326 even if original network is not.
            forcedProjection: this.vizDetails.projection,
            fallbackProjection: this.projection,
            colorRules: unreactive(this.routeColors),
          },
          this.statusCallback()
        )
      } catch (e) {
        const msg = (e as any)?.message || '' + e || 'Failed processing departures'
        console.error(msg)
        this.$emit('error', msg)
        this.loadingText = ''
        return
      }

      this.applySupply(supply)

      const demand = this.vizDetails.demand || this.vizDetails.ptStop2stopFile
      if (demand) await this.loadDemandData(demand)

      this.loadingText = ''
    },

    applySupply(supply: SupplyResult) {
      for (const msg of supply.routeErrors.slice(0, 10)) this.$emit('error', msg)
      if (supply.routeErrors.length > 10)
        this.$emit('error', `...and ${supply.routeErrors.length - 10} more route errors`)

      const n = supply.linkIds.length
      const net = emptyNet()
      net.supply = supply
      for (const route of supply.routes) net.routeData[route.id] = route
      supply.linkIds.forEach((id, i) => (net.linkIndexById[id] = i))
      net.linkData = {
        length: n,
        coords: supply.linkCoords,
        baseColors: supply.linkColor,
        colors: supply.linkColor.slice(),
        widths: new Float64Array(n),
        sort: new Uint8Array(n).fill(1),
        departures: supply.linkDepartures,
      }
      this.net = markRaw(net)

      this.transitLines = supply.lines.map(line => ({
        id: line.id,
        name: line.name,
        transitRoutes: line.routes.map(i => supply.routes[i]),
        gtfsRouteType: line.gtfsRouteType,
        check: false,
      }))
      this.usedLabels = supply.usedLabels
      this._mapExtentXYXY = supply.mapExtent

      this.handleClickedMetric({ field: 'departures' })
      this.linkCount = n

      const lon = 0.5 * (this._mapExtentXYXY[0] + this._mapExtentXYXY[2])
      const lat = 0.5 * (this._mapExtentXYXY[1] + this._mapExtentXYXY[3])
      const span = Math.abs(this._mapExtentXYXY[0] - this._mapExtentXYXY[2])
      let zoom = span ? Math.floor(Math.log2(360 / span)) : 9
      this.$store.commit('setMapCamera', {
        center: [lon, lat],
        zoom,
        bearing: 0,
        pitch: 0,
      })
    },

    async loadDemandData(filename: string) {
      this.totalLoadSteps += 3
      this.loadingText = 'Loading demand...'
      if (!filename) return

      let demand: DemandResult
      let allRoutes: RouteDemand | null
      try {
        const api = this.transitTask()
        demand = await api.loadDemand(
          unreactive({
            fileSystem: this.fileSystem,
            path: this.myState.subfolder + '/' + filename,
          }),
          this.statusCallback()
        )
        allRoutes = await api.routeDemandForLink('')
      } catch (e) {
        this.$emit('error', (e as any)?.message || '' + e)
        this.loadingText = ''
        return
      }

      const L = this.net.linkData as LinkRenderData
      L.pax = demand.linkPax
      L.cap = demand.linkCap
      L.loadfac = demand.linkLoadfac
      this.net.demand = demand

      this.routeDemandAll = this.routeDemandToMap(allRoutes)
      this.hasDemand = true

      this.metrics = this.metrics.concat([
        { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
        { field: 'loadfac', name_en: 'Load Factor', name_de: 'Auslastung' },
      ])

      this.loadProgress = 100
      this.updateTestData()
    },

    routeDemandToMap(d: RouteDemand | null): RouteDemandMap {
      const map: RouteDemandMap = {}
      if (!d) return map
      d.routeIds.forEach((id, i) => (map[id] = { pax: d.pax[i], cap: d.cap[i] }))
      return markRaw(map)
    },

    /** per-route demand on the selected link comes from the worker, asynchronously */
    async requestLinkDemand() {
      const linkId = this.selectedLinkId
      const request = ++this.linkDemandRequest
      if (!linkId || !this.hasDemand || !this.task.api) return

      try {
        const answer = await this.task.api.routeDemandForLink(linkId)
        // a newer click wins
        if (request !== this.linkDemandRequest) return
        this.routeDemandLink = markRaw({ linkId, map: this.routeDemandToMap(answer) })
      } catch (e) {
        console.warn('transit: link demand query failed', e)
      }
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
      const S = this.net.supply
      const D = this.net.demand
      if (!S) {
        this.stopMarkers = []
        return
      }

      const markers = {} as { [stopId: string]: any }

      this.selectedRouteIds.forEach(routeId => {
        const r = this.net.routeData[routeId].uniqueRouteID
        const first = S.routeStopOffsets[r]
        const numStops = S.routeStopOffsets[r + 1] - first
        // purposely unitialized so that final stop retains previous value
        let bearing

        for (let i = 0; i < numStops; i++) {
          const si = S.routeStopIdx[first + i]
          // stop is not in the schedule's stop facilities
          if (si < 0) continue

          // figure out bearing direction for stop icon
          const x = S.stopCoords[2 * si]
          const y = S.stopCoords[2 * si + 1]
          if (i < numStops - 1) {
            const next = S.routeStopIdx[first + i + 1]
            if (next > -1) {
              // deck.gl layer will rotate these bearing along with the map
              bearing = turf.bearing(
                turf.point([x, y]),
                turf.point([S.stopCoords[2 * next], S.stopCoords[2 * next + 1]])
              )
            }
          }

          // every marker has a latlng coord and a bearing
          const stop = S.stops[si]
          const marker = {
            i,
            bearing,
            xy: [x, y],
            name: stop.name || '',
            id: stop.id || '',
            linkRefId: stop.linkRefId || '',
          } as any

          // figure out boardings/alightings at each stop
          if (D && D.stopHasDemand[si]) {
            marker.boardings = D.stopBoard[si]
            marker.alightings = D.stopAlight[si]
            const ptLines = {} as { [lineId: string]: { name: string; b: number; a: number } }
            for (let k = D.stopLineOffsets[si]; k < D.stopLineOffsets[si + 1]; k++) {
              const name = D.demandLineIds[D.stopLineIdx[k]]
              ptLines[name] = { name, b: D.stopLineB[k], a: D.stopLineA[k] }
            }
            marker.ptLines = ptLines
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
      const S = this.net.supply

      const featureCollection = [] as any[]

      if (S) {
        this.selectedRouteIds.forEach(id => {
          const r = this.net.routeData[id].uniqueRouteID
          const coordinates = [] as number[][]
          for (let p = S.routePathOffsets[r]; p < S.routePathOffsets[r + 1]; p++) {
            coordinates.push([S.routePath[2 * p], S.routePath[2 * p + 1]])
          }
          featureCollection.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates },
            properties: { id, from: coordinates[0], to: coordinates[coordinates.length - 1] },
          })
        })
      }

      // markRaw: handed straight to deck.gl, which freezes layer data
      this.selectedFeatures = markRaw(featureCollection)
    },

    removeSelectedRoute() {
      this.selectedFeatures = []
      this.selectedRouteIds = []
    },

    clickedOnTransitLink(index: number) {
      const S = this.net.supply
      const L = this.net.linkData
      if (!S || !L) return

      this.isHighlightingLink = true
      this.removeStopMarkers()
      this.removeSelectedRoute()

      this.selectedLinkId = S.linkIds[index]

      // overall link statistics
      this.summaryStats = { departures: 0, pax: 0, loadfac: 0 }

      // routes and lines on this link; they take on the link's color
      const linkColor = [...L.baseColors.subarray(3 * index, 3 * index + 3)]
      const routes = []
      const lines = new Set()
      for (let k = S.linkRouteOffsets[index]; k < S.linkRouteOffsets[index + 1]; k++) {
        const details = S.routes[S.linkRouteIdx[k]]
        details.color = linkColor
        details.currentColor = linkColor
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
      const L = this.net.linkData
      if (!L) return

      if (color) {
        for (let i = 0; i < L.length; i++) {
          L.colors[3 * i] = color[0]
          L.colors[3 * i + 1] = color[1]
          L.colors[3 * i + 2] = color[2]
        }
        L.sort.fill(0)
      } else {
        L.colors.set(L.baseColors)
        L.sort.fill(1)
      }
    },

    highlightAllAttachedRoutes() {
      const S = this.net.supply
      const L = this.net.linkData
      if (!S || !L) return

      if (this.routesOnLink.length) {
        const gray = colorToRGB(this.isDarkMode ? '#333344' : '#ccccdd')
        this.resetLinkColors(gray)
      } else {
        this.resetLinkColors()
      }

      for (const routeDetails of this.routesOnLink) {
        const r = routeDetails.uniqueRouteID
        const color = routeDetails.color
        for (let k = S.routeLinkOffsets[r]; k < S.routeLinkOffsets[r + 1]; k++) {
          const li = S.routeLinkIdx[k]
          if (li < 0) continue // link isn't drawn
          if (color) {
            L.colors[3 * li] = color[0]
            L.colors[3 * li + 1] = color[1]
            L.colors[3 * li + 2] = color[2]
          } else {
            L.colors[3 * li] = L.baseColors[3 * li]
            L.colors[3 * li + 1] = L.baseColors[3 * li + 1]
            L.colors[3 * li + 2] = L.baseColors[3 * li + 2]
          }
          L.sort[li] = 5
        }
      }

      // selected link all the way on top
      if (this.selectedLinkId) {
        const li = this.net.linkIndexById[this.selectedLinkId]
        if (li !== undefined) {
          const magenta = colorToRGB('#f4f')
          L.colors[3 * li] = magenta[0]
          L.colors[3 * li + 1] = magenta[1]
          L.colors[3 * li + 2] = magenta[2]
          L.sort[li] = 5
        }
      }

      this.redrawLinks()
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
    },

    clearData() {
      this._mapExtentXYXY = [180, 90, -180, -90]
      this.net = markRaw(emptyNet())
      this.linkCount = 0
      this.hasDemand = false
      this.routeDemandAll = null
      this.routeDemandLink = null
      this.transitLines = []
      this.selectedRouteIds = []
      this.resolvers = {}
      this.routesOnLink = []
      this.stopMarkers = []
      this.searchText = ''
    },
  },

  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.debounceHandleSearchText = debounce(this.handleSearchText, 350)
    this.clearData()

    // populate props after we attach, not before!
    this.myState.subfolder = this.subfolder
    this.myState.yamlConfig = this.yamlConfig ?? ''
    this.myState.thumbnail = this.thumbnail

    const status = await this.getVizDetails()
    if (!status) return

    if (this.thumbnail) return

    // If we don't have a network file yet, try and find one
    if (!this.vizDetails.network) await this.findInputFiles()

    // background layers
    try {
      this.backgroundLayers = new BackgroundLayers({
        vizDetails: this.vizDetails,
        fileApi: this.fileApi,
        subfolder: this.subfolder,
      })
      await this.backgroundLayers.initialLoad()
    } catch (e) {
      this.$emit('error', 'Error loading background layers')
    }

    this.loadEverything()
  },

  beforeUnmount() {
    //@ts-ignore
    delete window.__testdata__
    this.clearData()

    this.task.api?.[Comlink.releaseProxy]()
    this.task.worker?.terminate()
    this.task.api = null
    this.task.worker = null
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@use '@/variables' as *;

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
  background-color: var(--bgPanel);
  vertical-align: center;
  padding: 0.5rem 3rem;
  margin: auto auto;
  width: 25rem;
  height: 5rem;
  max-height: 20rem;
  border: 3px solid #cccccc80;

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
  padding: 0 0.5rem 0.75rem 0;

  // Oruga's root here is a bare `.control` and Bulma 1.x doesn't stretch `.input`,
  // so both need saying explicitly or the box keeps its default ~20ch width.
  :deep(.control),
  :deep(input) {
    width: 100%;
  }
}

.load-progress {
  width: auto;
  height: 3px;
  margin: 2px 5rem 0.5rem 5rem;
  // Bulma rounds progress bars; the original Buefy one was square
  border-radius: 0;
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
  z-index: 10;
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
  // NB: a `padding` shorthand here would zero out theme-oruga's vertical
  // padding and collapse the slider -- set the sides only.
  width: 10rem;
  padding-left: 1rem;
  padding-right: 1rem;
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
.xbutton {
  width: 100%;
}

.xbutton:hover {
  background-color: var(--bgSplash);
}
.network-options {
  margin-top: 0.5rem;
  overflow-y: auto;
}

@media only screen and (max-width: 640px) {
  .main-layout {
    display: flex;
    flex-direction: column;
  }

  .dragger {
    display: none;
  }

  .right-panel-holder {
    flex: 1;
    width: 100% !important;
  }

  .right-side-column p {
    display: none;
  }
}
</style>
