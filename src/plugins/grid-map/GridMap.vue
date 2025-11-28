<template lang="pug">
.grid-map-view(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${id}`")

      MapComponent(
        v-if="!thumbnail && isLoaded"
        v-bind="mapProps"
        :negativeValues="valuesIncludeNeg"
      )

      zoom-buttons(v-if="!thumbnail && isLoaded" corner="top-left")

      .top-right
        .gui-config(:id="configId")

      click-through-times.time-slider-area( v-if="isLoaded && this.vizDetails.timeSelector && this.vizDetails.timeSelector == 'discrete'"
        :allTimes="allTimes"
        :range="timeRange"
        @timeUpdate="handleDiscreteTimeValues"
      )

      time-slider.time-slider-area(v-if="isLoaded && (!this.vizDetails.timeSelector || this.vizDetails.timeSelector == 'slider')"
        :range="timeRange"
        :allTimes="allTimes"
        @timeExtent="handleTimeSliderValues"
      )

      .message(v-if="!thumbnail && myState.statusMessage")
        p.status-message {{ myState.statusMessage }}

      .tooltip(v-if="tooltip" v-html="tooltip.html" :style="tooltip.style")

</template>

<script lang="ts">
import Vue from 'vue'
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import GUI from 'lil-gui'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'
import colormap from 'colormap'

import avro from '@/js/avro'
import globalStore from '@/store'
import util from '@/js/util'
import { hexToRgb, getColorRampHexCodes, Ramp } from '@/js/ColorsAndWidths'

import { ColorScheme, FileSystemConfig, Status } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import Coords from '@/js/Coords'

import DashboardDataManager from '@/js/DashboardDataManager'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import ClickThroughTimes from '@/components/ClickThroughTimes.vue'
import TimeSlider from '@/components/TimeSliderV2.vue'
import MapComponent from './MapComponent.vue'
import BackgroundLayers from '@/js/BackgroundLayers'

// interface for each time object inside the mapData Array
export interface MapData {
  time: Number
  colorData: Uint8Array
  values: Float32Array
  opacityValues: Float32Array
  centroid: Float32Array
  numberOfFilledColors?: Number
  numberOfFilledValues?: Number
  numberOfFilledCentroids?: Number
  length: Number
}

export interface CompleteMapData {
  mapData: MapData[]
  scaledFactor: Number
  unit: String
}

interface VizDetail {
  colorRamp: any
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  elements?: string
  cellSize: number
  maxHeight: number
  userColorRamp: string
  opacity: number
  center: any
  zoom: number
  mapIsIndependent?: boolean
  breakpoints?: string
  opacityColumn: string
  valueColumn: string
  secondValueColumn?: string
  diff?: boolean
  unit: string
  timeSelector: any
}

interface GuiConfig {
  buckets: number
  exponent: number
  radius: number
  opacity: number
  height: number
  'color ramp': string
  'upper bound': number
  'lower bound': number
  'bounds enabled': boolean
  colorRamps: String[]
  flip: Boolean
  steps: number
  opacityColumn: string
  valueColumn: string
  secondValueColumn: string
  diff: boolean
}

interface StandaloneYAMLconfig {
  title: String
  description: String
  file: String
  projection: String
  thumbnail: String
  cellSize: number
  opacity: number
  maxHeight: number
  userColorRamp: string
  center: number[]
  zoom: number
  mapIsIndependent: boolean
}

interface MapProps {
  viewId: number
  colorRamp: String
  coverage: number
  dark: boolean
  data: CompleteMapData
  currentTimeIndex: number | undefined
  mapIsIndependent: boolean | undefined
  maxHeight: number
  userColorRamp: string
  cellSize: number
  opacity: number
  colorDataDigits: number
  upperPercentile: number
  cbTooltip?: any
  bgLayers?: null | BackgroundLayers
}

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

const GridMap = defineComponent({
  name: 'GridMapPlugin',
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    MapComponent,
    ToggleButton,
    ZoomButtons,
    ClickThroughTimes,
    TimeSlider,
  },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
    datamanager: { type: Object as PropType<DashboardDataManager> },
  },

  data() {
    const colorRamps = [
      'Inferno',
      'Magma',
      'Viridis',
      'Greens',
      'Reds',
      'RdYlGn (div)',
      'greenRed (div)',
      'RdBu',
    ]
    return {
      id: Math.floor(1e12 * Math.random()),
      standaloneYAMLconfig: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        cellSize: 250,
        opacity: 0.7,
        maxHeight: 0,
        userColorRamp: 'Viridis',
        center: null as any,
        zoom: 9,
        mapIsIndependent: false,
      } as StandaloneYAMLconfig,
      colorRamps,
      columnLookup: [] as number[],
      gzipWorker: null as Worker | null,
      colorRamp: colorRamps[0] as String,
      globalState: globalStore.state,
      globalMaxValue: Number.POSITIVE_INFINITY,
      globalMinValue: Number.NEGATIVE_INFINITY,
      valuesIncludeNeg: false as boolean,
      tooltip: null as null | { html: any; style: any },
      backgroundLayers: null as null | BackgroundLayers,
      mediaQuery: null as any,

      vizDetails: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        cellSize: 250,
        opacity: 0.7,
        maxHeight: 0,
        userColorRamp: 'viridis',
        center: null as any,
        zoom: 9,
        breakpoints: null as any,
        opacityColumn: '',
        valueColumn: 'value',
        secondValueColumn: '',
        diff: false,
        unit: '',
        timeSelector: null as any,
      } as VizDetail,
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },
      data: null as any,
      colorDataDigits: 3,
      selectedTimeData: [] as any[],
      allTimePeriodes: [] as any[],
      csv: {} as any,
      colors: colormap({
        colormap: 'Viridis',
        nshades: 10,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2], 255]) as Uint8Array[],
      currentTime: [0, 0] as Number[],
      timeToIndex: new Map<Number, number>(),
      guiConfig: {
        buckets: 10,
        exponent: 4,
        radius: 150,
        opacity: 1,
        height: 100,
        'color ramp': 'Viridis',
        'upper bound': 100,
        'lower bound': -100,
        'bounds enabled': true,
        colorRamps: colorRamps,
        flip: false,
        steps: 10,
        opacityColumn: 'none',
        valueColumn: '',
        secondValueColumn: '',
        diff: false,
      } as GuiConfig,
      configId: `gui-config-${Math.floor(1e12 * Math.random())}` as string,
      guiController: null as GUI | null,
      minRadius: 50 as number,
      maxRadius: 500 as number,
      radiusStep: 5 as number,
      isLoaded: false as boolean,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;" as string,
      timeRange: [Infinity, -Infinity] as Number[],
      allTimes: [] as number[],
      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      availableColumns: [] as string[],
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

    mapProps(): MapProps {
      //@ts-ignore
      window.__testdata__ = this.data

      return {
        viewId: this.id,
        colorRamp: this.colorRamp,
        coverage: 0.65,
        dark: this.$store.state.isDarkMode,
        data: this.data,
        currentTimeIndex: this.timeToIndex.get(this.currentTime[0]) || 0,
        mapIsIndependent: this.vizDetails.mapIsIndependent || false,
        maxHeight: this.guiConfig.height,
        colorDataDigits: this.colorDataDigits,
        userColorRamp: this.guiConfig['color ramp'],
        cellSize: this.guiConfig.radius,
        opacity: this.guiConfig.opacity,
        upperPercentile: 100,
        cbTooltip: this.cbTooltip,
        bgLayers: this.backgroundLayers,
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
  watch: {},

  methods: {
    cbTooltip(tip: { html: any; style: any }, object: any) {
      if (!object) {
        this.tooltip = null
        return
      }
      tip.style.left = `${16 + object.devicePixel[0]}px`
      tip.style.bottom = `${16 + object.devicePixel[1]}px`
      this.tooltip = tip
    },

    /**
     * Selects a color based on the given value.
     * @param {number} value - The value influencing color selection (0-100).
     * @returns {number[]} - An RGBA color array [R, G, B, A].
     */
    pickColor(
      value: number,
      from_min: number,
      from_max: number,
      to_min: number,
      to_max: number
    ): number[] | Uint8Array {
      if (this.guiConfig['bounds enabled']) {
        const upper = this.guiConfig['upper bound']
        const lower = this.guiConfig['lower bound']
        // 'cut' values which are outside the bounds
        if (upper !== Infinity && lower !== -Infinity) {
          // rescale value to 0-100 based on the bounds
          value = Math.max(Math.min(value, upper), lower)
          value = ((value - lower) / (upper - lower)) * 100
        }
      } else if (!this.valuesIncludeNeg) {
        // Error handling: If the value is outside the valid range, return a default color.
        if (Number.isNaN(value) || value < 0 || value > 100) {
          // console.warn('Invalid value for pickColor: Value should be between 0 and 100.')
          return [0, 0, 0, 0] // Default color (transparent)
        }
      } else {
        // For negative values, we want to map the value to a color scale where 0 is in the middle
        let absMax: number

        // Original behavior when bounds are disabled
        absMax = Math.max(Math.abs(from_min), Math.abs(from_max))
        const normalizedValue = value / absMax
        value = (normalizedValue + 1) * 50
      }

      // Check if the colorRamp is fixed and if the length of the breakpoints array is equal to the length of the fixedColors array minus one.
      if (
        this.vizDetails.colorRamp.breakpoints &&
        this.vizDetails.colorRamp.breakpoints.length ==
          this.vizDetails.colorRamp.fixedColors.length - 1
      ) {
        // If the value is within the range of the colorRamp, return the corresponding color.
        for (let i = 0; i < this.vizDetails.colorRamp.breakpoints.length - 1; i++) {
          if (
            value > this.vizDetails.colorRamp.breakpoints[i] &&
            value <= this.vizDetails.colorRamp.breakpoints[i + 1]
          ) {
            return hexToRgb(this.vizDetails.colorRamp.fixedColors[i + 1])
          }
        }

        // If the value is below the first breakpoint, return the first color.
        if (value < this.vizDetails.colorRamp.breakpoints[0]) {
          return hexToRgb(this.vizDetails.colorRamp.fixedColors[0])
        }

        // If the value is above the last breakpoint, return the last color.
        if (
          value >=
          this.vizDetails.colorRamp.breakpoints[this.vizDetails.colorRamp.breakpoints.length - 1]
        ) {
          return hexToRgb(
            this.vizDetails.colorRamp.fixedColors[this.vizDetails.colorRamp.fixedColors.length - 1]
          )
        }
        return new Uint8Array([255, 255, 255, 255])
      } else {
        // Calculate the index based on the value and the number of colors in the array.
        const index = Math.floor((value / 100) * (this.colors.length - 1))
        // Return the selected color.
        return this.colors[index]
      }
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
      if (this.config) {
        this.validateYAML()
        this.vizDetails = Object.assign({ colorRamp: '' }, this.config) as VizDetail
        this.setRadiusAndHeight()
        this.setCustomGuiConfig()
        return
      }

      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      if (hasYaml) {
        await this.loadStandaloneYAMLConfig()
      } else {
        this.loadOutputTripsConfig()
      }
    },

    loadOutputTripsConfig() {
      let projection = '' // 'EPSG:31468' // 'EPSG:25832', // 'EPSG:31468', // TODO: fix
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
        colorRamp: this.vizDetails.colorRamp,
        opacity: this.vizDetails.opacity,
        maxHeight: this.vizDetails.maxHeight,
        userColorRamp: this.vizDetails.userColorRamp,
        center: this.vizDetails.center,
        zoom: this.vizDetails.zoom,
        opacityColumn: this.vizDetails.opacityColumn,
        valueColumn: this.vizDetails.valueColumn,
        secondValueColumn: this.vizDetails.secondValueColumn,
        diff: this.vizDetails.diff,
        unit: this.vizDetails.unit,
        timeSelector: this.vizDetails.timeSelector,
      }
      this.$emit('title', this.vizDetails.title)
      this.solveProjection()
      return
    },

    // TODO: Set default values for color attributes
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
      try {
        // Determine the full filename, handling cases where yamlConfig might include '/'
        const filename = this.myState.yamlConfig.includes('/')
          ? this.myState.yamlConfig
          : `${this.myState.subfolder}/${this.myState.yamlConfig}`

        // Load the YAML file and store it in standaloneYAMLconfig
        const text = await this.fileApi.getFileText(filename)
        this.standaloneYAMLconfig = YAML.parse(text)

        // YAML file validation
        this.validateYAML()

        // Set visualization details
        this.setVizDetails()
      } catch (err) {
        // Show error message in the Warning/Error Panel
        const errorMessage = `File not found: ${this.myState.subfolder}/${this.myState.yamlConfig}`
        this.$emit('error', errorMessage)
      }
    },

    validateYAML() {
      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)
      let configuration = {} as any

      if (hasYaml) {
        console.log('has yaml')
        configuration = this.standaloneYAMLconfig
      } else {
        console.log('no yaml')
        configuration = this.config
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

      if (configuration.maxHeight < 0) {
        this.$store.commit('setStatus', {
          type: Status.WARNING,
          msg: `maxHeight is out of the recommended range `,
          desc: 'maxHeight should be greater than 0',
        })
      }

      // TODO: Add warnings for color attributes
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      this.setRadiusAndHeight()

      const t = this.vizDetails.title ? this.vizDetails.title : 'Grid Map'
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

    setMapCenter() {
      // If user gave us the center, use it
      if (this.vizDetails.center) {
        if (typeof this.vizDetails.center == 'string') {
          this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
        }

        const view = {
          longitude: this.vizDetails.center[0],
          latitude: this.vizDetails.center[1],
          bearing: 10,
          pitch: 0,
          zoom: this.vizDetails.zoom || 10, // use 10 default if we don't have a zoom
          jump: true, // move the map no matter what
          center: [this.vizDetails.center[0], this.vizDetails.center[1]],
        }

        // Sets the map to the specified data
        this.$store.commit('setMapCamera', view)
      }
    },

    async loadAndPrepareData() {
      if (this.vizDetails.file.indexOf('.avro') > -1) {
        return await this.loadAndPrepareAvroData()
      } else {
        return await this.loadAndPrepareCSVData()
      }
    },

    async loadAndPrepareAvroData() {
      const filename = `${this.subfolder}/${this.vizDetails.file}`
      const blob = await this.fileApi.getFileBlob(filename)

      const records: any[] = await new Promise((resolve, _) => {
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

      // Store the min and max value to calculate the scale factor
      let minValue = Number.POSITIVE_INFINITY
      let maxValue = Number.NEGATIVE_INFINITY

      const record = records[0]

      this.allTimes = record.timestamps
      this.allTimes = this.allTimes.sort((n1, n2) => n1 - n2)
      this.timeRange[0] = this.allTimes[0]
      this.timeRange[1] = this.allTimes[this.allTimes.length - 1]

      const tableName = Object.keys(record.data)[0]
      const dataValues: number[] = record.data[tableName]

      // calc scale
      for (const value of dataValues) {
        maxValue = Math.max(maxValue, value)
        minValue = Math.min(minValue, value)
      }
      const scaleFactor = maxValue > 0 ? 100 / maxValue : 0

      if (this.vizDetails.unit == undefined) {
        this.vizDetails.unit = ''
      }

      const finalData = {
        mapData: [] as MapData[],
        scaledFactor: scaleFactor as Number,
        unit: this.vizDetails.unit,
      } as CompleteMapData

      const x = record.xCoords
      const y = record.yCoords
      const numPoints = x.length * y.length

      // Load CRS/projection from Avro file if exists
      if (record.crs) this.vizDetails.projection = record.crs

      // User must provide projection
      if (!this.vizDetails.projection) {
        const msg = 'No coordinate projection. Add "projection: EPSG:xxxx" to config'
        this.$emit('error', msg)
        // throw Error(msg)
      }

      // Build x/y-coordinates (just once - always the same)
      const centroid = new Float32Array(numPoints * 2)
      let offset = 0
      for (let ix = 0; ix < x.length; ix++) {
        for (let iy = 0; iy < y.length; iy++) {
          let wgs84 = [x[ix], y[iy]]
          wgs84 = Coords.toLngLat(this.vizDetails.projection, wgs84)
          centroid[offset] = wgs84[0]
          centroid[offset + 1] = wgs84[1]
          offset += 2
        }
      }
      // map all times to their index and create a mapData object for each time
      this.allTimes.forEach((time, index) => {
        this.timeToIndex.set(time, index)

        finalData.mapData.push({
          length: numPoints,
          time: time,
          centroid,
          values: new Float32Array(numPoints),
          opacityValues: new Float32Array(numPoints),
          colorData: new Uint8Array(numPoints * 3),
        })
      })

      // Loop through the data and create the data object for the map
      for (let timeIndex = 0; timeIndex < this.allTimes.length; timeIndex++) {
        console.log('time', timeIndex)
        for (let i = 0; i < numPoints; i++) {
          const offset = timeIndex * numPoints + i
          const value = scaleFactor * dataValues[offset]
          // commented out to test csv function - will work on in next commit - Brendan 15.05.2025
          // const colors = this.pickColor(value)

          // add final values to the mapData
          finalData.mapData[timeIndex].values[i] = value
          for (let j = 0; j < 3; j++) {
            // finalData.mapData[timeIndex].colorData[i * 3 + j] = colors[j]
          }
        }
      }

      this.myState.statusMessage = ''
      return finalData
    },

    async loadAndPrepareCSVData() {
      this.allTimes = []
      this.timeToIndex.clear()

      const config = { dataset: this.vizDetails.file }
      let csv = {} as any

      try {
        csv = await this.myDataManager.getDataset(config, { subfolder: this.subfolder })
      } catch (e) {
        this.$emit('error', '' + e) // `Error loading ${this.vizDetails.file}: File missing? CSV Too large?`)
      }

      // The datamanager doesn't return the comments...
      if (csv.comments && csv.comments.length) {
        csv.comments.forEach((comment: string) => {
          if (comment.includes('EPSG')) {
            const projection = comment.substring(comment.lastIndexOf('EPSG')).trim()
            if (projection) this.vizDetails.projection = projection
          }
        })
      }

      // auto detects the valueColumn
      let vc = this.vizDetails.valueColumn || ''
      if (!csv.allRows[vc]) {
        // use all columns except x, y, time
        const candidates = Object.keys(csv.allRows).filter(k => !['x', 'y', 'time'].includes(k))
        // optional: use only the first numeric column
        const numeric = candidates.filter(k =>
          Array.from(csv.allRows[k].values).every(v => typeof v === 'number')
        )
        vc = (numeric.length ? numeric[0] : candidates[0]) || ''
        this.vizDetails.valueColumn = vc
        // console.warn('valueColumn not found with automatic selection')
        // console.log('vc: ', vc)
      }

      const valuesArr1 = csv.allRows[this.vizDetails.valueColumn].values as Float32Array
      let valuesArr2: Float32Array | undefined
      if (this.vizDetails.diff && this.vizDetails.secondValueColumn) {
        valuesArr2 = csv.allRows[this.vizDetails.secondValueColumn]!.values as Float32Array
      }

      const timeArr = csv.allRows.time.values as Float32Array

      // Store the min and max value to calculate the scale factor

      this.availableColumns = Object.keys(csv.allRows).filter(k => !['x', 'y', 'time'].includes(k))
      this.guiConfig.valueColumn = this.vizDetails.valueColumn
      this.guiConfig.secondValueColumn = this.vizDetails.secondValueColumn || ''

      let minValue = Number.POSITIVE_INFINITY
      let maxValue = Number.NEGATIVE_INFINITY

      // billy is completely redoing this part that was batshit insane. Just get the mix/max omg!
      const allTimes = new Set()
      if (valuesArr2) {
        // it's probably a diff
        for (let i = 0; i < valuesArr1.length; i++) {
          const raw = this.vizDetails.diff ? valuesArr1[i] - valuesArr2[i] : valuesArr1[i]
          maxValue = Math.max(maxValue, raw)
          minValue = Math.min(minValue, raw)
          allTimes.add(timeArr[i])
        }
      } else {
        // just one array, not a diff
        for (let i = 0; i < valuesArr1.length; i++) {
          maxValue = Math.max(maxValue, valuesArr1[i])
          minValue = Math.min(minValue, valuesArr1[i])
          allTimes.add(timeArr[i])
        }
      }
      this.valuesIncludeNeg = minValue < 0
      this.allTimes = [...allTimes].sort((n1: any, n2: any) => n1 - n2) as number[]

      this.timeRange[0] = Math.min.apply(Math, this.allTimes)
      this.timeRange[1] = Math.max.apply(Math, this.allTimes)

      // Count elements per time
      const numberOfElementsPerTime = Math.ceil(valuesArr1.length / this.allTimes.length)

      // scaling values to color scale of 0 - 100 (if negative)
      let from_min = minValue
      let from_max = maxValue
      let to_min = 0 // as long as this is zero, it doesn't need to be added to maxValue scaling below
      let to_max = 100
      if (this.valuesIncludeNeg) {
        maxValue = ((maxValue - from_min) * to_max) / (from_max - from_min) // formula is: x -> (x - from_min) * (to_max - to_min) / (from_max - from_min) + to_min
      }
      this.globalMinValue = from_min
      this.globalMaxValue = from_max
      const scaleFactor = maxValue !== 0 ? 100 / maxValue : 0

      const finalData = {
        mapData: [] as MapData[],
        scaledFactor: scaleFactor as Number,
        unit: this.vizDetails.unit || '',
      } as CompleteMapData

      // this.mapProps.colorDataDigits = 3

      if (this.guiConfig.opacityColumn != 'none') {
        this.colorDataDigits = 4
      } else {
        this.colorDataDigits = 3
      }
      // map all times to their index and create a mapData object for each time
      this.allTimes.forEach((time, index) => {
        this.timeToIndex.set(time, index)

        finalData.mapData.push({
          time,
          values: new Float32Array(numberOfElementsPerTime),
          opacityValues: new Float32Array(numberOfElementsPerTime),
          centroid: new Float32Array(numberOfElementsPerTime * 2),
          colorData: new Uint8Array(numberOfElementsPerTime * this.colorDataDigits),
          numberOfFilledValues: 0,
          numberOfFilledCentroids: 0,
          numberOfFilledColors: 0,
          length: numberOfElementsPerTime,
        })
      })

      // User must provide projection
      if (!this.vizDetails.projection) {
        const msg = 'No coordinate projection. Add "projection: EPSG:xxxx" to config'
        this.$emit('error', msg)
        throw Error(msg)
      }

      // Loop through the data and create the data object for the map
      for (let i = 0; i < valuesArr1.length; i++) {
        // index for the time
        const index = this.timeToIndex.get(timeArr[i]) as number

        let raw = valuesArr1[i]
        if (valuesArr2 && this.vizDetails.diff) {
          raw = raw - valuesArr2[i]
        }

        const value = scaleFactor * raw

        const colors = this.pickColor(value, from_min, from_max, to_min, to_max)

        // Save index for next position in the array
        const lastValueIndex = finalData.mapData[index].numberOfFilledValues as number
        const lastColorIndex = finalData.mapData[index].numberOfFilledColors as number
        const lastCentroidIndex = finalData.mapData[index].numberOfFilledCentroids as number

        // Save the value
        finalData.mapData[index].values[lastValueIndex] = value

        // Loop through the colors and add them to the mapData

        if (this.guiConfig.opacityColumn != 'none') {
          var opacityColArr

          let oc = this.vizDetails.opacityColumn || ''
          if (!csv.allRows[oc]) {
            console.error(
              'column for opacity values not found, defaulting to standard opacity funcitonality with slider.'
            )
          } else {
            opacityColArr = csv.allRows[this.vizDetails.opacityColumn].values as Float32Array

            // get min and max for 0-1 value scaling
            let minOpacityValue = Number.POSITIVE_INFINITY
            let maxOpacityValue = Number.NEGATIVE_INFINITY
            for (let i = 0; i < opacityColArr.length; i++) {
              if (opacityColArr[i] < minOpacityValue) minOpacityValue = opacityColArr[i]
              if (opacityColArr[i] > maxOpacityValue) maxOpacityValue = opacityColArr[i]
            }
            // Save opacity value
            finalData.mapData[index].opacityValues[lastValueIndex] =
              Math.round(
                ((opacityColArr[i] - minOpacityValue) / (maxOpacityValue - minOpacityValue)) * 100
              ) / 100
            if (finalData.mapData[index].opacityValues[lastValueIndex] == 0)
              finalData.mapData[index].opacityValues[lastValueIndex] = 0.01
            for (let j = 0; j < 4; j++) {
              // set 4th value to opacity value
              if (j == 3) {
                finalData.mapData[index].colorData[lastColorIndex + j] = Math.round(
                  finalData.mapData[index].opacityValues[lastValueIndex] * 255
                )
              } else {
                finalData.mapData[index].colorData[lastColorIndex + j] = colors[j]
              }
            }
          }
        } else {
          for (let j = 0; j < 3; j++) {
            finalData.mapData[index].colorData[lastColorIndex + j] = colors[j]
          }
        }

        // Convert coordinates
        let wgs84 = [csv.allRows.x.values[i], csv.allRows.y.values[i]]

        if (this.vizDetails.projection !== 'EPSG:4326') {
          wgs84 = Coords.toLngLat(this.vizDetails.projection, wgs84)
        }

        // Add centroids to the mapData
        finalData.mapData[index].centroid[lastCentroidIndex] = wgs84[0]
        finalData.mapData[index].centroid[lastCentroidIndex + 1] = wgs84[1]

        // Update the number of values for time array in the mapData
        finalData.mapData[index].numberOfFilledValues = lastValueIndex + 1
        finalData.mapData[index].numberOfFilledCentroids = lastCentroidIndex + 2
        if (this.guiConfig.opacityColumn != 'none') {
          finalData.mapData[index].numberOfFilledColors = lastColorIndex + 4
        } else {
          finalData.mapData[index].numberOfFilledColors = lastColorIndex + 3
        }
      }

      // Clean data (delete numberOfFilledXXXX)
      Array.from(this.allTimes.keys()).forEach((index: number) => {
        delete finalData.mapData[index].numberOfFilledValues
        delete finalData.mapData[index].numberOfFilledCentroids
        delete finalData.mapData[index].numberOfFilledColors
      })

      this.myState.statusMessage = ''
      return finalData
    },

    resolveProjection() {
      if (this.vizDetails.projection === 'EPSG:4326') return

      for (let i = 0; i < this.data.length; i++) {
        const wgs84 = Coords.toLngLat(this.vizDetails.projection, this.data[i].centroid)
        this.data[i].centroid = wgs84
      }
    },

    handleDiscreteTimeValues(timeUpdate: { extent: number; index: number }) {
      this.currentTime[0] = timeUpdate.extent
      this.selectedTimeData = []

      for (let i = 0; i < this.data.mapData.length; i++) {
        if (String(this.data.mapData[i].time) == String(timeUpdate.extent)) {
          this.selectedTimeData.push(this.data.mapData[i].values)
        }
      }
      this.setColors()
    },

    handleTimeSliderValues(timeValues: any[]) {
      this.currentTime = timeValues

      this.selectedTimeData = []

      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i].time == timeValues[0]) {
          this.selectedTimeData.push(this.data[i])
        }
      }
    },

    setupGui() {
      let width = 200

      if (this.mediaQuery.matchMedia) {
        width = 175
      }
      const guiConfig = {
        title: 'Settings',
        injectStyles: true,
        width: width,
        container: document.getElementById(this.configId) || undefined,
      }

      this.guiController = new GUI(guiConfig)

      const config = this.guiController // .addFolder('Colors')
      config.add(this.guiConfig, 'radius', this.minRadius, this.maxRadius, this.radiusStep)
      config.add(this.guiConfig, 'opacity', 0, 1, 0.1)
      config.add(this.guiConfig, 'height', 0, 250, 5)

      // Diff checkbox
      config
        .add(this.guiConfig, 'diff')
        .name('Diff')
        .onChange((useDiff: boolean) => {
          // toggle the visibility of the second column dropdown
          if (useDiff) secondCtrl.show()
          else secondCtrl.hide()

          this.handleDiffChange(useDiff)
        })

      let availableOpacityColumns = ['none'].concat(this.availableColumns)
      // Dropdown for the first column
      if (availableOpacityColumns.length > 0) {
        config
          .add(this.guiConfig, 'opacityColumn', availableOpacityColumns)
          .name('Opacity column')
          .onChange((newCol: string) => {
            this.handleOpacityColumnChange(newCol)
          })
      }

      // Dropdown for the first column
      if (this.availableColumns.length > 0) {
        config
          .add(this.guiConfig, 'valueColumn', this.availableColumns)
          .name('1st column')
          .onChange((newCol: string) => {
            this.handleColumnChange(newCol)
          })
      }

      // Dropdown for the second column
      const secondCtrl = config
        .add(this.guiConfig, 'secondValueColumn', ['', ...this.availableColumns])
        .name('2nd column')
        .onChange((col2: string) => this.handleSecondColumnChange(col2))

      if (this.guiConfig.diff) secondCtrl.show()
      else secondCtrl.hide()

      // diverging
      if (!this.vizDetails.colorRamp || !this.vizDetails.colorRamp.breakpoints) {
        const colors = config.addFolder('Colors')
        colors
          .add(this.guiConfig, 'color ramp', this.guiConfig.colorRamps)
          .onChange((newRamp: string) => {
            const rawRamp = newRamp
            // get the color scale type based on the suffix
            const type = rawRamp.endsWith(' (div)') ? 'diverging' : 'sequential'
            this.computeBounds(type)
            this.setColors()
          })
        colors.add(this.guiConfig, 'flip').onChange(this.setColors)
        colors.add(this.guiConfig, 'steps', 2, 50, 1).onChange(this.setColors)
        const divergingScales = config.addFolder('Color Bounds')
        divergingScales
          .add(this.guiConfig, 'bounds enabled')
          .name('Enable Bounds')
          .onChange(this.setColors)
        divergingScales
          .add(this.guiConfig, 'lower bound')
          .name('Lower Bound')
          .onChange(this.setColors)
          .listen()
          .onChange((value: number) => {
            this.guiConfig['lower bound'] = Number(value.toFixed(2))
            this.setColors()
          })
        divergingScales
          .add(this.guiConfig, 'upper bound')
          .name('Upper Bound')
          .onChange(this.setColors)
          .listen()
          .onChange((value: number) => {
            this.guiConfig['upper bound'] = Number(value.toFixed(2))
            this.setColors()
          })
        this.setColors()
      }
    },

    /*
     * This method computes the bounds for the color scale based on the global min and max values.
     */
    computeBounds(type: 'diverging' | 'sequential') {
      const min = this.globalMinValue
      const max = this.globalMaxValue

      if (type === 'diverging') {
        const absMax = Math.max(Math.abs(min), Math.abs(max))
        // Set the upper bound to the max(abs(values)) and the lower bound to -max(abs(values))
        this.guiConfig['upper bound'] = Number(absMax.toFixed(2))
        this.guiConfig['lower bound'] = Number((-absMax).toFixed(2))
        console.log('Diverging bounds set:', {
          upper: this.guiConfig['upper bound'],
          lower: this.guiConfig['lower bound'],
        })
      } else {
        // User for the sequential color scale the real min and max values
        this.guiConfig['upper bound'] = Number(max.toFixed(2))
        this.guiConfig['lower bound'] = Number(min.toFixed(2))
        console.log('Sequential bounds set:', {
          upper: this.guiConfig['upper bound'],
          lower: this.guiConfig['lower bound'],
        })
      }
    },

    /*
     * This method is called when the first column is changed to update the data and colors.
     */
    async handleOpacityColumnChange(newCol: string) {
      this.vizDetails.opacityColumn = newCol
      this.data = await this.loadAndPrepareData()
      this.setColors()
    },

    async handleColumnChange(newCol: string) {
      this.vizDetails.valueColumn = newCol
      this.data = await this.loadAndPrepareData()
      this.setColors()
    },

    /**
     * This method is called when the diff checkbox is toggled.
     */
    async handleDiffChange(useDiff: boolean) {
      this.vizDetails.diff = useDiff

      // reload the data and set the colors
      this.data = await this.loadAndPrepareData()
      this.setColors()

      // reset the slider to the last time slot
      const last = this.allTimes[this.allTimes.length - 1]
      this.currentTime = [last, last]
    },

    windowResize() {
      this.mediaQuery = window.matchMedia('(max-width: 600px)')
      if (this.mediaQuery.matches && this.guiController) {
        this.guiController.root.close()
      } else if (!this.mediaQuery.matches && this.guiController) {
        this.guiController.root.open()
      }
    },

    /**
     * * This method is called when the second column is changed to update the data and colors.
     */
    async handleSecondColumnChange(col2: string) {
      this.vizDetails.secondValueColumn = col2

      // reload the data and set the colors
      this.data = await this.loadAndPrepareData()
      this.setColors()

      // reset the slider to the last time slot
      const last = this.allTimes[this.allTimes.length - 1]
      this.currentTime = [last, last]
    },

    setColors() {
      if (!this.data) return

      const rawRamp = this.guiConfig['color ramp'] as string
      // remove the suffix " (div)" if it exists
      const baseRamp = rawRamp.replace(/\s*\(div\)$/, '')
      // give only the shortened name to the getColorRampHexCodes function
      const ramp = { ramp: baseRamp } as Ramp
      const color = getColorRampHexCodes(ramp, this.guiConfig.steps)

      // get the type of the scale based on the suffix
      // const type = rawRamp.endsWith(' (div)') ? 'diverging' : 'sequential'
      // console.log('Color ramp type:', type)

      if (color.length) {
        this.colors = []
      }

      this.colors = this.hexArrayToRgbArray(color)

      // scaling values using global values saved in loadAndPrepareCsvData
      let from_min = this.globalMinValue
      let from_max = this.globalMaxValue
      let to_min = 0
      let to_max = 100

      if (this.guiConfig.flip) this.colors = this.colors.reverse()

      // Recalculating the color values for the colorRamp
      for (let i = 0; i < this.data.mapData.length; i++) {
        for (let j = 0; j < this.data.mapData[i].values.length; j++) {
          const value = this.data.mapData[i].values[j]

          const colors = this.pickColor(value, from_min, from_max, to_min, to_max)
          if (colors == undefined) break

          if (this.guiConfig.opacityColumn == 'none') {
            for (let colorIndex = j * 3; colorIndex <= j * 3 + 2; colorIndex++) {
              this.data.mapData[i].colorData[colorIndex] = colors[colorIndex % 3]
            }
          } else {
            try {
              for (let colorIndex = j * 4; colorIndex <= j * 4 + 3; colorIndex++) {
                // set 4th value to opacity value
                if ((colorIndex + 1) % 4 == 0) {
                  this.data.mapData[i].colorData[colorIndex] = Math.round(
                    this.data.mapData[i].opacityValues[j] * 255
                  )
                } else {
                  this.data.mapData[i].colorData[colorIndex] = colors[colorIndex % 4]
                }
              }
            } catch (e) {
              this.$emit('error', '' + e) // `Error loading ${this.vizDetails.file}: File missing? CSV Too large?`)
            }
          }
        }
      }

      // force Vue to take notice of the change - any prop change will do
      this.data = { ...this.data }
    },

    hexArrayToRgbArray(hexArray: string[]): any {
      const rgbArray = []
      for (let i = 0; i < hexArray.length; i++) {
        const hex = hexArray[i].replace(/^#/, '')
        const r = parseInt(hex.substring(0, 2), 16)
        const g = parseInt(hex.substring(2, 4), 16)
        const b = parseInt(hex.substring(4, 6), 16)
        rgbArray.push([r, g, b, 255])
      }
      return rgbArray
    },

    setCustomGuiConfig() {
      if (!this.config) return

      if (this.config.colorRamp) {
        if (this.config.colorRamp.ramp != undefined)
          this.guiConfig['color ramp'] = this.config.colorRamp.ramp

        if (this.config.colorRamp.reverse != undefined)
          this.guiConfig.flip = this.config.colorRamp.reverse

        if (this.config.colorRamp.steps != undefined)
          this.guiConfig.steps = this.config.colorRamp.steps

        if (this.config.colorRamp.upperBound != undefined)
          this.guiConfig['upper bound'] = this.config.colorRamp.upperBound

        if (this.config.colorRamp.lowerBound != undefined)
          this.guiConfig['lower bound'] = this.config.colorRamp.lowerBound

        if (this.config.colorRamp.boundsEnabled != undefined)
          this.guiConfig['bounds enabled'] = this.config.colorRamp.boundsEnabled
      }

      // Set custom radius
      if (this.config.cellSize >= this.minRadius && this.config.cellSize <= this.maxRadius) {
        this.guiConfig.radius = this.config.cellSize
      }

      // Set custom maxHeight
      if (this.config.maxHeight !== undefined) this.guiConfig.height = this.config.maxHeight

      // Set custom opacity
      if (this.config.opacity) this.guiConfig.opacity = this.config.opacity

      if (typeof this.config.diff === 'boolean') {
        this.guiConfig.diff = this.config.diff
        this.vizDetails.diff = this.config.diff
      }

      if (typeof this.config.secondValueColumn === 'string') {
        this.guiConfig.secondValueColumn = this.config.secondValueColumn
        this.vizDetails.secondValueColumn = this.config.secondValueColumn
      }
    },
  },

  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    this.data = await this.loadAndPrepareData()
    // this.$emit('error', 'Error loading ' + this.vizDetails.file)

    // gets the color scale type from the color ramp name
    const rawRamp = this.guiConfig['color ramp'] as string
    const type = rawRamp.endsWith(' (div)') ? 'diverging' : 'sequential'

    // Calc the bounds only if they are not set in the config
    if (!this.config?.colorRamp || this.config.colorRamp.boundsEnabled === undefined) {
      this.computeBounds(type)
    }

    this.mediaQuery = window.matchMedia('(max-width: 600px)')

    this.setupGui()

    if (this.mediaQuery.matches && this.guiController) {
      this.vizDetails.zoom = 8
      this.guiController.root.close()
    } else if (!this.mediaQuery.matches && this.guiController) {
      this.guiController.root.open()
    }

    this.setColors()
    // this.buildThumbnail()
    this.isLoaded = true
    this.setMapCenter()

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
  },

  beforeDestroy() {
    //@ts-ignore
    delete window.__testdata__

    this.data = null
    this.guiController?.destroy()

    this.$store.commit('setFullScreen', false)
  },
})

export default GridMap
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.grid-map-view {
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

.grid-map-view.hide-thumbnail {
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
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  padding: 0.5rem 0.5rem;
  filter: $filterShadow;
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
  margin: 0 9rem 0 0.5rem;
  filter: $filterShadow;
  z-index: 3;
}

@media only screen and (max-width: 640px) {
  z .message {
    padding: 0.5rem 0.5rem;
  }

  .right-side {
    font-size: 0.6rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }
}
</style>
