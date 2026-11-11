<template lang="pug">
.grid-map-view(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${id}`")

  .main-layout(
    @mousemove="dividerDragging"
    @mouseup="dividerDragEnd"
  )
    .main-panel
      MapComponent(
        v-if="isLoaded"
        v-bind="mapProps"
        :negativeValues="valuesIncludeNeg"
      )

      zoom-buttons(
        v-if="!thumbnail && isLoaded"
        corner="top-left"
        :show3dToggle="true"
        :is3dBuildings="show3dBuildings"
        :onToggle3dBuildings="toggle3dBuildings"
      )

      click-through-times.time-slider-area( v-if="isLoaded && vizDetails.timeSelector && vizDetails.timeSelector == 'discrete'"
        :allTimes="allTimes"
        :range="timeRange"
        @timeUpdate="handleDiscreteTimeValues"
      )

      time-slider.time-slider-area(v-if="isLoaded && (!vizDetails.timeSelector || vizDetails.timeSelector == 'slider')"
        :range="timeRange"
        :allTimes="allTimes"
        @timeExtent="handleTimeSliderValues"
      )

      .tooltip(v-if="tooltip" v-html="tooltip.html" :style="tooltip.style")

    .dragger(v-if="!thumbnail"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

    .right-panel(v-if="!thumbnail" :style="{width: `${legendSectionWidth}px`}")
      SummaryChart(v-if="isLoaded && legendSectionWidth > 100"
        :distribution="summary"
        :column="valueTitle"
        :secondColumn="compareTitle"
        :unit="vizDetails.unit"
        :threshold="guiConfig.threshold"
        :width="legendSectionWidth - 16"
      )
      .gui-config(:id="configId")

    .message(v-if="myState.statusMessage")
        p.status-message {{ myState.statusMessage }}


</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import type { PropType } from 'vue'

import * as Comlink from 'comlink'
import GUI from 'lil-gui'
import YAML from 'yaml'

import { getAvro } from '@/js/avro'
import globalStore from '@/store'
import util, { sleep, unreactive } from '@/js/util'
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
import SummaryChart from './SummaryChart.vue'
import BackgroundLayers from '@/js/BackgroundLayers'
import GridMapWorker from './GridMap.worker.ts?worker'
import type { ColorOptions, CumulativeShare, GridMapTask } from './GridMap.worker'

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
  /** dataColumns mode: unscaled values of each column in columnLabels, per cell */
  columnValues?: Float32Array[]
}

export interface CompleteMapData {
  mapData: MapData[]
  scaledFactor: Number
  unit: String
  /** dataColumns mode: labels of the columns whose values the tooltip lists */
  columnLabels?: string[]
}

/** one toggle button of the YAML dataColumns section */
interface DataColumn {
  label: string
  column: string
}

interface VizDetail {
  colorRamp: any
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  elements?: string
  buildings3d?: boolean
  show3dBuildings?: boolean
  cellSize: number
  maxHeight: number
  userColorRamp: string
  opacity: number
  center: any
  zoom: number
  mapIsIndependent?: boolean
  breakpoints?: string
  opacityColumn: string
  /** with dataColumns: the label (or list of labels) of the buttons that start out on */
  valueColumn: string
  /** with dataColumns: the label(s) of the Compare-to buttons that start out on */
  secondValueColumn?: string
  diff?: boolean
  /** toggle buttons in place of the column dropdowns; cells show the max of those on */
  dataColumns?: DataColumn[]
  unit: string
  timeSelector: any
  /** threshold slider direction at startup: gray out cells 'less' or 'greater' than it */
  thresholdGrayOut?: string
  /** summary chart weights cells by this column; default 'population'. If missing, by cell count */
  populationColumn?: string
}

interface GuiConfig {
  buckets: number
  exponent: number
  radius: number
  opacity: number
  height: number
  show3dBuildings: boolean
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
  threshold: number
  /** gray out cells 'less' (at or below) or 'greater' (at or above) than the threshold */
  thresholdMode: 'less' | 'greater'
}

/** cells grayed out by the threshold slider get this RGBA color: #80808020 */
const THRESHOLD_COLOR = [128, 128, 128, 32]

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
  show3dBuildings?: boolean
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
      threshold: 'Threshold',
      grayOut: 'Gray out',
      lessThan: 'less than',
      greaterThan: 'greater than',
      dataColumns: 'Data columns',
      compareTo: 'Compare to',
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
      threshold: 'Schwelle',
      grayOut: 'Ausgrauen',
      lessThan: 'kleiner als',
      greaterThan: 'größer als',
      dataColumns: 'Datenspalten',
      compareTo: 'Vergleichen mit',
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
    ZoomButtons,
    ClickThroughTimes,
    TimeSlider,
    SummaryChart,
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
      'RdBu (div)',
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
      // All loading math and coloring happens in this worker, which caches the data.
      // Comlink remotes must never be stored directly in reactive state (they answer
      // every property read, which sends Vue's toRaw into infinite recursion), so they
      // live in this raw holder. colorRequest drops recolors that a newer one superseded.
      calc: markRaw({
        worker: null as Worker | null,
        task: null as Comlink.Remote<GridMapTask> | null,
        colorRequest: 0,
      }),
      // Threshold shading: the worker's unshaded colors per time period, and the slider.
      // Only the time period on display is shaded, from a copy of its base colors.
      // off: the user left the slider at the end that grays nothing, so it follows that
      // end as the values change. Otherwise their limit stays put.
      // isDifference: whether the slider's values were a diff, the last time it was set up.
      shading: markRaw({
        baseColors: [] as Uint8Array[],
        controller: null as any,
        off: true,
        isDifference: false,
      }),
      // Summary chart: cumulative share of population by value, for the time on display.
      // busy/again: one worker request at a time (see updateSummaryChart). dataVersion
      // counts prepare() calls, so a curve of the previous column is never drawn.
      summaryChart: markRaw({ busy: false, again: false, dataVersion: 0 }),
      /** markRaw'd: only ever replaced, and Plotly reads it as is */
      summary: null as CumulativeShare | null,
      /** unscaled [min, max] per time period, from the worker */
      valueRanges: [] as [number, number][],
      /** threshold slider range for the time period on display */
      thresholdRange: [0, 0] as [number, number],
      currentTime: [0, 0] as Number[],
      timeToIndex: new Map<Number, number>(),
      guiConfig: {
        buckets: 10,
        exponent: 4,
        radius: 150,
        opacity: 1,
        height: 100,
        show3dBuildings: false,
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
        threshold: 0,
        thresholdMode: 'less',
      } as GuiConfig,
      configId: `gui-config-${Math.floor(1e12 * Math.random())}` as string,
      guiController: null as GUI | null,
      minRadius: 50 as number,
      maxRadius: 500 as number,
      radiusStep: 5 as number,
      isLoaded: false as boolean,
      show3dBuildings: false,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat" as string,
      timeRange: [Infinity, -Infinity] as Number[],
      allTimes: [] as number[],
      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      availableColumns: [] as string[],
      /** the YAML dataColumns that passed validation; empty means the column dropdowns */
      dataColumns: [] as DataColumn[],
      /** labels of the dataColumns buttons that are on, in dataColumns order */
      columnPicks: { data: [] as string[], compare: [] as string[] },
      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 300,
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

    currentTimeIndex(): number {
      return this.timeToIndex.get(this.currentTime[1]) || 0
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
        currentTimeIndex: this.currentTimeIndex,
        mapIsIndependent: this.vizDetails.mapIsIndependent || false,
        maxHeight: this.guiConfig.height,
        colorDataDigits: this.colorDataDigits,
        userColorRamp: this.guiConfig['color ramp'],
        cellSize: this.guiConfig.radius,
        opacity: this.guiConfig.opacity,
        upperPercentile: 100,
        cbTooltip: this.cbTooltip,
        bgLayers: this.backgroundLayers,
        show3dBuildings: this.show3dBuildings,
      }
    },
    /** what the cells show (or the first half of a diff), for chart and slider titles */
    valueTitle(): string {
      if (!this.dataColumns.length) return this.vizDetails.valueColumn
      return maxTitle(this.columnPicks.data)
    },

    /** with a diff, what gets subtracted; otherwise empty */
    compareTitle(): string {
      if (!this.guiConfig.diff) return ''
      if (!this.dataColumns.length) return this.guiConfig.secondValueColumn
      return maxTitle(this.columnPicks.compare)
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

    cbTooltip(tip: { html: any; style: any }, object: any) {
      if (!object) {
        this.tooltip = null
        return
      }
      tip.style.left = `${16 + object.devicePixel[0]}px`
      tip.style.bottom = `${16 + object.devicePixel[1]}px`
      this.tooltip = tip
    },

    toggle3dBuildings() {
      this.show3dBuildings = !this.show3dBuildings
      // this.guiConfig.show3dBuildings = this.show3dBuildings
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
        this.show3dBuildings = !!(
          (this.vizDetails as any).buildings3d ?? (this.vizDetails as any).show3dBuildings
        )
        this.guiConfig.show3dBuildings = this.show3dBuildings
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
        this.vizDetails.cellSize = 250
      }

      if (!this.vizDetails.maxHeight) {
        this.vizDetails.maxHeight = 0
      }

      if (!this.vizDetails.opacity) {
        this.vizDetails.opacity = 0.7
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

      const grayOut = configuration.thresholdGrayOut
      // emit, not setStatus: the store's setStatus is a stub that drops the message
      if (grayOut !== undefined && grayOut !== 'less' && grayOut !== 'greater') {
        this.$emit(
          'error',
          `thresholdGrayOut must be "less" or "greater", not "${grayOut}". Using "less".`
        )
      }

      // TODO: Add warnings for color attributes
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      this.setRadiusAndHeight()
      this.show3dBuildings = !!(
        (this.vizDetails as any).buildings3d ?? (this.vizDetails as any).show3dBuildings
      )
      this.guiConfig.show3dBuildings = this.show3dBuildings

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

    /**
     * Load the data file once and hand it to the calculation worker, which keeps it.
     * Everything after this (column changes, diffs, recoloring) works from that cache.
     */
    async loadData() {
      this.calc.worker = new GridMapWorker()
      this.calc.task = Comlink.wrap<GridMapTask>(this.calc.worker)

      if (this.vizDetails.file.indexOf('.avro') > -1) {
        await this.loadAvroData()
      } else {
        await this.loadCSVData()
      }
    },

    async loadAvroData() {
      const filename = `${this.subfolder}/${this.vizDetails.file}`
      const blob = await this.fileApi.getFileBlob(filename)
      const avro = await getAvro()

      const records: any[] = await new Promise((resolve, _) => {
        const rows = [] as any[]
        avro
          .createBlobDecoder(blob)
          .on('data', (row: any) => rows.push(row))
          .on('end', () => resolve(rows))
      })

      const record = records[0]

      // Load CRS/projection from Avro file if exists
      if (record.crs) this.vizDetails.projection = record.crs

      // User must provide projection
      if (!this.vizDetails.projection) {
        throw Error('No coordinate projection. Add "projection: EPSG:xxxx" to config')
      }

      if (this.yamlSettings().dataColumns) {
        this.$emit('error', 'dataColumns only works with CSV files; it is ignored for Avro')
      }

      const tableName = Object.keys(record.data)[0]
      await this.calc.task!.setGridData({
        xCoords: record.xCoords,
        yCoords: record.yCoords,
        timestamps: record.timestamps,
        values: record.data[tableName],
        projection: this.vizDetails.projection,
      })
    },

    async loadCSVData() {
      const config = { dataset: this.vizDetails.file }
      const csv = await this.myDataManager.getDataset(config, { subfolder: this.subfolder })

      // projection can be in a comment line
      if (csv.comments && csv.comments.length) {
        csv.comments.forEach((comment: string) => {
          if (comment.includes('EPSG')) {
            const projection = comment.substring(comment.lastIndexOf('EPSG')).trim()
            if (projection) this.vizDetails.projection = projection
          }
        })
      }

      // User must provide projection
      if (!this.vizDetails.projection) {
        throw Error('No coordinate projection. Add "projection: EPSG:xxxx" to config')
      }

      const columns = {} as { [name: string]: any }
      for (const [name, column] of Object.entries(csv.allRows) as [string, any][]) {
        columns[name] = column.values
      }

      // the column arrays are shared with the datamanager cache, so they get copied
      // (not transferred) to the worker. unreactive: Proxies throw DataCloneError.
      const valueColumns = await this.calc.task!.setTableData(
        unreactive({ columns, projection: this.vizDetails.projection })
      )
      this.setupDataColumns(valueColumns)
    },

    /** The YAML as written, without the defaults that vizDetails fills in */
    yamlSettings(): any {
      return this.config || this.standaloneYAMLconfig || {}
    },

    /**
     * dataColumns mode: check the YAML entries against the data, and turn on the buttons
     * that valueColumn / secondValueColumn name. Bad entries are dropped with a warning;
     * if none are left, the column dropdowns are used instead.
     */
    setupDataColumns(available: string[]) {
      const entries = this.yamlSettings().dataColumns
      if (entries === undefined || entries === null) return

      if (!Array.isArray(entries)) {
        this.$emit('error', 'dataColumns must be a list of entries with a "label" and a "column"')
        return
      }

      const valid = [] as DataColumn[]
      entries.forEach((entry: any, i: number) => {
        const label = entry?.label
        const column = entry?.column
        if (label == null || label === '' || column == null || column === '') {
          this.$emit('error', `dataColumns entry ${i + 1} needs both a "label" and a "column"`)
          return
        }
        if (!available.includes(String(column))) {
          this.$emit(
            'error',
            `dataColumns: column "${column}" (${label}) is not in ${this.vizDetails.file}`
          )
          return
        }
        if (valid.some(v => v.label === String(label))) {
          this.$emit('error', `dataColumns: label "${label}" is used more than once`)
          return
        }
        valid.push({ label: String(label), column: String(column) })
      })

      if (!valid.length) {
        this.$emit('error', 'dataColumns has no usable entries; showing column dropdowns instead')
        return
      }

      this.dataColumns = valid
      const yaml = this.yamlSettings()
      const first = this.labelsFor(yaml.valueColumn, 'valueColumn')
      this.columnPicks.data = first.length ? first : [valid[0].label]
      this.columnPicks.compare = this.labelsFor(yaml.secondValueColumn, 'secondValueColumn')
    },

    /**
     * The dataColumns labels that a YAML setting names: one label or a list of them.
     * A column name works too. Anything else is warned about and skipped.
     */
    labelsFor(setting: any, settingName: string): string[] {
      if (setting === undefined || setting === null || setting === '') return []
      const names = (Array.isArray(setting) ? setting : [setting]).map(String)

      const picked = new Set<string>()
      for (const name of names) {
        const match =
          this.dataColumns.find(d => d.label === name) ||
          this.dataColumns.find(d => d.column === name)
        if (match) picked.add(match.label)
        else this.$emit('error', `${settingName}: "${name}" is not one of the dataColumns labels`)
      }
      return this.dataColumns.filter(d => picked.has(d.label)).map(d => d.label)
    },

    /** CSV column names of the dataColumns buttons that are on */
    pickedColumns(labels: string[]): string[] {
      return this.dataColumns.filter(d => labels.includes(d.label)).map(d => d.column)
    },

    /** dataColumns mode: the column choices for the worker */
    dataColumnOptions() {
      if (!this.dataColumns.length) return {}

      const { data, compare } = this.columnPicks
      const shown = this.guiConfig.diff ? [...data, ...compare] : data
      return {
        valueColumns: this.pickedColumns(data),
        secondValueColumns: this.pickedColumns(compare),
        tooltipColumns: this.dataColumns.filter(d => shown.includes(d.label)),
      }
    },

    /**
     * Ask the worker for the cell values of the currently selected column(s).
     * With withColors, colorData comes back filled in, so nothing renders uncolored.
     */
    async prepareData(withColors: boolean) {
      // any summary curve still on its way is of the values this replaces
      this.summaryChart.dataVersion++
      const result = await this.calc.task!.prepare(
        unreactive({
          valueColumn: this.vizDetails.valueColumn || '',
          secondValueColumn: this.vizDetails.secondValueColumn || '',
          diff: !!this.vizDetails.diff,
          opacityColumn:
            this.guiConfig.opacityColumn == 'none' ? '' : this.vizDetails.opacityColumn || '',
          colorOptions: withColors ? this.buildColorOptions() : undefined,
          ...this.dataColumnOptions(),
        })
      )

      const data = result.data
      data.unit = this.vizDetails.unit || ''

      this.availableColumns = result.availableColumns
      // in dataColumns mode the worker picks no single column; valueColumn stays the label
      if (!this.dataColumns.length) {
        this.vizDetails.valueColumn = result.valueColumn
        this.guiConfig.valueColumn = result.valueColumn
        this.guiConfig.secondValueColumn = this.vizDetails.secondValueColumn || ''
      }

      this.valuesIncludeNeg = result.valuesIncludeNeg
      this.globalMinValue = result.globalMinValue
      this.globalMaxValue = result.globalMaxValue
      this.colorDataDigits = result.colorDataDigits

      this.allTimes = result.allTimes
      this.timeRange[0] = result.allTimes[0]
      this.timeRange[1] = result.allTimes[result.allTimes.length - 1]
      this.timeToIndex.clear()
      data.mapData.forEach((m, index) => this.timeToIndex.set(m.time, index))

      this.valueRanges = result.valueRanges
      this.shading.baseColors = data.mapData.map(m => m.colorData)
      // markRaw: data is only ever replaced, never changed in place, so deep reactivity
      // would just be proxy overhead on every threshold slider move
      this.data = markRaw(data)
      this.myState.statusMessage = ''
    },

    /**
     * Point the threshold slider at the time period on display: its title follows the
     * column choice, its range the unscaled values. The user's limit stays exactly where
     * it is -- across times and dataColumns button changes -- even outside the new range:
     * the slider then sits at that end, and its number box shows the real value.
     * It moves to the end that shades nothing with reset, if it was already there, or if
     * the values switch between plain values and a diff (a limit for one means nothing
     * for the other).
     */
    updateThresholdSlider(reset: boolean) {
      const slider = this.shading.controller
      if (!slider) return

      let isDifference: boolean
      if (this.dataColumns.length) {
        isDifference = !!this.compareTitle
        slider.name(isDifference ? `${this.valueTitle} − ${this.compareTitle}` : this.valueTitle)
      } else {
        isDifference = this.guiConfig.diff && !!this.guiConfig.secondValueColumn
        slider.name(isDifference ? 'Diff' : this.vizDetails.valueColumn)
      }
      const kindChanged = isDifference !== this.shading.isDifference
      this.shading.isDifference = isDifference

      const [min, max] = this.valueRanges[this.currentTimeIndex] || [0, 0]
      this.thresholdRange = [min, max]

      const step = (max - min) / 1000 || 1
      const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))))
      slider.min(min).max(max).step(step, false).decimals(decimals)

      if (reset || kindChanged || this.shading.off) {
        this.guiConfig.threshold = this.thresholdColoredEnd()
        this.shading.off = true
      }
      slider.updateDisplay()
    },

    /** The user moved the slider: remember whether they left it at the end that grays nothing */
    handleThresholdChange() {
      this.shading.off = this.isThresholdNear(this.thresholdColoredEnd())
      this.applyThreshold()
    },

    /** Slider end that shades nothing: the min for "less than", the max for "greater than" */
    thresholdColoredEnd() {
      const [min, max] = this.thresholdRange
      return this.guiConfig.thresholdMode == 'less' ? min : max
    },

    /** Slider end that shades everything */
    thresholdGrayEnd() {
      const [min, max] = this.thresholdRange
      return this.guiConfig.thresholdMode == 'less' ? max : min
    },

    /**
     * The slider snaps to steps, which may not land exactly on the min or max; anything
     * within half a step of an end counts as all the way there.
     */
    isThresholdNear(position: number) {
      const [min, max] = this.thresholdRange
      return Math.abs(this.guiConfig.threshold - position) <= (max - min) / 2000
    },

    /**
     * Flipping between "less than" and "greater than": a fully colored map stays fully
     * colored, so the slider jumps to the other end. Any other setting is kept, so the
     * same limit now grays the other side.
     */
    handleThresholdModeChange() {
      const [min, max] = this.thresholdRange
      const previousColoredEnd = this.guiConfig.thresholdMode == 'less' ? max : min
      if (this.isThresholdNear(previousColoredEnd)) {
        this.guiConfig.threshold = this.thresholdColoredEnd()
        this.shading.controller?.updateDisplay()
      }
      this.shading.off = this.isThresholdNear(this.thresholdColoredEnd())
      this.applyThreshold()
    },

    /**
     * Gray out cells at or below ("less than") or at or above ("greater than") the
     * threshold, in the time period on display. The colored end of the slider shades
     * nothing, the far end shades everything. Builds a fresh colorData array from the
     * unshaded colors, so deck.gl sees new colors (and nothing else) and just re-uploads
     * them. Every other time period gets its unshaded colors.
     */
    applyThreshold() {
      if (!this.data) return

      const base = this.shading.baseColors
      const index = this.currentTimeIndex
      let shaded = base[index]

      if (shaded && !this.isThresholdNear(this.thresholdColoredEnd())) {
        const values = this.data.mapData[index].values
        const isLess = this.guiConfig.thresholdMode == 'less'
        // at the far end, gray everything even if the slider snapped just short of it
        let limit = this.guiConfig.threshold * this.data.scaledFactor
        if (this.isThresholdNear(this.thresholdGrayEnd())) {
          limit = isLess ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
        }
        const [r, g, b, a] = THRESHOLD_COLOR
        shaded = shaded.slice()
        for (let i = 0; i < values.length; i++) {
          if (isLess ? values[i] <= limit : values[i] >= limit) {
            const offset = i * 4
            shaded[offset] = r
            shaded[offset + 1] = g
            shaded[offset + 2] = b
            shaded[offset + 3] = a
          }
        }
      }

      const mapData = this.data.mapData.map((m: MapData, i: number) => ({
        ...m,
        colorData: i === index ? shaded : base[i],
      }))
      this.data = markRaw({ ...this.data, mapData })
    },

    /**
     * Cumulative distribution of the values on the map, for the time period on display.
     *
     * Called on every time slider step. Only one request is in flight at a time: calls
     * that arrive meanwhile just mark it to run again, and when the answer is in, it is
     * drawn and the next request is for whatever time is on display by then. So the chart
     * follows a drag as fast as the worker answers, without a backlog of stale periods.
     */
    async updateSummaryChart() {
      const state = this.summaryChart
      if (!this.calc.task) return
      if (state.busy) {
        state.again = true
        return
      }

      state.busy = true
      try {
        do {
          state.again = false
          const version = state.dataVersion
          const result = await this.calc.task.cumulativeShare(
            this.currentTimeIndex,
            this.vizDetails.populationColumn || 'population'
          )
          // a column change re-ran prepare() meanwhile: this curve is of the old values
          if (version === state.dataVersion) this.summary = markRaw(result)
        } while (state.again)
      } finally {
        state.busy = false
      }
    },

    resolveProjection() {
      if (this.vizDetails.projection === 'EPSG:4326') return

      for (let i = 0; i < this.data.length; i++) {
        const wgs84 = Coords.toLngLat(this.vizDetails.projection, this.data[i].centroid)
        this.data[i].centroid = wgs84
      }
    },

    handleDiscreteTimeValues(timeUpdate: { extent: number; index: number }) {
      this.currentTime = [timeUpdate.extent, timeUpdate.extent]
      this.selectedTimeData = []

      for (let i = 0; i < this.data.mapData.length; i++) {
        if (String(this.data.mapData[i].time) == String(timeUpdate.extent)) {
          this.selectedTimeData.push(this.data.mapData[i].values)
        }
      }
      // every time period is already colored; only the shading follows the time
      this.updateThresholdSlider(false)
      this.applyThreshold()
      this.updateSummaryChart()
    },

    handleTimeSliderValues(timeValues: any[]) {
      this.currentTime = timeValues

      this.selectedTimeData = []

      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i].time == timeValues[0]) {
          this.selectedTimeData.push(this.data[i])
        }
      }
      this.updateThresholdSlider(false)
      this.applyThreshold()
      this.updateSummaryChart()
    },

    setupGui() {
      // no fixed width: the gui fills the resizable right panel (see .gui-config css)
      const guiConfig = {
        title: 'Settings',
        injectStyles: true,
        container: document.getElementById(this.configId) || undefined,
      }

      const config = new GUI(guiConfig)
      this.guiController = config

      // the column choices come first: 1st, Diff and 2nd, then opacity column.
      // With dataColumns, rows of toggle buttons stand in for the 1st and 2nd dropdowns.
      const useButtons = this.dataColumns.length > 0

      if (useButtons) {
        this.addColumnButtons(config, this.$t('dataColumns'), 'data')
      } else if (this.availableColumns.length > 0) {
        config
          .add(this.guiConfig, 'valueColumn', this.availableColumns)
          .name('1st column')
          .onChange((newCol: string) => {
            this.handleColumnChange(newCol)
          })
      }

      // the second column choice, only shown with Diff
      let showSecond: (show: boolean) => void
      if (useButtons) {
        const compareRow = this.addColumnButtons(config, this.$t('compareTo'), 'compare')
        showSecond = show => (compareRow.style.display = show ? '' : 'none')
      } else {
        const secondCtrl = config
          .add(this.guiConfig, 'secondValueColumn', ['', ...this.availableColumns])
          .name('2nd column')
          .onChange((col2: string) => this.handleSecondColumnChange(col2))
        showSecond = show => (show ? secondCtrl.show() : secondCtrl.hide())
      }
      showSecond(this.guiConfig.diff)

      // Diff checkbox
      config
        .add(this.guiConfig, 'diff')
        .name('Diff')
        .onChange((useDiff: boolean) => {
          // the second column choice is only shown with Diff
          showSecond(useDiff)
          this.handleDiffChange(useDiff)
        })

      let availableOpacityColumns = ['none'].concat(this.availableColumns)
      if (availableOpacityColumns.length > 0) {
        config
          .add(this.guiConfig, 'opacityColumn', availableOpacityColumns)
          .name('Opacity column')
          .onChange((newCol: string) => {
            this.handleOpacityColumnChange(newCol)
          })
      }

      // threshold: which side to gray out, and the limit. Slider min/max are set by
      // updateThresholdSlider(). The YAML can force the gray-out direction at startup.
      const grayOut = this.vizDetails.thresholdGrayOut
      if (grayOut == 'less' || grayOut == 'greater') this.guiConfig.thresholdMode = grayOut

      const threshold = config.addFolder(this.$t('threshold'))
      this.shading.controller = threshold
        .add(this.guiConfig, 'threshold', 0, 1)
        .onChange(() => this.handleThresholdChange())
      threshold
        .add(this.guiConfig, 'thresholdMode', {
          [this.$t('lessThan')]: 'less',
          [this.$t('greaterThan')]: 'greater',
        })
        .name(this.$t('grayOut'))
        .onChange(() => this.handleThresholdModeChange())
      this.updateThresholdSlider(true)

      const view = config.addFolder('View')
      view.add(this.guiConfig, 'radius', this.minRadius, this.maxRadius, this.radiusStep)
      view.add(this.guiConfig, 'opacity', 0, 1, 0.1)
      view.add(this.guiConfig, 'height', 0, 250, 5)
      // config
      //   .add(this.guiConfig, 'show3dBuildings')
      //   .name('3D buildings')
      //   .onChange((value: boolean) => (this.show3dBuildings = value))

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
      }
    },

    /**
     * A row of toggle buttons, one per dataColumns entry, added to the gui like any other
     * controller. Clicking one turns that column on or off for its set and recalculates.
     */
    addColumnButtons(gui: GUI, title: string, set: 'data' | 'compare'): HTMLElement {
      const row = document.createElement('div')
      row.classList.add('controller', 'column-buttons')

      const name = document.createElement('div')
      name.classList.add('name')
      name.textContent = title
      row.appendChild(name)

      const widget = document.createElement('div')
      widget.classList.add('widget')
      row.appendChild(widget)

      for (const { label, column } of this.dataColumns) {
        const button = document.createElement('button')
        button.textContent = label
        button.title = column
        const showState = () => {
          const on = this.columnPicks[set].includes(label)
          button.classList.toggle('on', on)
          button.setAttribute('aria-pressed', String(on))
        }
        showState()

        button.addEventListener('click', () => {
          const picks = new Set(this.columnPicks[set])
          if (picks.has(label)) picks.delete(label)
          else picks.add(label)
          // keep dataColumns order, whatever the click order
          this.columnPicks[set] = this.dataColumns.map(d => d.label).filter(l => picks.has(l))
          showState()
          // same units, whatever the combination: the threshold stays where it is
          this.reloadDataAndPreserveSelectedTime(false)
        })
        widget.appendChild(button)
      }

      gui.$children.appendChild(row)
      return row
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
    getCurrentSelectedTime(): number | null {
      const selected = Number(this.currentTime?.[0])
      return Number.isFinite(selected) ? selected : null
    },

    resolveSelectedTime(previousTime: number | null): number {
      if (!this.allTimes.length) return 0

      if (previousTime !== null && this.timeToIndex.has(previousTime as Number)) {
        return previousTime
      }

      if (previousTime === null) return this.allTimes[0]

      let closest = this.allTimes[0]
      let minDistance = Math.abs(closest - previousTime)
      for (let i = 1; i < this.allTimes.length; i++) {
        const distance = Math.abs(this.allTimes[i] - previousTime)
        if (distance < minDistance) {
          minDistance = distance
          closest = this.allTimes[i]
        }
      }
      return closest
    },

    /**
     * Recalculate from the worker's cached data -- nothing is fetched again.
     * resetThreshold: the values may be something else entirely (another column), so
     * the threshold starts over.
     */
    async reloadDataAndPreserveSelectedTime(resetThreshold: boolean) {
      const selectedTimeBeforeReload = this.getCurrentSelectedTime()
      try {
        await this.prepareData(true)
      } catch (e) {
        this.$emit('error', e instanceof Error ? e.message : '' + e)
        return
      }
      const selectedTimeAfterReload = this.resolveSelectedTime(selectedTimeBeforeReload)
      this.currentTime = [selectedTimeAfterReload, selectedTimeAfterReload]
      this.updateThresholdSlider(resetThreshold)
      this.applyThreshold()
      this.updateSummaryChart()
    },

    async handleOpacityColumnChange(newCol: string) {
      this.vizDetails.opacityColumn = newCol
      // the values don't change, so neither does the threshold
      await this.reloadDataAndPreserveSelectedTime(false)
    },

    async handleColumnChange(newCol: string) {
      this.vizDetails.valueColumn = newCol
      await this.reloadDataAndPreserveSelectedTime(true)
    },

    /**
     * This method is called when the diff checkbox is toggled.
     */
    async handleDiffChange(useDiff: boolean) {
      this.vizDetails.diff = useDiff

      // reload data while keeping the currently selected time slot. The threshold starts
      // over only if this actually switches between plain values and a diff
      await this.reloadDataAndPreserveSelectedTime(false)
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

      // reload data while keeping the currently selected time slot
      await this.reloadDataAndPreserveSelectedTime(true)
    },

    /** Color settings from the GUI, in the plain form the worker needs */
    buildColorOptions(): ColorOptions {
      const rawRamp = this.guiConfig['color ramp'] as string
      // remove the suffix " (div)" if it exists
      const baseRamp = rawRamp.replace(/\s*\(div\)$/, '')
      // give only the shortened name to the getColorRampHexCodes function
      const ramp = { ramp: baseRamp } as Ramp
      const colors = this.hexArrayToRgbArray(getColorRampHexCodes(ramp, this.guiConfig.steps))
      if (this.guiConfig.flip) colors.reverse()

      // fixed colors are only used if there is exactly one more color than breakpoints
      const { breakpoints, fixedColors } = this.vizDetails.colorRamp || {}
      const isFixed = breakpoints && fixedColors && breakpoints.length == fixedColors.length - 1

      return {
        colors,
        boundsEnabled: this.guiConfig['bounds enabled'],
        upperBound: this.guiConfig['upper bound'],
        lowerBound: this.guiConfig['lower bound'],
        breakpoints: isFixed ? [...breakpoints] : undefined,
        fixedColors: isFixed ? fixedColors.map((c: string) => hexToRgb(c)) : undefined,
      }
    },

    async setColors() {
      if (!this.data || !this.calc.task) return

      const request = ++this.calc.colorRequest
      const colorData = await this.calc.task.colorize(this.buildColorOptions())

      // a newer recolor was requested while this one was running
      if (request !== this.calc.colorRequest || !this.data) return

      this.shading.baseColors = colorData
      this.applyThreshold()
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
          this.guiConfig['color ramp'] =
            this.config.colorRamp.ramp === 'RdBu' ? 'RdBu (div)' : this.config.colorRamp.ramp

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

    this.myState.statusMessage = `${this.$t('loading')}`
    await sleep(0)

    try {
      await this.loadData()
      // colors come later, once the color bounds are known
      await this.prepareData(false)
    } catch (e) {
      this.myState.statusMessage = ''
      this.$emit('error', e instanceof Error ? e.message : '' + e)
      return
    }

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

    await this.setColors()
    this.updateSummaryChart()
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

  beforeUnmount() {
    //@ts-ignore
    delete window.__testdata__

    this.data = null
    this.guiController?.destroy()

    this.calc.worker?.terminate()
    this.calc.worker = null
    this.calc.task = null

    this.$store.commit('setFullScreen', false)
  },
})

/** "Car", or "max(Car, PT)" for several labels; empty if none */
function maxTitle(labels: string[]) {
  return labels.length > 1 ? `max(${labels.join(', ')})` : labels[0] || ''
}

export default GridMap
</script>

<style scoped lang="scss">
// @use, not @import: styles.scss no longer forwards Sass variables, and
// $thumbnailHeight / $filterShadow below would fail the build.
@use '@/variables' as *;

.grid-map-view {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  z-index: -1;
}

.grid-map-view.hide-thumbnail {
  background: none;
  z-index: 0;
}

.message {
  z-index: 5;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  box-shadow: 0px 2px 10px #22222222;
  display: flex;
  flex-direction: row;
  pointer-events: none;
  margin: auto auto 0 0;
  // padding: 0.5rem 1.5rem;

  a {
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }
}

.ui-slider {
  padding: 0 0;
  margin: 0.2rem 0 0.6rem 0;
  min-width: 7rem;
}

.status-message {
  background-color: var(--bgPanel);
  width: 100%;
  margin: auto 0;
  text-align: center;
  padding: 2rem;
  // border-radius: 8px;
  font-size: 1.5rem;
  line-height: 1.5rem;
  font-weight: bold;
  color: var(--link);
}

.big {
  padding: 0.5rem 0;
  font-size: 1.2rem;
  line-height: 1.5rem;
  font-weight: bold;
}

.main-layout {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr auto auto;
  grid-template-rows: 1fr;
  min-height: 0;
}

.main-panel {
  position: relative;
  background-color: var(--bgBold);
  overflow: hidden;
}

.dragger {
  grid-row: 1 / 2;
  grid-column: 2 / 3;
  width: 0.4rem;
  background-color: var(--bgBold);
  user-select: none;
}

.dragger:hover,
.dragger:active {
  background-color: var(--sliderThumb);
  transition: background-color 0.3s ease;
  transition-delay: 0.1s;
  cursor: ew-resize;
}

.right-panel {
  color: var(--text);
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  background-color: var(--bgBold);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0 0.25rem;
}

.gui-config :deep(.lil-gui.root) {
  width: 100%;
}

// dataColumns toggle buttons: title on its own line, buttons wrapping below it
.gui-config :deep(.controller.column-buttons) {
  flex-direction: column;
  align-items: stretch;

  .widget {
    flex-wrap: wrap;
    gap: 3px;
  }

  button {
    width: auto;
    flex: 1 0 auto;
    padding: 0 0.5rem;
    opacity: 0.7;
  }

  button.on {
    opacity: 1;
    background: var(--link);
    border-color: var(--link);
    color: var(--bgBold);
    font-weight: bold;
  }
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
