<template lang="pug">
    .xy-hexagons(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${id}`")
    
      xy-hex-deck-map.hex-layer(
        v-if="!thumbnail && isLoaded"
        v-bind="mapProps"
      )
    
      zoom-buttons(v-if="!thumbnail")
      //- drawing-tool.drawing-tool(v-if="!thumbnail")

      .top-right
        .gui-config(:id="configId")
    
      .left-side(v-if="isLoaded && !thumbnail && vizDetails.title")
        collapsible-panel(direction="left" :locked="true")
          .panel-items(v-if="hexStats" style="color: #c0f;")
            p.big(style="margin-top: 2rem;") {{ $t('selection') }}:
            h3(style="margin-top: -1rem;") {{ $t('areas') }}: {{ hexStats.numHexagons }}, {{ $t('count') }}: {{ hexStats.rows }}
            button.button(style="color: #c0f; border-color: #c0f") {{ $t('showDetails') }}
    
      //- .control-panel(v-if="isLoaded && !thumbnail && !myState.statusMessage")
            //- :class="{'is-dashboard': config !== undefined }"

            //- viz-configurator(v-if="isLoaded"
            //-   :embedded="true"
            //-   :fileSystem="fileSystem"
            //-   :subfolder="subfolder"
            //-   :vizDetails="vizDetails"
            //-   :datasets="data"
            //-   :legendStore="legendStore"
            //- )

            //- .panel-item
            //-   p.ui-label {{ $t('maxHeight') }}: {{ vizDetails.maxHeight }}
            //-   b-slider.ui-slider(v-model="vizDetails.maxHeight"
            //-     size="is-small"
            //-     :min="0" :max="250" :step="5"
            //-     :duration="0" :dotSize="12"
            //-     :tooltip="false"
            //-   )
    
              //- p.ui-label Hex Radius: {{ vizDetails.cellSize }}
              //- b-slider.ui-slider(v-model="vizDetails.cellSize"
              //-   size="is-small"
              //-   :min="50" :max="2000" :step="5"
              //-   :duration="0" :dotSize="12"
              //-   :tooltip="false"
              //- )

              //- p.ui-label Opacity: {{ vizDetails.opacity }}
              //- b-slider.ui-slider(v-model="vizDetails.opacity"
              //-   size="is-small"
              //-   :min="0" :max="1" :step="0.1"
              //-   :duration="0" :dotSize="12"
              //-   :tooltip="false"
              //- )
            //- .panel-item
            //-   h4 Aktueller Wert
            //-   p(v-if="hoverValue") {{ parseFloat((hoverValue).toFixed(4)) }}
            //-   p(v-else) - 
            //-   h4 Letzter Wert 
            //-   p(v-if="clickedValue") {{ parseFloat((clickedValue).toFixed(4)) }}
            //-   p(v-else) -
    
      time-slider.time-slider-area(v-if="isLoaded"
        :range="timeRange"
        :allTimes="allTimes"
        @timeExtent="handleTimeSliderValues"
      )

      .message(v-if="!thumbnail && myState.statusMessage")
        p.status-message {{ myState.statusMessage }}
    
    </template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      loading: 'Loading data...',
      sorting: 'Sorting into bins...',
      aggregate: 'Summary',
      maxHeight: '3D Height',
      showDetails: 'Show Details',
      selection: 'Selection',
      areas: 'Areas',
      count: 'Count',
    },
    de: {
      loading: 'Dateien laden...',
      sorting: 'Sortieren...',
      aggregate: 'Daten',
      maxHeight: '3-D Höhe',
      showDetails: 'Details anzeigen',
      selection: 'Ausgewählt',
      areas: 'Orte',
      count: 'Anzahl',
    },
  },
}
import Vue from 'vue'
import { defineComponent } from 'vue'

import GUI from 'lil-gui'
import LegendStore from '@/js/LegendStore'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'
import Papa from '@simwrapper/papaparse'

import util from '@/js/util'
import globalStore from '@/store'
import { REACT_VIEW_HANDLES } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import Coords from '@/js/Coords'

import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
// import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import XyHexDeckMap from './GridMap'
import TimeSlider from '@/components/TimeSliderV2.vue'

import colormap from 'colormap'

import { ColorScheme, FileSystemConfig, Status } from '@/Globals'

// interface for each time object inside the mapData Array
export interface MapData {
  time: Number
  colorData: Uint8Array
  values: Float32Array
  centroid: Float32Array
  numberOfFilledColors?: Number
  numberOfFilledValues?: Number
  numberOfFilledCentroids?: Number
  length: Number
}

export interface CompleteMapData {
  mapData: MapData[]
  scaledFactor: Number
}

interface VizDetail {
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  elements?: string
  cellSize: number
  maxHeight: number
  opacity: number
  center: any
  zoom: number
  mapIsIndependent?: boolean
  breakpoints?: string
}

const GridMap = defineComponent({
  name: 'GridMapPlugin',
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    XyHexDeckMap,
    ToggleButton,
    ZoomButtons,
    // VizConfigurator,
    TimeSlider,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
  },
  data: () => {
    const colorRamps = ['bathymetry', 'par', 'chlorophyll', 'magma']
    return {
      // legendStore: new LegendStore(),
      id: `id-${Math.floor(1e12 * Math.random())}` as any,
      standaloneYAMLconfig: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        cellSize: 250,
        opacity: 0.7,
        maxHeight: 0,
        center: null as any,
        zoom: 9,
        mapIsIndependent: false,
      },
      YAMLrequirementsXY: { file: '', aggregations: {} },
      colorRamps,
      buttonColors: ['#5E8AAE', '#BF7230', '#269367', '#9C439C'],
      columnLookup: [] as number[],
      gzipWorker: null as Worker | null,
      colorRamp: colorRamps[0],
      globalState: globalStore.state,
      vizDetails: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        cellSize: 250,
        opacity: 0.7,
        maxHeight: 0,
        center: null as any,
        zoom: 9,
        breakpoints: null as any,
      } as VizDetail,
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },
      data: null as any,

      selectedTimeData: [] as any[],
      /////// Data reorgaisation stuff
      allTimePeriodes: [] as any[],
      colors: colormap({
        colormap: 'chlorophyll',
        nshades: 10,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2], 255]),
      currentTime: [0, 0] as Number[],
      // Map to map the time to the index of the time array
      timeToIndex: new Map<Number, number>(),
      // GUI Window
      showCustomBreakpoints: false,
      guiConfig: {
        buckets: 10,
        exponent: 4,
        radius: 5, // DONE
        opacity: 1,
        height: 100,
        'clip max': 100,
        'color ramp': 'viridis',
        colorRamps: [
          'bathymetry',
          'electric',
          'inferno',
          'jet',
          'magma',
          'par',
          'viridis',
          'chlorophyll',
        ],
        flip: false,
        // @ts-ignore ->
        // 'Custom breakpoints...': this.toggleModalDialog,
        'Custom breakpoints...': '',
        'manual breaks': '',
      },
      configId: `gui-config-${Math.floor(1e12 * Math.random())}` as any,
      guiController: null as GUI | null,
      breakpoints: [0.0],
      legendStore: null as LegendStore | null,
      minRadius: 50,
      maxRadius: 300,
      radiusStep: 5,
      ///////
      rowCache: {} as {
        [id: string]: { raw: Float32Array; length: number; coordColumns: number[] }
      },
      requests: { raw: new Float32Array(0), length: 0 } as { raw: Float32Array; length: number },
      highlightedTrips: [] as any[],
      searchTerm: '',
      searchEnabled: false,
      isLoaded: false,
      activeAggregation: '',
      isHighlightingZone: false,
      multiSelectedHexagons: {} as { [index: string]: any[] },
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      hexStats: null as null | {
        rows: number
        numHexagons: number
        selectedHexagonIds: any[]
      },
      resizer: null as ResizeObserver | null,
      hoverValue: null as any,
      clickedValue: null as any,
      // startTime: 0 as Number,
      // isAnimating: false as Boolean,
      timeRange: [Infinity, -Infinity] as Number[],
      // timeBinSize: Infinity as Number,
      allTimes: [] as number[],
      // timesliderModuloValue: Number.POSITIVE_INFINITY,
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

    urlThumbnail(): any {
      return this.thumbnailUrl
    },

    buttonLabel(): string {
      // const [group, offset] = this.activeAggregation.split('~') as any[]
      // return this.aggregations[group][offset].title
      return ''
    },
    extrudeTowers(): boolean {
      return this.vizDetails.maxHeight > 0
    },

    mapProps(): any {
      return {
        viewId: this.id,
        colorRamp: this.colorRamp,
        coverage: 0.65,
        dark: this.$store.state.isDarkMode,
        // data: this.requests,
        // data: this.selectedTimeData,
        // data: this.data,
        // data: {},
        data: this.data,
        // currentTimeIndex: this.currentTime[0],
        currentTimeIndex: this.timeToIndex.get(this.currentTime[0]),
        extrude: this.extrudeTowers,
        highlights: this.highlightedTrips,
        mapIsIndependent: this.vizDetails.mapIsIndependent,
        // maxHeight: this.vizDetails.maxHeight,
        maxHeight: this.guiConfig.height,
        metric: this.buttonLabel,
        // cellSize: this.vizDetails.cellSize,
        cellSize: this.guiConfig.radius,
        // opacity: this.vizDetails.opacity,
        opacity: this.guiConfig.opacity,
        selectedHexStats: this.hexStats,
        upperPercentile: 100,
        onClick: this.handleClick,
        onHover: this.handleHover,
      }
    },
    textColor(): any {
      const lightmode = {
        text: '#3498db',
        bg: '#eeeef480',
      }

      const darkmode = {
        text: 'white',
        bg: '#181518aa',
      }

      return this.$store.state.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
    },
  },
  watch: {
    vizDetails() {
      // console.log(this.vizDetails.maxHeight)
    },
    extrudeTowers() {
      if (this.extrudeTowers && this.globalState.viewState.pitch == 0) {
        globalStore.commit(
          'setMapCamera',
          Object.assign({}, this.globalState.viewState, { pitch: 10 })
        )
      }
    },
    '$store.state.viewState'() {
      if (this.vizDetails.mapIsIndependent) return
      if (REACT_VIEW_HANDLES[this.id]) REACT_VIEW_HANDLES[this.id]()
    },
  },
  methods: {
    toggleModalDialog() {
      this.showCustomBreakpoints = !this.showCustomBreakpoints
    },
    pickColor(value: number) {
      // console.log(value)
      if (value == 0) return [0, 0, 0, 0]
      const index = Math.floor((value / 100) * (this.colors.length - 1))
      return this.colors[index]
    },
    handleClick(target: any, event: any) {
      if (!target.layer) return
      this.clickedValue = target.object.value
    },
    handleHover(target: any, event: any) {
      if (!target.layer && !target.object) return
      if (target.object != undefined) this.hoverValue = target.object.value
    },
    async solveProjection() {
      console.log('solveProjection')
      if (this.thumbnail) return

      console.log('WHAT PROJECTION:')

      try {
        const text = await this.fileApi.getFileText(
          this.myState.subfolder + '/' + this.myState.yamlConfig
        )
        this.vizDetails = YAML.parse(text)
      } catch (e) {
        console.error(e)
      }
    },

    async getVizDetails() {
      console.log('getVizDetails')
      if (this.config) {
        this.validateYAML()
        this.vizDetails = Object.assign({}, this.config) as VizDetail
        this.setRadiusAndHeight()
        this.setCustomGuiConfig()
        return
      }

      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      if (hasYaml) {
        await this.loadStandaloneYAMLConfig()
      } else {
        console.log('loadOutputTripsConfig')
        this.loadOutputTripsConfig()
      }
    },

    loadOutputTripsConfig() {
      let projection = 'EPSG:31468' // 'EPSG:25832', // 'EPSG:31468', // TODO: fix
      if (!this.myState.thumbnail) {
        projection = prompt('Enter projection: e.g. "EPSG:31468"') || 'EPSG:31468'
        if (!!parseInt(projection, 10)) projection = 'EPSG:' + projection
      }
      this.vizDetails = {
        title: 'Output Trips',
        description: this.myState.yamlConfig,
        file: this.myState.yamlConfig,
        projection,
        cellSize: this.vizDetails.cellSize,
        opacity: this.vizDetails.opacity,
        maxHeight: this.vizDetails.maxHeight,
        center: this.vizDetails.center,
        zoom: this.vizDetails.zoom,
      }
      this.$emit('title', this.vizDetails.title)
      this.solveProjection()
      return
    },

    setRadiusAndHeight() {
      if (!this.vizDetails.cellSize) {
        Vue.set(this.vizDetails, 'cellSize', 250)
      }

      if (!this.vizDetails.maxHeight) {
        Vue.set(this.vizDetails, 'maxHeight', 0)
      }

      if (!this.vizDetails.opacity) {
        Vue.set(this.vizDetails, 'opacity', 0.7)
      }
    },

    async loadStandaloneYAMLConfig() {
      console.log('loadStandaloneYAMLConfig')
      try {
        // might be a project config:
        const filename =
          this.myState.yamlConfig.indexOf('/') > -1
            ? this.myState.yamlConfig
            : this.myState.subfolder + '/' + this.myState.yamlConfig

        const text = await this.fileApi.getFileText(filename)
        this.standaloneYAMLconfig = Object.assign({}, YAML.parse(text))
        this.validateYAML()
        this.setVizDetails()
      } catch (err) {
        const e = err as any
        console.log('failed')

        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `File not found`,
          desc: `Could not find: ${this.myState.subfolder}/${this.myState.yamlConfig}`,
        })
      }
    },

    validateYAML() {
      console.log('in yaml validation 2')

      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)
      let configuration = {} as any

      if (hasYaml) {
        console.log('has yaml')
        configuration = this.standaloneYAMLconfig
      } else {
        console.log('no yaml')
        configuration = this.config
      }

      for (const key in this.YAMLrequirementsXY) {
        if (!(key in configuration)) {
          this.$store.commit('setStatus', {
            type: Status.ERROR,
            msg: `${this.yamlConfig}: missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsXY for required keys',
          })
        }
      }

      if (configuration.cellSize == 0) {
        this.$store.commit('setStatus', {
          type: Status.WARNING,
          msg: `Radius is out of the recommended range`,
          desc: 'Radius can not be zero, preset value used instead. ',
        })
      }

      if (configuration.opacity <= 0 || configuration.opacity > 1) {
        this.$store.commit('setStatus', {
          type: Status.WARNING,
          msg: `Opacity set to zero`,
          desc: 'Opacity levels should be between 0 and 1. ',
        })
      }

      if (configuration.zoom < 5 || configuration.zoom > 20) {
        this.$store.commit('setStatus', {
          type: Status.WARNING,
          msg: `Zoom is out of the recommended range `,
          desc: 'Zoom levels should be between 5 and 20. ',
        })
      }
    },

    setupLogoMover() {
      this.resizer = new ResizeObserver(this.moveLogo)
      const deckmap = document.getElementById(`id-${this.id}`) as HTMLElement
      this.resizer.observe(deckmap)
    },

    moveLogo() {
      const deckmap = document.getElementById(`id-${this.id}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      this.setRadiusAndHeight()

      const t = this.vizDetails.title ? this.vizDetails.title : 'Hex Aggregation'
      this.$emit('title', t)
    },

    async buildThumbnail() {
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.myState.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await blob.arrayBuffer()
          const base64 = util.arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },

    selectedHexagonStatistics(): {
      rows: number
      numHexagons: number
      selectedHexagonIds: any[]
    } | null {
      const selectedHexes = Object.keys(this.multiSelectedHexagons).map(a => parseInt(a))
      if (!selectedHexes.length) return null

      const arrays = Object.values(this.multiSelectedHexagons)
      const ll = arrays.reduce((a: number, v: any) => a + v.length, 0)

      return { rows: ll, numHexagons: selectedHexes.length, selectedHexagonIds: selectedHexes }
    },

    setMapCenter() {
      console.log(this.vizDetails)
      //   const data = Object.values(this.rowCache)[0].raw

      // If user gave us the center, use it
      if (this.vizDetails.center) {
        if (typeof this.vizDetails.center == 'string') {
          this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
        }

        const view = {
          longitude: this.vizDetails.center[0],
          latitude: this.vizDetails.center[1],
          bearing: 0,
          pitch: 0,
          zoom: this.vizDetails.zoom || 10, // use 10 default if we don't have a zoom
          jump: true, // move the map no matter what
          center: [this.vizDetails.center[0], this.vizDetails.center[1]],
        }

        // bounce our map
        if (REACT_VIEW_HANDLES[this.id]) {
          REACT_VIEW_HANDLES[this.id](view)
          console.log(REACT_VIEW_HANDLES)
        }

        // Sets the map to the specified data
        this.$store.commit('setMapCamera', view)

        return
      }
    },

    async loadFile() {
      console.log('loadFile()')
      const rawText = await this.fileApi.getFileText(this.subfolder + '/' + this.vizDetails.file)
      const csv = Papa.parse(rawText, {
        comments: '#',
        delimitersToGuess: [';', '\t', ',', ' '],
        dynamicTyping: true,
        header: true,
        skipEmptyLines: true,
      })

      const projection = csv.comments[0].split('#')[1].trim()
      if (projection) this.vizDetails.projection = projection

      // Store the min and max value to calculate the scale factor
      let minValue = Number.POSITIVE_INFINITY
      let maxValue = Number.NEGATIVE_INFINITY

      // This for loop collects all the data that's used by
      for (let i = 0; i < csv.data.length; i++) {
        // Stores all times to calculate the range and the timeBinSize
        if (!this.allTimes.includes(csv.data[i].time)) this.allTimes.push(csv.data[i].time)

        // calculate the min and max value
        if (csv.data[i].value < minValue) minValue = csv.data[i].value
        if (csv.data[i].value > maxValue) maxValue = csv.data[i].value

        // Store all different times
        if (!this.allTimes.includes(csv.data[i].time)) this.allTimes.push(csv.data[i].time)
      }

      this.allTimes = this.allTimes.sort((n1, n2) => n1 - n2)

      this.timeRange[0] = Math.min.apply(Math, this.allTimes)
      this.timeRange[1] = Math.max.apply(Math, this.allTimes)

      // Count elements per time
      const numberOfElementsPerTime = Math.ceil(csv.data.length / this.allTimes.length)

      // scaleFactor
      const scaleFactor = 100 / maxValue

      const finalData = {
        mapData: [] as MapData[],
        scaledFactor: scaleFactor as Number,
      } as CompleteMapData

      // map all times to their index and create a mapData object for each time
      this.allTimes.forEach((time, index) => {
        this.timeToIndex.set(time, index)

        finalData.mapData.push({
          time: time,
          values: new Float32Array(numberOfElementsPerTime),
          centroid: new Float32Array(numberOfElementsPerTime * 2),
          colorData: new Uint8Array(numberOfElementsPerTime * 4),
          numberOfFilledValues: 0,
          numberOfFilledCentroids: 0,
          numberOfFilledColors: 0,
          length: numberOfElementsPerTime,
        })
      })

      // Loop through the data and create the data object for the map
      for (let i = 0; i < csv.data.length; i++) {
        // index for the time
        const index = this.timeToIndex.get(csv.data[i].time) as number

        const value = scaleFactor * csv.data[i].value
        const colors = this.pickColor(value)

        // Save index for next position in the array
        const lastValueIndex = finalData.mapData[index].numberOfFilledValues as number
        const lastColorIndex = finalData.mapData[index].numberOfFilledColors as number
        const lastCentroidIndex = finalData.mapData[index].numberOfFilledCentroids as number

        // Save the value
        finalData.mapData[index].values[lastValueIndex] = value

        // Loop through the colors and add them to the mapData
        for (let j = 0; j < 4; j++) {
          finalData.mapData[index].colorData[lastColorIndex + j] = colors[j]
        }

        // Convert coordinates
        let wgs84 = [csv.data[i].x, csv.data[i].y]
        if (this.vizDetails.projection !== 'EPSG:4326') {
          wgs84 = Coords.toLngLat(this.vizDetails.projection, [csv.data[i].x, csv.data[i].y])
        }

        // Add centroids to the mapData
        finalData.mapData[index].centroid[lastCentroidIndex] = wgs84[0]
        finalData.mapData[index].centroid[lastCentroidIndex + 1] = wgs84[1]

        // Update the number of values for time array in the mapData
        finalData.mapData[index].numberOfFilledValues = lastValueIndex + 1
        finalData.mapData[index].numberOfFilledCentroids = lastCentroidIndex + 2
        finalData.mapData[index].numberOfFilledColors = lastColorIndex + 4
      }

      // Clean data (delete numberOfFilledXXXX)
      Array.from(this.allTimes.keys()).forEach((index: number) => {
        delete finalData.mapData[index].numberOfFilledValues
        delete finalData.mapData[index].numberOfFilledCentroids
        delete finalData.mapData[index].numberOfFilledColors
      })

      // for (time in timeToIndex)
      this.myState.statusMessage = ''
      console.log('DATA: ', finalData)
      return finalData
    },

    // TODO: setMapCenter() and moveLogo()

    resolveProjection() {
      if (this.vizDetails.projection === 'EPSG:4326') return

      for (let i = 0; i < this.data.length; i++) {
        const wgs84 = Coords.toLngLat(this.vizDetails.projection, this.data[i].centroid)
        this.data[i].centroid = wgs84
      }
    },

    handleTimeSliderValues(timeValues: any[]) {
      this.currentTime = timeValues

      this.selectedTimeData = []

      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i].time == timeValues[0]) {
          this.selectedTimeData.push(this.data[i])
          console.log(this.data[i].time)
        }
      }
    },

    setupGui() {
      this.guiController = new GUI({
        title: 'Settings',
        injectStyles: true,
        width: 200,
        container: document.getElementById(this.configId) || undefined,
      })

      const config = this.guiController // .addFolder('Colors')
      config.add(this.guiConfig, 'radius', this.minRadius, this.maxRadius, this.radiusStep)
      config.add(this.guiConfig, 'opacity', 0, 1, 0.1)
      config.add(this.guiConfig, 'height', 0, 250, 5)

      const colors = config.addFolder('colors')
      colors.add(this.guiConfig, 'color ramp', this.guiConfig.colorRamps).onChange(this.setColors)
      colors.add(this.guiConfig, 'flip').onChange(this.setColors)

      const breakpoints = config.addFolder('breakpoints')
      breakpoints.add(this.guiConfig, 'buckets', 2, 19, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'clip max', 0, 100, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'exponent', 1, 10, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'Custom breakpoints...', 1, 100, 1)
    },

    setColors() {
      console.log('this.colors before', this.colors)
      const EXPONENT = this.guiConfig.exponent // powerFunction // 4 // log-e? not steep enough

      let colors256 = colormap({
        colormap: this.guiConfig['color ramp'],
        nshades: 256,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2]])

      if (this.guiConfig.flip) colors256 = colors256.reverse()

      const step = 256 / (this.guiConfig.buckets - 1)
      const colors = []
      for (let i = 0; i < this.guiConfig.buckets - 1; i++) {
        colors.push(colors256[Math.round(step * i)])
      }
      colors.push(colors256[255])

      // This is not working, we have to recalculate every single value because the colors are not calculated by the map
      this.colors = colors
      // this.colors.n
      // console.log('this.colors after', this.colors)

      for (let i = 0; i < this.data.mapData.length; i++) {
        let count = 0

        for (let j = 0; j < this.data.mapData[i].values.length; j++) {
          const value = this.data.mapData[i].values[j]
          const colors = this.pickColor(value)

          // if (colors[0] == 0 && colors[3] == 0 && colors[2] == 0) count++

          // let sum = 0
          // for (let i = 0; i < colors.length; i++) sum += colors[i]
          // if (sum > 0) console.log(sum)

          for (let colorIndex = j * 4; colorIndex <= j * 4 + 3; colorIndex++) {
            this.data.mapData[i].colorData[colorIndex] = colors[colorIndex % 4]
            // console.log(colorIndex)
          }
        }

        // console.log(i + ': ' + count)
        // count = 0
      }

      console.log(this.data.mapData)

      // // figure out min and max
      // // TODO!!!!!!!! REMOVE COMMENT!
      // // const max1 = Math.pow(this.range[1], 1 / EXPONENT)
      // const max1 = Math.pow(100, 1 / EXPONENT)
      // const max2 = (max1 * this.guiConfig['clip max']) / 100.0
      // // const clippedMin = (this.range[1] * this.clipData[0]) / 100.0
      // // console.log({ max1, max2 })

      // // Generate breakpoints only if there are not already set
      // if (!this.vizDetails.breakpoints) {
      //   const breakpoints = [] as number[]
      //   for (let i = 1; i < this.guiConfig.buckets; i++) {
      //     const raw = (max2 * i) / this.guiConfig.buckets
      //     const breakpoint = Math.pow(raw, EXPONENT)
      //     breakpoints.push(breakpoint)
      //   }

      //   this.breakpoints = breakpoints
      // }

      // // only update legend if we have the full dataset already
      // if (this.isLoaded) this.setLegend(colors, this.breakpoints)

      // console.log(this.colors)
    },

    setLegend(colors: any[], breakpoints: number[]) {
      // hide the legend if there is no data to show.
      // TODO!!!!!!!! REMOVE COMMENT!
      // if (this.range[1] - this.range[0] === 0) return

      this.legendStore = new LegendStore()
      this.legendStore.setLegendSection({
        section: 'Legend',
        column: 'Legend',
        values: colors.map((rgb, index) => {
          const breakpoint = breakpoints[index == 0 ? index : index - 1]
          let label = '' + Math.round(1e6 * breakpoint) / 1e6
          if (index == 0) label = '< ' + label
          if (index == colors.length - 1) label = '> ' + label
          return { label, value: rgb }
        }),
      })
      this.breakpoints = breakpoints
    },

    setCustomGuiConfig() {
      if (!this.config) return

      console.log(this.config)
      console.log(this.config.cellSize, this.minRadius, this.maxRadius)

      // Set custom radius
      if (this.config.cellSize >= this.minRadius && this.config.cellSize <= this.maxRadius) {
        this.guiConfig.radius = this.config.cellSize
      }

      console.log(this.guiConfig.radius)

      // Set custom maxHeight
      if (this.config.maxHeight) this.guiConfig.height = this.config.maxHeight

      // Set custom opacity
      if (this.config.opacity) this.guiConfig.opacity = this.config.opacity

      // if (Object.prototype.toString.call(this.config.breakpoints) === '[object Array]') {
      //   // Only breakpoints
      //   this.setManualBreakpoints(this.config.breakpoints)
      // } else {
      //   // Set custom breakpoints
      //   if (this.config.breakpoints) {
      //     if (this.config.breakpoints.values.length + 1 != this.config.breakpoints.colors.length) {
      //       this.$store.commit('setStatus', {
      //         type: Status.ERROR,
      //         msg: `Wrong number of colors and values for the breakpoints.`,
      //         desc: `Number of colors: ${this.config.breakpoints.colors.length}, Number of values: ${this.config.breakpoints.values.length}, Must apply: Number of colors = number of values plus one.`,
      //       })
      //     } else {
      //       this.guiConfig.buckets = this.config.breakpoints.colors.length
      //       this.breakpoints = this.config.breakpoints.values
      //       this.colors = this.config.breakpoints.colors
      //     }
      //   }
      // }
    },

    setManualBreakpoints(breakpoints: number[]) {
      this.breakpoints = breakpoints
      this.guiConfig.buckets = 1 + breakpoints.length
    },
  },

  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    console.log(this.myState)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()

    if (this.thumbnail) return

    this.setupLogoMover()

    console.log(this.guiConfig)

    this.setupGui()

    this.myState.statusMessage = `${this.$i18n.t('loading')}`
    // this.aggregations = this.vizDetails.aggregations

    // console.log('loading files')
    // await this.loadFiles()
    this.data = await this.loadFile()

    // this.resolveProjection()
    // this.processData()
    // this.mapState.center = this.findCenter(this.rawRequests)

    this.buildThumbnail()

    this.isLoaded = true
    // this.handleOrigDest(Object.keys(this.aggregations)[0], 0) // show first data

    this.setMapCenter()
    console.log('ID: ', this.id)

    console.log(this.data)
    console.log(this.isLoaded)
  },

  beforeDestroy() {
    // MUST erase the React view handle to prevent gigantic memory leak!
    REACT_VIEW_HANDLES[this.id] = undefined
    delete REACT_VIEW_HANDLES[this.id]

    try {
      if (this.gzipWorker) {
        this.gzipWorker.terminate()
      }
    } catch (e) {
      console.warn(e)
    }

    // if (this.animator) window.cancelAnimationFrame(this.animator)

    this.$store.commit('setFullScreen', false)
  },
})

export default GridMap
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.xy-hexagons {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') center / cover no-repeat;
  z-index: -1;
}

.xy-hexagons.hide-thumbnail {
  background: none;
  z-index: 0;
}

.message {
  z-index: 5;
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  box-shadow: 0px 2px 10px #22222222;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0.5rem 1.5rem;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    font-size: 1.2rem;
    line-height: 1.5rem;
    font-weight: normal;
    color: var(--textFancy);
  }
}

.ui-slider {
  padding: 0 0;
  margin: 0.2rem 0 0.6rem 0;
  min-width: 7rem;
}

.status-message {
  font-size: 1.5rem;
  line-height: 1.75rem;
  font-weight: bold;
}

.big {
  padding: 0.5rem 0;
  font-size: 1.5rem;
  line-height: 1.7rem;
  font-weight: bold;
}

.top-right {
  background-color: var(--bgPanel2);
  color: white;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 5;
  border-left: 1px solid #66669940;
  border-bottom: 1px solid #66669940;
  box-shadow: 0px 0px 5px 3px rgba(128, 128, 128, 0.1);
}

.left-side {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  margin: 0 0 0 0;
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

.hex-layer {
  pointer-events: auto;
}

.ui-label {
  font-size: 0.8rem;
  font-weight: bold;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
}

.panel-items {
  margin: 0.5rem 0.5rem;
}

.panel-item {
  display: flex;
  flex-direction: column;
  margin-right: 1rem;
  margin-left: 0.25rem;
}

.right {
  margin-left: auto;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
}

.row {
  display: 'grid';
  grid-template-columns: 'auto 1fr';
}

.drawing-tool {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.time-slider-area {
  position: absolute;
  bottom: 0.5rem;
  left: 0;
  right: 0;
  margin: 0 1rem 0 1rem;
  filter: $filterShadow;
}

@media only screen and (max-width: 640px) {
  .message {
    padding: 0.5rem 0.5rem;
  }

  .right-side {
    font-size: 0.7rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }
}
</style>
