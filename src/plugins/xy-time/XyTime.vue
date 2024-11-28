<template lang="pug">
.viz-plugin(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${viewId}`")

  xy-time-deck-map.map-layer(v-if="!thumbnail"
    :viewId="viewId"
    :pointLayers="pointLayers"
    :timeFilter="timeFilter"
    :dark="this.$store.state.isDarkMode"
    :colors="this.colors"
    :breakpoints="this.breakpoints"
    :radius="this.guiConfig.radius"
    :mapIsIndependent="false"
  )

  zoom-buttons(v-if="!thumbnail" corner="bottom")

  .top-right
    .gui-config(:id="configId")

  .bottom-right
    .legend-area(v-if="legendStore")
      legend-box(:legendStore="legendStore")

  time-slider.time-slider-area(v-if="isLoaded"
    :range="timeRange"
    :activeTimeExtent="timeFilter"
    :labels="timeLabels"
    :isAnimating="isAnimating"
    @timeExtent="handleTimeSliderValues"
    @toggleAnimation="toggleAnimation"
    @drag="isAnimating=false"
  )

  .message(v-if="!thumbnail && myState.statusMessage")
    p.status-message {{ myState.statusMessage }}

  modal-dialog-custom-colorbreakpoint(v-if="this.showCustomBreakpoints"
    :breakpointsProp="this.breakpoints"
    :colorsProp="this.colors"
    @close="showCustomBreakpoints = false"
    @updateColor="(colorArray) => this.setLegend(colorArray, this.breakpoints)"
    @updateBreakpoint="(breakpointArray) => this.setLegend(this.colors, breakpointArray)"
    @addOrRemoveBreakpoint="(colorArray, breakpointArray) => this.setLegend(colorArray, breakpointArray)"
  )

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
      promptCRS: `Enter the coordinate reference system, e.g. EPSG:25832\n\nThese coordinates are not in long/lat format. To fix this permanently, convert them to long/lat or add "# EPSG:xxxx" to your CSV header`,
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

import { defineComponent } from 'vue'

import GUI from 'lil-gui'
import YAML from 'yaml'
import colormap from 'colormap'

import util from '@/js/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendBox from '@/components/viz-configurator/LegendBox.vue'
import LegendStore from '@/js/LegendStore'
import TimeSlider from '@/components/TimeSlider.vue'
import XyTimeDeckMap from './XyTimeDeckMap'
import XytDataParser from './XytDataParser.worker.ts?worker'
import ZoomButtons from '@/components/ZoomButtons.vue'
import ModalDialogCustomColorbreakpoint from './ModalDialogCustomColorbreakpoint.vue'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  Status,
  REACT_VIEW_HANDLES,
} from '@/Globals'

interface VizDetail {
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  center: any
  zoom: number
  buckets: number
  clipMax: number
  exponent: number
  radius: number
  colorRamp: string
  breakpoints: string
}

interface PointLayer {
  color: Uint8Array
  value: Float32Array
  coordinates: Float32Array
  time: Float32Array
  timeRange: number[]
}

const MyComponent = defineComponent({
  name: 'XYTime',
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    LegendBox,
    TimeSlider,
    ZoomButtons,
    XyTimeDeckMap,
    ModalDialogCustomColorbreakpoint,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
  },
  data() {
    return {
      guiConfig: {
        buckets: 7,
        exponent: 4,
        radius: 5,
        'clip max': 100,
        'color ramp': 'viridis',
        colorRamps: ['bathymetry', 'electric', 'inferno', 'jet', 'magma', 'par', 'viridis'],
        flip: false,
        // @ts-ignore ->
        'Custom breakpoints...': this.toggleModalDialog,
        'manual breaks': '',
      },
      minRadius: 5,
      maxRadius: 50,
      showCustomBreakpoints: false,
      viewId: `xyt-id-${Math.floor(1e12 * Math.random())}` as any,
      configId: `gui-config-${Math.floor(1e12 * Math.random())}` as any,
      timeLabels: [0, 1] as any[],
      startTime: 0,
      isAnimating: false,
      timeFilter: [0, 3599],
      colors: [
        [128, 128, 128],
        [128, 128, 128],
      ] as any[][],
      breakpoints: [0.0],
      range: [Infinity, -Infinity],
      timeRange: [Infinity, -Infinity],
      legendStore: null as LegendStore | null,
      standaloneYAMLconfig: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        radius: 250,
        maxHeight: 0,
        center: null as any,
        zoom: 9,
      },
      YAMLrequirementsXY: { file: '' },
      columnLookup: [] as number[],
      gzipWorker: null as Worker | null,
      vizDetails: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        center: null as any,
        zoom: 9,
        // x-y-t details:
        buckets: 5,
        exponent: 4,
        clipMax: 100,
        radius: 5,
        colorRamp: 'viridis',
        flip: false,
        breakpoints: null as any,
      } as VizDetail,
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },
      pointLayers: [] as PointLayer[],
      isLoaded: false,
      animator: null as any,
      guiController: null as GUI | null,
      resizer: null as ResizeObserver | null,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      ANIMATE_SPEED: 4,
      animationElapsedTime: 0,
    }
  },
  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()
    await this.buildThumbnail()

    if (this.thumbnail) return

    this.setupLogoMover()

    // ----------------------------------------------------
    this.setupGui()
    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    if (!this.isLoaded) await this.loadFiles()
  },
  beforeDestroy() {
    this.resizer?.disconnect()

    // MUST erase the React view handle to prevent gigantic memory leak!
    REACT_VIEW_HANDLES[this.viewId] = undefined
    delete REACT_VIEW_HANDLES[this.viewId]

    try {
      if (this.gzipWorker) {
        this.gzipWorker.postMessage({ terminate: true })
        this.gzipWorker.terminate()
      }
      if (this.guiController) this.guiController.destroy()
    } catch (e) {
      console.warn(e)
    }

    if (this.animator) window.cancelAnimationFrame(this.animator)

    this.$store.commit('setFullScreen', false)
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
  },
  watch: {
    '$store.state.viewState'() {
      if (REACT_VIEW_HANDLES[this.viewId]) REACT_VIEW_HANDLES[this.viewId]()
    },
  },
  methods: {
    toggleModalDialog() {
      this.showCustomBreakpoints = !this.showCustomBreakpoints
    },
    handleTimeSliderValues(timeValues: any[]) {
      this.animationElapsedTime = timeValues[0]
      this.timeFilter = timeValues
      this.timeLabels = [
        this.convertSecondsToClockTimeMinutes(timeValues[0]),
        this.convertSecondsToClockTimeMinutes(timeValues[1]),
      ]
    },

    setupLogoMover() {
      this.resizer = new ResizeObserver(this.moveLogo)
      const deckmap = document.getElementById(`id-${this.viewId}`) as HTMLElement
      this.resizer.observe(deckmap)
    },

    moveLogo() {
      const deckmap = document.getElementById(`${this.viewId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
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
      config.add(this.guiConfig, 'radius', this.minRadius, this.maxRadius, 1)

      const colors = config.addFolder('colors')
      colors.add(this.guiConfig, 'color ramp', this.guiConfig.colorRamps).onChange(this.setColors)
      colors.add(this.guiConfig, 'flip').onChange(this.setColors)

      const breakpoints = config.addFolder('breakpoints')
      breakpoints.add(this.guiConfig, 'buckets', 2, 19, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'clip max', 0, 100, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'exponent', 1, 10, 1).onChange(this.setColors)
      breakpoints.add(this.guiConfig, 'Custom breakpoints...', 1, 100, 1)
    },
    async solveProjection() {
      if (this.thumbnail) return

      console.log('WHAT PROJECTION:')

      try {
        const text = await this.fileApi.getFileText(
          this.myState.subfolder + '/' + this.myState.yamlConfig
        )
        this.vizDetails = YAML.parse(text)
      } catch (e) {
        console.error(e)
        this.$emit('error', '' + e)
      }
    },

    async getVizDetails() {
      if (this.config) {
        this.validateYAML()
        this.vizDetails = Object.assign({}, this.config) as VizDetail
        this.setCustomGuiConfig()
        return
      }

      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      if (hasYaml) {
        await this.loadStandaloneYAMLConfig()
      } else {
        // console.log('NO YAML WTF')
        this.setConfigForRawCSV()
      }
    },

    setCustomGuiConfig() {
      if (!this.config) return

      // Set custom radius
      if (this.config.radius >= this.minRadius && this.config.radius <= this.maxRadius)
        this.guiConfig.radius = this.config.radius

      if (Object.prototype.toString.call(this.config.breakpoints) === '[object Array]') {
        // Only breakpoints
        this.setManualBreakpoints(this.config.breakpoints)
      } else {
        // Set custom breakpoints
        if (this.config.breakpoints) {
          if (this.config.breakpoints.values.length + 1 != this.config.breakpoints.colors.length) {
            this.$emit('error', {
              type: Status.ERROR,
              msg: `Wrong number of colors and values for the breakpoints.`,
              desc: `Number of colors: ${this.config.breakpoints.colors.length}, Number of values: ${this.config.breakpoints.values.length}, Must apply: Number of colors = number of values plus one.`,
            })
          } else {
            this.guiConfig.buckets = this.config.breakpoints.colors.length
            this.breakpoints = this.config.breakpoints.values
            this.colors = this.config.breakpoints.colors
          }
        }
      }
    },

    setManualBreakpoints(breakpoints: number[]) {
      this.breakpoints = breakpoints
      this.guiConfig.buckets = 1 + breakpoints.length
    },

    setConfigForRawCSV() {
      let projection = 'EPSG:4326' // Include "# EPSG:xxx" in header of CSV to set EPSG

      // output_trips:
      this.vizDetails = Object.assign(this.vizDetails, {
        title: 'Point Data: ' + this.myState.yamlConfig,
        description: this.myState.yamlConfig,
        file: this.myState.yamlConfig,
        projection,
        center: this.vizDetails.center,
        zoom: this.vizDetails.zoom,
      })

      this.$emit('title', this.vizDetails.title || this.vizDetails.file)
      return
    },

    async loadStandaloneYAMLConfig() {
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
        console.log('failed' + e)
        this.$emit('error', `File not found: ${this.myState.subfolder}/${this.myState.yamlConfig}`)
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

      for (const key in this.YAMLrequirementsXY) {
        if (key in configuration === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `XYTime missing required key: ${key}`,
            desc: `XYTime requires keys: ${Object.keys(this.YAMLrequirementsXY)}`,
          })
        }
      }

      if (configuration.radius == 0) {
        this.$emit('error', {
          type: Status.WARNING,
          msg: `Radius set to zero`,
          desc: 'Radius can not be zero, preset value used instead. ',
        })
      }

      if (configuration.zoom < 5 || configuration.zoom > 50) {
        this.$emit('error', {
          type: Status.WARNING,
          msg: `Zoom is out of the recommended range `,
          desc: 'Zoom levels should be between 5 and 50. ',
        })
      }
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      const t = this.vizDetails.title
        ? this.vizDetails.title
        : 'Point Data: ' + this.vizDetails.file
      this.$emit('title', t)

      if (this.vizDetails.buckets) this.guiConfig.buckets = this.vizDetails.buckets
      if (this.vizDetails.exponent) this.guiConfig.exponent = this.vizDetails.exponent
      if (this.vizDetails.radius) this.guiConfig.radius = this.vizDetails.radius
      if (this.vizDetails.clipMax) this.guiConfig['clip max'] = this.vizDetails.clipMax
      if (this.vizDetails.colorRamp) this.guiConfig['color ramp'] = this.vizDetails.colorRamp
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

    async parseCSVFile(filename: string) {
      this.myState.statusMessage = 'Loading file...'

      let totalRows = 0
      // get the raw unzipped arraybuffer
      this.gzipWorker = new XytDataParser()

      this.gzipWorker.onmessage = async (event: MessageEvent) => {
        if (event.data.status) {
          this.myState.statusMessage = event.data.status
        } else if (event.data.error) {
          this.myState.statusMessage = event.data.error
          this.$emit('error', {
            type: Status.ERROR,
            msg: `XYT Loading Error`,
            desc: `Error loading: ${this.myState.subfolder}/${this.vizDetails.file}`,
          })
        } else if (event.data.finished) {
          this.finishedLoadingData(totalRows, event.data)
        } else if (event.data.needCRS) {
          if (this.gzipWorker) this.gzipWorker.terminate()
          let userCRS = prompt('' + this.$t('promptCRS')) || 'EPSG:25833'
          if (Number.isFinite(parseInt(userCRS))) userCRS = `EPSG:${userCRS}`
          this.vizDetails.projection = userCRS.toUpperCase()
          this.parseCSVFile(filename)
        } else {
          const rows = event.data.time.length
          // zoom map on first load
          if (!totalRows) this.setFirstZoom(event.data.coordinates, rows)
          // save layer data
          totalRows += rows
          this.timeRange = [
            Math.min(this.timeRange[0], event.data.time[0]),
            Math.max(this.timeRange[1], event.data.time[rows - 1]),
          ]
          this.pointLayers.push(event.data)
        }
      }

      this.gzipWorker.postMessage({
        filepath: filename,
        fileSystem: this.fileSystem,
        projection: this.vizDetails.projection,
      })
    },

    setFirstZoom(coordinates: any[], rows: number) {
      const longitude = 0.5 * (coordinates[0] + coordinates[rows * 2 - 2])
      const latitude = 0.5 * (coordinates[1] + coordinates[rows * 2 - 1])

      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        globalStore.commit(
          'setMapCamera',
          Object.assign({}, globalStore.state.viewState, { longitude, latitude, zoom: 10 })
        )
      }
    },

    finishedLoadingData(totalRows: number, data: any) {
      console.log('ALL DONE', { totalRows, data: data.range, time: this.timeRange })
      this.myState.statusMessage = ''
      this.timeFilter = [this.timeRange[0], this.timeRange[0] + 3599]
      this.isLoaded = true
      this.range = data.range
      // if (!this.timeRange[1]) this.timeRange[1] = 1
      if (this.gzipWorker) this.gzipWorker.terminate()

      this.setColors()
      this.moveLogo()
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

    toggleAnimation() {
      this.isAnimating = !this.isAnimating
      if (this.isAnimating) {
        this.animationElapsedTime = this.timeFilter[0] - this.timeRange[0]
        this.startTime = Date.now() - this.animationElapsedTime / this.ANIMATE_SPEED
        this.animate()
      }
    },

    setColors() {
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

      this.colors = colors

      // figure out min and max
      const max1 = Math.pow(this.range[1], 1 / EXPONENT)
      const max2 = (max1 * this.guiConfig['clip max']) / 100.0
      // const clippedMin = (this.range[1] * this.clipData[0]) / 100.0
      // console.log({ max1, max2 })

      // Generate breakpoints only if there are not already set
      if (!this.vizDetails.breakpoints) {
        const breakpoints = [] as number[]
        for (let i = 1; i < this.guiConfig.buckets; i++) {
          const raw = (max2 * i) / this.guiConfig.buckets
          const breakpoint = Math.pow(raw, EXPONENT)
          breakpoints.push(breakpoint)
        }

        this.breakpoints = breakpoints
      }

      // only update legend if we have the full dataset already
      if (this.isLoaded) this.setLegend(colors, this.breakpoints)
    },

    setLegend(colors: any[], breakpoints: number[]) {
      // hide the legend if there is no data to show.
      if (this.range[1] - this.range[0] === 0) return

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

    async loadFiles() {
      await this.fileApi.getChromePermission(this.fileSystem.handle)

      try {
        let filename = `${this.myState.subfolder}/${this.vizDetails.file}`
        await this.parseCSVFile(filename)
        this.$emit('isLoaded')
      } catch (e) {
        console.error(e)
        this.myState.statusMessage = '' + e
        this.$emit('error', {
          type: Status.ERROR,
          msg: `Loading/Parsing Error`,
          desc: 'Error loading/parsing: ${this.myState.subfolder}/${this.vizDetails.file}',
        })
      }
    },

    convertSecondsToClockTimeMinutes(index: number) {
      const h = Math.floor(index / 3600)
      const m = Math.floor((index - h * 3600) / 60)
      const s = index - h * 3600 - m * 60

      const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

      return `${hms.h}:${hms.m}`
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.viz-plugin {
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

.viz-plugin.hide-thumbnail {
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
    color: var(--textFancy);
    font-size: 1.2rem;
    font-weight: normal;
    line-height: 1.75rem;
    margin: auto 0.5rem auto 0;
    padding: 0 0;
  }
}

.map-layer {
  pointer-events: auto;
}

.drawing-tool {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.bottom-right {
  position: absolute;
  bottom: 0;
  right: 0;
  margin: auto 7px 15rem auto;
  box-shadow: 0px 0px 5px 3px rgba(128, 128, 128, 0.1);
}

.legend-area {
  background-color: var(--bgPanel);
  border: 1px solid var(--bgPanel2);
}

.time-slider-area {
  position: absolute;
  bottom: 2.5rem;
  left: 0;
  right: 0;
  margin: 0 8rem 0 0.5rem;
  filter: $filterShadow;
}

.buckets {
  color: var(--text);
  padding: 4px 4px 4px 4px;
  display: flex;
}

.ramp-selector {
  background-color: var(--bgBold);
}

.configurator {
  user-select: none;
  background-color: var(--bgPanel);
  margin-top: 2rem;
}

.clip-slider {
  margin: 0 0.5rem;
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

* > .number {
  background-color: yellow;
}

@media only screen and (max-width: 640px) {
  .message {
    padding: 0.5rem 0.5rem;
  }
}
</style>
