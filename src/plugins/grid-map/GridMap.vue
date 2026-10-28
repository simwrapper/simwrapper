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

      .message(v-if="myState.statusMessage")
        p.status-message {{ myState.statusMessage }}

      .tooltip(v-if="tooltip" v-html="tooltip.html" :style="tooltip.style")

    .dragger(v-if="!thumbnail"
      @mousedown="dividerDragStart"
      @mouseup="dividerDragEnd"
      @mousemove.stop="dividerDragging"
    )

    .right-panel(v-if="!thumbnail" :style="{width: `${legendSectionWidth}px`}")
      .gui-config(:id="configId")

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
import BackgroundLayers from '@/js/BackgroundLayers'
import GridMapWorker from './GridMap.worker.ts?worker'
import type { ColorOptions, GridMapTask } from './GridMap.worker'

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
      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 250,
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
        currentTimeIndex: this.timeToIndex.get(this.currentTime[1]) || 0,
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
      await this.calc.task!.setTableData(
        unreactive({ columns, projection: this.vizDetails.projection })
      )
    },

    /**
     * Ask the worker for the cell values of the currently selected column(s).
     * With withColors, colorData comes back filled in, so nothing renders uncolored.
     */
    async prepareData(withColors: boolean) {
      const result = await this.calc.task!.prepare(
        unreactive({
          valueColumn: this.vizDetails.valueColumn || '',
          secondValueColumn: this.vizDetails.secondValueColumn || '',
          diff: !!this.vizDetails.diff,
          opacityColumn:
            this.guiConfig.opacityColumn == 'none' ? '' : this.vizDetails.opacityColumn || '',
          colorOptions: withColors ? this.buildColorOptions() : undefined,
        })
      )

      const data = result.data
      data.unit = this.vizDetails.unit || ''

      this.availableColumns = result.availableColumns
      this.vizDetails.valueColumn = result.valueColumn
      this.guiConfig.valueColumn = result.valueColumn
      this.guiConfig.secondValueColumn = this.vizDetails.secondValueColumn || ''

      this.valuesIncludeNeg = result.valuesIncludeNeg
      this.globalMinValue = result.globalMinValue
      this.globalMaxValue = result.globalMaxValue
      this.colorDataDigits = result.colorDataDigits

      this.allTimes = result.allTimes
      this.timeRange[0] = result.allTimes[0]
      this.timeRange[1] = result.allTimes[result.allTimes.length - 1]
      this.timeToIndex.clear()
      data.mapData.forEach((m, index) => this.timeToIndex.set(m.time, index))

      this.data = data
      this.myState.statusMessage = ''
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
      // no fixed width: the gui fills the resizable right panel (see .gui-config css)
      const guiConfig = {
        title: 'Settings',
        injectStyles: true,
        container: document.getElementById(this.configId) || undefined,
      }

      this.guiController = new GUI(guiConfig)

      const config = this.guiController // .addFolder('Colors')
      config.add(this.guiConfig, 'radius', this.minRadius, this.maxRadius, this.radiusStep)
      config.add(this.guiConfig, 'opacity', 0, 1, 0.1)
      config.add(this.guiConfig, 'height', 0, 250, 5)
      // config
      //   .add(this.guiConfig, 'show3dBuildings')
      //   .name('3D buildings')
      //   .onChange((value: boolean) => (this.show3dBuildings = value))

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

    /** Recalculate from the worker's cached data -- nothing is fetched again */
    async reloadDataAndPreserveSelectedTime() {
      const selectedTimeBeforeReload = this.getCurrentSelectedTime()
      try {
        await this.prepareData(true)
      } catch (e) {
        this.$emit('error', e instanceof Error ? e.message : '' + e)
        return
      }
      const selectedTimeAfterReload = this.resolveSelectedTime(selectedTimeBeforeReload)
      this.currentTime = [selectedTimeAfterReload, selectedTimeAfterReload]
    },

    async handleOpacityColumnChange(newCol: string) {
      this.vizDetails.opacityColumn = newCol
      await this.reloadDataAndPreserveSelectedTime()
    },

    async handleColumnChange(newCol: string) {
      this.vizDetails.valueColumn = newCol
      await this.reloadDataAndPreserveSelectedTime()
    },

    /**
     * This method is called when the diff checkbox is toggled.
     */
    async handleDiffChange(useDiff: boolean) {
      this.vizDetails.diff = useDiff

      // reload data while keeping the currently selected time slot
      await this.reloadDataAndPreserveSelectedTime()
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
      await this.reloadDataAndPreserveSelectedTime()
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

      // new objects so Vue (and deck.gl) notice the change
      const mapData = this.data.mapData.map((m: MapData, i: number) => ({
        ...m,
        colorData: colorData[i],
      }))
      this.data = { ...this.data, mapData }
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
  padding: 0.5rem 1.5rem;

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
  margin: auto 1rem;
  text-align: center;
  padding: 2rem;
  border-radius: 8px;
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
  background-color: var(--bgPanel3);
  overflow-x: hidden;
  overflow-y: auto;
}

.gui-config :deep(.lil-gui.root) {
  width: 100%;
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
