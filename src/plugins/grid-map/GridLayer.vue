<template lang="pug">
    .xy-hexagons(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${id}`")
    
      xy-hex-deck-map.hex-layer(
        v-if="!thumbnail && isLoaded"
        v-bind="mapProps"
      )
    
      zoom-buttons(v-if="!thumbnail")
      //- drawing-tool.drawing-tool(v-if="!thumbnail")
    
      .left-side(v-if="isLoaded && !thumbnail && vizDetails.title")
        collapsible-panel(direction="left" :locked="true")
          .panel-items(v-if="hexStats" style="color: #c0f;")
            p.big(style="margin-top: 2rem;") {{ $t('selection') }}:
            h3(style="margin-top: -1rem;") {{ $t('areas') }}: {{ hexStats.numHexagons }}, {{ $t('count') }}: {{ hexStats.rows }}
            button.button(style="color: #c0f; border-color: #c0f" @click="handleShowSelectionButton") {{ $t('showDetails') }}
    
      .control-panel(v-if="isLoaded && !thumbnail && !myState.statusMessage")
            //- :class="{'is-dashboard': config !== undefined }"

            //- viz-configurator(v-if="isLoaded"
            //-   :embedded="true"
            //-   :fileSystem="fileSystem"
            //-   :subfolder="subfolder"
            //-   :vizDetails="vizDetails"
            //-   :datasets="data"
            //-   :legendStore="legendStore"
            //- )

            .panel-item
              p.ui-label {{ $t('maxHeight') }}: {{ vizDetails.maxHeight }}
              b-slider.ui-slider(v-model="vizDetails.maxHeight"
                size="is-small"
                :min="0" :max="250" :step="5"
                :duration="0" :dotSize="12"
                :tooltip="false"
              )
    
              p.ui-label Hex Radius: {{ vizDetails.cellSize }}
              b-slider.ui-slider(v-model="vizDetails.cellSize"
                size="is-small"
                :min="50" :max="2000" :step="5"
                :duration="0" :dotSize="12"
                :tooltip="false"
              )

              p.ui-label Opacity: {{ vizDetails.opacity }}
              b-slider.ui-slider(v-model="vizDetails.opacity"
                size="is-small"
                :min="0" :max="1" :step="0.1"
                :duration="0" :dotSize="12"
                :tooltip="false"
              )
            .panel-item
              h4 Aktueller Wert
              p(v-if="hoverValue") {{ parseFloat((hoverValue).toFixed(4)) }}
              p(v-else) - 
              h4 Letzter Wert 
              p(v-if="clickedValue") {{ parseFloat((clickedValue).toFixed(4)) }}
              p(v-else) -
    
      time-slider.time-slider-area(v-if="isLoaded"
        :range="timeRange"
        :activeTimeExtent="timeFilter"
        :labels="timeLabels"
        :isAnimating="true"
        @timeExtent="handleTimeSliderValues"
        @toggleAnimation="toggleAnimation"
        @drag="isAnimating=false"
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
import TimeSlider from '@/components/TimeSlider.vue'

import { ColorScheme, FileSystemConfig, Status } from '@/Globals'

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
}

const MyComponent = defineComponent({
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
      } as VizDetail,
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },
      data: null as any,
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
      startTime: 0,
      isAnimating: false,
      animationElapsedTime: 0,
      timeFilter: [0, 3599],
      timeRange: [Infinity, -Infinity],
      timeLabels: [0, 1] as any[],
      ANIMATE_SPEED: 4,
      animator: null as any,
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
        data: this.data,
        extrude: this.extrudeTowers,
        highlights: this.highlightedTrips,
        mapIsIndependent: this.vizDetails.mapIsIndependent,
        maxHeight: this.vizDetails.maxHeight,
        metric: this.buttonLabel,
        cellSize: this.vizDetails.cellSize,
        opacity: this.vizDetails.opacity,
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
      console.log(this.vizDetails.maxHeight)
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
    handleShowSelectionButton() {
      // const arrays = Object.values(this.multiSelectedHexagons)
      // let points: any[] = []
      // arrays.map(a => (points = points.concat(a)))
      // const pickedObject = { object: { points } }
      // this.flipViewToShowInvertedData(pickedObject)
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

    async setMapCenter() {
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
          jump: false, // move the map no matter what
        }

        // bounce our map
        if (REACT_VIEW_HANDLES[this.id]) REACT_VIEW_HANDLES[this.id](view)

        // Sets the map to the specified data
        this.$store.commit('setMapCamera', Object.assign({}, view))

        return
      }
    },

    async loadFile() {
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

      const returnArray = []

      let minValue = Number.POSITIVE_INFINITY
      let maxValue = Number.NEGATIVE_INFINITY

      for (let i = 0; i < csv.data.length; i++) {
        if (i == 0) this.timeRange[0] = csv.data[i].time
        if (i == csv.data.length - 1) this.timeRange[1] = csv.data[i].time

        if (csv.data[i].value < minValue) minValue = csv.data[i].value
        if (csv.data[i].value > maxValue) maxValue = csv.data[i].value

        returnArray.push({
          centroid: [csv.data[i].x, csv.data[i].y],
          value: csv.data[i].value,
          scaledValue: 0,
        })
      }
      // console.log('Before')
      // console.log({ minValue, maxValue })

      const scaleFactor = 100 / maxValue

      // Time to scale! :D
      for (let i = 0; i < returnArray.length; i++) {
        returnArray[i].scaledValue = scaleFactor * returnArray[i].value
        // console.log(returnArray[i].value)
      }

      // minValue = Number.POSITIVE_INFINITY
      // maxValue = Number.NEGATIVE_INFINITY

      // for (let i = 0; i < returnArray.length; i++) {
      //   if (returnArray[i].scaledValue < minValue) minValue = returnArray[i].scaledValue
      //   if (returnArray[i].scaledValue > maxValue) maxValue = returnArray[i].scaledValue
      //   // console.log(returnArray[i].value)
      // }

      // console.log('After')
      // console.log({ minValue, maxValue, scaleFactor })

      // this.dataIsLoaded({ a: null, b: null })
      this.myState.statusMessage = ''
      return returnArray
    },

    // TODO: setMapCenter() and moveLogo()

    resolveProjection() {
      if (this.vizDetails.projection === 'EPSG:4326') return
      console.log('Projection: ', this.vizDetails.projection)
      console.log('Data: ', this.data)
      for (let i = 0; i < this.data.length; i++) {
        const wgs84 = Coords.toLngLat(this.vizDetails.projection, this.data[i].centroid)
        this.data[i].centroid = wgs84
      }
    },

    dataIsLoaded({ rowCache, columnLookup }: any) {
      console.log(rowCache, columnLookup)
      //   this.columnLookup = columnLookup
      //   this.rowCache = rowCache

      //   const agg = this.activeAggregation.replaceAll('~', '')
      //   this.requests = this.rowCache[agg]

      this.setMapCenter()
      this.moveLogo()
      this.myState.statusMessage = ''
    },

    // TODO...
    toggleAnimation() {
      this.isAnimating = !this.isAnimating
      if (this.isAnimating) {
        this.animationElapsedTime = this.timeFilter[0] - this.timeRange[0]
        this.startTime = Date.now() - this.animationElapsedTime / this.ANIMATE_SPEED
        this.animate()
      }
    },

    animate() {
      if (!this.isAnimating) return

      this.animationElapsedTime = this.ANIMATE_SPEED * (Date.now() - this.startTime)
      const animationClockTime = this.animationElapsedTime + this.timeRange[0]

      if (animationClockTime > this.timeRange[1]) {
        this.startTime = Date.now()
        this.animationElapsedTime = 0 // this.timeRange[0]
      }

      const span = this.timeFilter[1] - this.timeFilter[0]
      this.timeFilter = [animationClockTime, animationClockTime + span]

      this.animator = window.requestAnimationFrame(this.animate)
    },

    handleTimeSliderValues(timeValues: any[]) {
      this.animationElapsedTime = timeValues[0]
      this.timeFilter = timeValues
      this.timeLabels = [
        this.convertSecondsToClockTimeMinutes(timeValues[0]),
        this.convertSecondsToClockTimeMinutes(timeValues[1]),
      ]
    },

    convertSecondsToClockTimeMinutes(index: number) {
      const h = Math.floor(index / 3600)
      const m = Math.floor((index - h * 3600) / 60)
      const s = index - h * 3600 - m * 60

      const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

      return `${hms.h}:${hms.m}`
    },
  },
  async processData() {
    console.log(this.data)
  },
  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()

    if (this.thumbnail) return

    this.setupLogoMover()

    this.myState.statusMessage = `${this.$i18n.t('loading')}`
    // this.aggregations = this.vizDetails.aggregations

    // console.log('loading files')
    // await this.loadFiles()
    this.data = await this.loadFile()

    this.resolveProjection()
    // this.processData()
    // this.mapState.center = this.findCenter(this.rawRequests)

    this.buildThumbnail()

    this.isLoaded = true
    // this.handleOrigDest(Object.keys(this.aggregations)[0], 0) // show first data

    console.log(this.data)
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

    if (this.animator) window.cancelAnimationFrame(this.animator)

    this.$store.commit('setFullScreen', false)
  },
})

export default MyComponent
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
  margin: 0 1rem 0 20rem;
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
