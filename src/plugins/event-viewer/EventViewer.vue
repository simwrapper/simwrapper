<template lang="pug">
.viz-plugin(oncontextmenu="return false" :id="`id-${viewId}`")

  event-map.map-layer(v-if="isLoaded && !thumbnail"
    :viewId="viewId"
    :eventData = "eventData"
    :eventLayers="eventLayers"
    :network="network"
    :linkIdLookup="linkIdLookup"
    :timeFilter="timeFilter"
    :dark="this.$store.state.isDarkMode"
    :colors="this.colors"
    :breakpoints="this.breakpoints"
    :radius="this.guiConfig.radius"
    :mapIsIndependent="false"
    :simulationTime="simTime"
    :projection="vizDetails.projection"
    :dotsize="guiConfig.size"
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
import type { PropType } from 'vue'

import GUI from 'lil-gui'
import YAML from 'yaml'
import colormap from 'colormap'
import * as Comlink from 'comlink'
import util from '@/js/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import LegendBox from '@/components/viz-configurator/LegendBox.vue'
import LegendStore from '@/js/LegendStore'
import TimeSlider from '@/components/TimeSlider.vue'
import EventMap from './EventDeckMap'
import ZoomButtons from '@/components/ZoomButtons.vue'

import WasmEventStreamer from './WASMEventStreamer.worker.ts?worker'

export interface EventTask {
  startStream: any
}

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
import DashboardDataManager, { NetworkLinks } from '@/js/DashboardDataManager'

interface VizDetail {
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  center: any
  zoom: number
}

interface PointLayer {
  color: Uint8Array
  value: Float32Array
  coordinates: Float32Array
  time: Float32Array
  timeRange: number[]
}

const MyComponent = defineComponent({
  name: 'EventViewerPlugin',
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    EventMap,
    LegendBox,
    TimeSlider,
    ZoomButtons,
  },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object as any,
    thumbnail: Boolean,
    datamanager: { type: Object as PropType<DashboardDataManager> },
  },
  data: () => {
    const colorRamps = ['bathymetry', 'electric', 'inferno', 'jet', 'magma', 'par', 'viridis']

    return {
      myDataManager: null as DashboardDataManager | null,
      network: {
        source: new Float32Array(),
        dest: new Float32Array(),
        linkIds: [],
        projection: '',
      } as NetworkLinks,
      linkIdLookup: {} as any,
      guiConfig: {
        speed: 0.25,
        size: 18,
      },
      viewId: ('xyt-id-' + Math.floor(1e12 * Math.random())) as any,
      configId: ('gui-config-' + Math.floor(1e12 * Math.random())) as any,
      timeLabels: [0, 1] as any[],
      startTime: 0,
      isAnimating: false,
      simTime: 0,
      timeFilter: [0, 3600],
      colors: [
        [128, 128, 128],
        [128, 128, 128],
      ] as number[][],
      breakpoints: [0],
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
      } as any,
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
      } as VizDetail,
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },
      eventLayers: [] as any[],
      eventData: [] as any[],
      isLoaded: false,
      animator: null as any,
      guiController: null as GUI | null,
      resizer: null as ResizeObserver | null,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      ANIMATE_SPEED: 0.25,
      animationElapsedTime: 0,
      animationClockTime: 0,
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
  },
  watch: {
    '$store.state.viewState'() {
      if (REACT_VIEW_HANDLES[this.viewId]) REACT_VIEW_HANDLES[this.viewId]()
    },
  },
  methods: {
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
        title: 'VIEW SETTINGS',
        injectStyles: true,
        width: 200,
        container: document.getElementById(this.configId) || undefined,
      })

      const widgets = this.guiController // .addFolder('Colors')
      widgets.add(this.guiConfig, 'size', 4, 40, 1).onChange(this.setConfig)
      widgets
        .add(this.guiConfig, 'speed', [-2, -1, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1, 2], 1)
        .onChange(this.setConfig)
      // colors.add(this.guiConfig, 'exponent', 1, 10, 1).onChange(this.setColors)
      // colors.add(this.guiConfig, 'clip max', 0, 100, 1).onChange(this.setColors)
      // colors.add(this.guiConfig, 'radius', 1, 20, 1)
      // colors.add(this.guiConfig, 'color ramp', this.guiConfig.colorRamps).onChange(this.setColors)
      // colors.add(this.guiConfig, 'flip').onChange(this.setColors)
      // const times = this.guiController.addFolder('Time')
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
        this.vizDetails = Object.assign({}, this.config)
        return
      }

      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      if (hasYaml) {
        await this.loadStandaloneYAMLConfig()
      } else {
        console.log('NO YAML WTF')
        this.setConfigForRawCSV()
      }
    },

    setConfigForRawCSV() {
      let projection = '' // 'EPSG:4326' // Include "# EPSG:xxx" in header of CSV to set EPSG

      // output_trips:
      this.vizDetails = {
        title: 'EVENTS: ' + this.myState.yamlConfig,
        description: this.myState.yamlConfig,
        file: this.myState.yamlConfig,
        projection,
        center: this.vizDetails.center,
        zoom: this.vizDetails.zoom,
      }
      this.$emit('title', this.vizDetails.title || this.vizDetails.file)
      return
    },

    async loadStandaloneYAMLConfig() {
      if (!this.fileApi) return
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

        this.$emit('error', {
          type: Status.ERROR,
          msg: `File not found`,
          desc: `Could not find: ${this.myState.subfolder}/${this.myState.yamlConfig}`,
        })
      }
    },

    validateYAML() {
      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)
      let configuration

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
            msg: `EventViewer missing required key: ${key}`,
            desc: `Required keys: ${Object.keys(this.YAMLrequirementsXY)}`,
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

      if (configuration.zoom < 5 || configuration.zoom > 20) {
        this.$emit('error', {
          type: Status.WARNING,
          msg: `Zoom is out of the recommended range `,
          desc: 'Zoom levels should be between 5 and 20. ',
        })
      }
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

      const t = this.vizDetails.title ? this.vizDetails.title : 'EVENTS: ' + this.vizDetails.file
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

    async streamEventFile(filename: string) {
      this.myState.statusMessage = 'Loading events: ' + filename

      if (this.gzipWorker) this.gzipWorker.terminate()
      this.gzipWorker = new WasmEventStreamer()
      const task = Comlink.wrap(this.gzipWorker) as unknown as EventTask

      const fsConfig = Object.assign({}, this.fileSystem)

      const layers = [{ viewer: 'vehicleViewer' }]

      task.startStream(
        {
          filename,
          layers,
          network: this.network,
          fsConfig,
        },
        // callback when stream has new data to report
        Comlink.proxy(this.receiveDataFromEventStreamer)
      )
    },

    receiveDataFromEventStreamer(props: { data: any[]; timeRange: number[] }) {
      this.eventData = [...this.eventData, props]
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

    toggleAnimation() {
      this.isAnimating = !this.isAnimating
      if (this.isAnimating) {
        this.animationElapsedTime = this.timeFilter[0] - this.timeRange[0]
        this.startTime = Date.now() - this.animationElapsedTime / this.guiConfig.speed
        this.animate()
      }
    },

    setConfig() {
      // change things here
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
    },

    async loadNetwork() {
      if (!this.myDataManager) throw Error('event viewer: no datamanager')

      // TODO for now, we'll try two network files
      const { files } = await this.fileApi.getDirectory(this.subfolder)

      let networkFile = ''
      if (files.indexOf('network.avro') > -1) networkFile = 'network.avro'
      else networkFile = this.vizDetails.file.replace('events.xml', 'network.xml')

      console.log(networkFile)
      const network = await this.myDataManager.getRoadNetwork(
        networkFile,
        this.myState.subfolder,
        Object.assign({}, this.vizDetails)
      )
      this.vizDetails.projection = '' + network.projection
      return { network }
    },

    async loadFiles() {
      const { network } = await this.loadNetwork()
      this.network = network

      // let dataArray: any = []
      // if (!this.fileApi) return { dataArray }

      // try {
      let filename = `${this.myState.subfolder}/${this.vizDetails.file}`
      await this.streamEventFile(filename)
    },

    handleTimeSliderValues(timeValues: any[]) {
      this.animationElapsedTime = timeValues[0]
      this.simTime = this.animationElapsedTime
      this.animationClockTime = this.animationElapsedTime + this.timeRange[0]
      // this.startTime = Date.now() - this.ANIMATE_SPEED * this.animationElapsedTime
      this.timeFilter = timeValues
      this.timeLabels = [
        this.convertSecondsToClockTimeMinutes(timeValues[0]),
        this.convertSecondsToClockTimeMinutes(timeValues[1]),
      ]
    },

    animate() {
      if (!this.isAnimating) return

      this.animationElapsedTime = this.guiConfig.speed * (Date.now() - this.startTime)
      this.animationClockTime = this.animationElapsedTime + this.timeRange[0]

      if (this.animationClockTime > this.timeRange[1]) {
        this.startTime = Date.now()
        this.animationElapsedTime = 0 // this.timeRange[0]
      }

      const span = 3600 // this.timeFilter[1] - this.timeFilter[0]
      this.timeFilter = [this.animationClockTime, this.animationClockTime + span]
      this.simTime = this.animationClockTime
      // this.timeFilter = [0, 86400] // this.animationClockTime, this.animationClockTime + span]

      this.animator = window.requestAnimationFrame(this.animate)
    },

    convertSecondsToClockTimeMinutes(index: number) {
      const h = Math.floor(index / 3600)
      const m = Math.floor((index - h * 3600) / 60)
      const s = index - h * 3600 - m * 60

      const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

      return `${hms.h}:${hms.m}`
    },
  },

  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    // DataManager might be passed in from the dashboard; or we might be
    // in single-view mode, in which case we need to create one for ourselves
    this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)

    await this.getVizDetails()
    await this.buildThumbnail()

    if (this.thumbnail) return

    this.setupLogoMover()

    // ----------------------------------------------------
    this.setupGui()
    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    if (!this.isLoaded) await this.loadFiles()
    this.isLoaded = true
    this.myState.statusMessage = ''
    this.timeRange = [0, 86400]
    this.toggleAnimation()
  },

  beforeDestroy() {
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
  background: var(--bgMapPanel);
}

.message {
  z-index: 5;
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: row;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  padding: 0rem 0.5rem;
  border-radius: 0;

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
  flex: 1;
  pointer-events: auto;
  position: relative;
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
