<template lang="pug">
.viz-plugin(oncontextmenu="return false" :id="`id-${viewId}`")

  event-map.map-layer(v-if="!thumbnail && isLoaded"
    :viewId="viewId"
    :eventLayers="eventLayers"
    :network="network"
    :linkIdLookup="linkIdLookup"
    :timeFilter="timeFilter"
    :dark="this.$store.state.isDarkMode"
    :colors="this.colors"
    :breakpoints="this.breakpoints"
    :radius="this.guiConfig.radius"
    :mapIsIndependent="false"
    :simulationTime="timeFilter[1]"
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

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
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
import EventMap from './EventDeckMap'
import ZoomButtons from '@/components/ZoomButtons.vue'

import MATSimEventStreamer from '@/workers/MATSimEventStreamer.worker.ts?worker'

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

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    EventMap,
    LegendBox,
    TimeSlider,
    ZoomButtons,
  } as any,
})
class Plugin extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private subfolder!: string
  @Prop({ required: false }) private yamlConfig!: string
  @Prop({ required: false }) private config!: any
  @Prop({ required: false }) private thumbnail!: boolean
  @Prop({ required: false }) datamanager!: DashboardDataManager

  private myDataManager!: DashboardDataManager
  private network: NetworkLinks = {
    source: new Float32Array(),
    dest: new Float32Array(),
    linkIds: [],
  }
  private linkIdLookup = {} as any

  private guiConfig = {
    buckets: 7,
    exponent: 4,
    radius: 5,
    'clip max': 100,
    'color ramp': 'viridis',
    colorRamps: ['bathymetry', 'electric', 'inferno', 'jet', 'magma', 'par', 'viridis'],
    flip: false,
  }

  private viewId = ('xyt-id-' + Math.random()) as any
  private configId = ('gui-config-' + Math.random()) as any

  private timeLabels: any[] = [0, 1]
  private startTime = 0
  private isAnimating = false
  private timeFilter = [0, 3599]

  private colors: number[][] = [
    [128, 128, 128],
    [128, 128, 128],
  ]
  private breakpoints: number[] = [0.0]
  private range = [Infinity, -Infinity]
  private timeRange = [Infinity, -Infinity]

  private legendStore: LegendStore | null = null

  private handleTimeSliderValues(timeValues: any[]) {
    this.animationElapsedTime = timeValues[0]
    this.timeFilter = timeValues
    this.timeLabels = [
      this.convertSecondsToClockTimeMinutes(timeValues[0]),
      this.convertSecondsToClockTimeMinutes(timeValues[1]),
    ]
  }

  private standaloneYAMLconfig = {
    title: '',
    description: '',
    file: '',
    projection: '',
    thumbnail: '',
    radius: 250,
    maxHeight: 0,
    center: null as any,
    zoom: 9,
  }

  private YAMLrequirementsXY = {
    file: '',
  }

  private columnLookup: number[] = []
  private gzipWorker!: Worker

  private vizDetails: VizDetail = {
    title: '',
    description: '',
    file: '',
    projection: '',
    thumbnail: '',
    center: null as any,
    zoom: 9,
  }

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private eventLayers: any[] = []

  private isLoaded = false

  private animator: any = null

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    // DataManager might be passed in from the dashboard; or we might be
    // in single-view mode, in which case we need to create one for ourselves
    this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)

    this.buildFileApi()
    await this.getVizDetails()
    await this.buildThumbnail()

    if (this.thumbnail) return

    this.setupLogoMover()

    // ----------------------------------------------------
    // this.setupGui()
    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    if (!this.isLoaded) await this.loadFiles()
  }

  private guiController?: GUI

  private resizer!: ResizeObserver

  private setupLogoMover() {
    this.resizer = new ResizeObserver(this.moveLogo)
    const deckmap = document.getElementById(`id-${this.viewId}`) as HTMLElement
    this.resizer.observe(deckmap)
  }

  private moveLogo() {
    const deckmap = document.getElementById(`${this.viewId}`) as HTMLElement
    const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
    if (logo) {
      const right = deckmap.clientWidth > 640 ? '280px' : '36px'
      logo.style.right = right
    }
  }

  private setupGui() {
    this.guiController = new GUI({
      title: 'Color Settings',
      injectStyles: true,
      width: 200,
      container: document.getElementById(this.configId) || undefined,
    })

    const colors = this.guiController // .addFolder('Colors')
    colors.add(this.guiConfig, 'buckets', 2, 19, 1).onChange(this.setColors)
    colors.add(this.guiConfig, 'exponent', 1, 10, 1).onChange(this.setColors)
    colors.add(this.guiConfig, 'clip max', 0, 100, 1).onChange(this.setColors)
    colors.add(this.guiConfig, 'radius', 1, 20, 1)
    colors.add(this.guiConfig, 'color ramp', this.guiConfig.colorRamps).onChange(this.setColors)
    colors.add(this.guiConfig, 'flip').onChange(this.setColors)

    // const times = this.guiController.addFolder('Time')
  }

  private beforeDestroy() {
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
  }

  @Watch('$store.state.viewState') viewMoved() {
    if (REACT_VIEW_HANDLES[this.viewId]) REACT_VIEW_HANDLES[this.viewId]()
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async solveProjection() {
    if (!this.myState.fileApi) return
    if (this.thumbnail) return

    console.log('WHAT PROJECTION:')

    try {
      const text = await this.myState.fileApi.getFileText(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )
      this.vizDetails = YAML.parse(text)
    } catch (e) {
      console.error(e)
    }
  }

  private async getVizDetails() {
    if (this.config) {
      this.validateYAML()
      this.vizDetails = Object.assign({}, this.config)
      return
    }

    const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

    if (hasYaml) {
      await this.loadStandaloneYAMLConfig()
    } else {
      // console.log('NO YAML WTF')
      this.setConfigForRawCSV()
    }
  }

  private setConfigForRawCSV() {
    let projection = 'EPSG:4326' // Include "# EPSG:xxx" in header of CSV to set EPSG

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
  }

  private async loadStandaloneYAMLConfig() {
    if (!this.myState.fileApi) return
    try {
      // might be a project config:
      const filename =
        this.myState.yamlConfig.indexOf('/') > -1
          ? this.myState.yamlConfig
          : this.myState.subfolder + '/' + this.myState.yamlConfig

      const text = await this.myState.fileApi.getFileText(filename)
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
  }

  private validateYAML() {
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
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `YAML file missing required key: ${key}`,
          desc: 'Check this.YAMLrequirementsXY for required keys',
        })
      }
    }

    if (configuration.radius == 0) {
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: `Radius set to zero`,
        desc: 'Radius can not be zero, preset value used instead. ',
      })
    }

    if (configuration.zoom < 5 || configuration.zoom > 20) {
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: `Zoom is out of the recommended range `,
        desc: 'Zoom levels should be between 5 and 20. ',
      })
    }
  }

  private setVizDetails() {
    this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)

    const t = this.vizDetails.title ? this.vizDetails.title : 'EVENTS: ' + this.vizDetails.file
    this.$emit('title', t)
  }

  private async buildThumbnail() {
    if (!this.myState.fileApi) return
    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
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
  }

  private async streamEventFile(filename: string) {
    if (!this.myState.fileSystem) return

    this.myState.statusMessage = 'Loading file...'
    let totalRows = 0
    this.range = [Infinity, -Infinity]
    this.timeRange = [Infinity, -Infinity]
    this.animationElapsedTime = 0
    this.timeFilter = [0, 3599]

    // get the raw unzipped arraybuffer
    if (this.gzipWorker) this.gzipWorker.terminate()
    this.eventLayers = []
    this.gzipWorker = new MATSimEventStreamer()

    this.gzipWorker.onmessage = async (event: MessageEvent) => {
      const message = event.data
      if (message.status) {
        this.myState.statusMessage = message.status
      } else if (message.error) {
        this.myState.statusMessage = message.error
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `XYT Loading Error`,
          desc: `Error loading: ${this.myState.subfolder}/${this.vizDetails.file}`,
        })
      } else if (message.finished) {
        this.finishedLoadingData(totalRows, message)
      } else {
        const events = message.events as any[]

        console.log(events.length)

        totalRows += events.length
        this.myState.statusMessage = 'Loading ' + totalRows + ' events'

        // minmax all events
        this.timeRange = [
          Math.min(this.timeRange[0], events[0].time),
          Math.max(this.timeRange[1], events[events.length - 1].time),
        ]

        // minmax vehicle trips specifically
        this.timeRange = [
          Math.min(this.timeRange[0], message.vehicleTrips[0].t0),
          Math.max(this.timeRange[1], message.vehicleTrips[message.vehicleTrips.length - 1].t1),
        ]

        // .filter(row => row.link)
        const linkEvents = events.map(row => {
          return {
            time: row.time,
            link: row.link,
          } as any
        })

        // POSITIONS ----
        const positions = new Float32Array(2 * linkEvents.length).fill(NaN)
        for (let i = 0; i < linkEvents.length; i++) {
          const offset = 2 * this.linkIdLookup[linkEvents[i].link]
          positions[i * 2] = this.network.source[offset]
          positions[i * 2 + 1] = this.network.source[offset + 1]
        }

        // VEHICLES -----------
        const numTrips = message.vehicleTrips.length
        const tripData = {
          locO: new Float32Array(2 * numTrips).fill(NaN),
          locD: new Float32Array(2 * numTrips).fill(NaN),
          t0: new Float32Array(numTrips).fill(NaN),
          t1: new Float32Array(numTrips).fill(NaN),
        }

        for (let i = 0; i < numTrips; i++) {
          const trip = message.vehicleTrips[i]
          const offset = 2 * this.linkIdLookup[trip.link]
          tripData.locO[i * 2 + 0] = this.network.source[0 + offset]
          tripData.locO[i * 2 + 1] = this.network.source[1 + offset]
          tripData.locD[i * 2 + 0] = this.network.dest[0 + offset]
          tripData.locD[i * 2 + 1] = this.network.dest[1 + offset]
          // enter/leave traffic happen in the middle of the link
          if (i == 0) {
            tripData.locO[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
            tripData.locO[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
          } else if (i == numTrips - 1) {
            tripData.locD[i * 2 + 0] = 0.5 * (tripData.locO[i * 2 + 0] + tripData.locD[i * 2 + 0])
            tripData.locD[i * 2 + 1] = 0.5 * (tripData.locO[i * 2 + 1] + tripData.locD[i * 2 + 1])
          }
          tripData.t0[i] = trip.t0
          tripData.t1[i] = trip.t1
        }

        // ALL DONE --------

        this.eventLayers.push({
          events: events.slice(1, 2), // linkEvents.slice(1, 2),
          positions,
          vehicles: tripData,
          times: message.times,
        })

        // zoom map on first load
        // if (!totalRows) this.setFirstZoom(message.coordinates, rows)
        // // save layer data
        // totalRows += rows
      }
    }

    this.gzipWorker.postMessage({
      filePath: filename,
      fileSystem: this.myState.fileSystem,
      projection: this.vizDetails.projection,
    })
  }

  private setFirstZoom(coordinates: any[], rows: number) {
    const longitude = 0.5 * (coordinates[0] + coordinates[rows * 2 - 2])
    const latitude = 0.5 * (coordinates[1] + coordinates[rows * 2 - 1])

    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      globalStore.commit(
        'setMapCamera',
        Object.assign({}, globalStore.state.viewState, { longitude, latitude, zoom: 10 })
      )
    }
  }

  private finishedLoadingData(totalRows: number, data: any) {
    console.log('FINAL time', this.timeRange)
    this.timeFilter = [this.timeRange[0], this.timeRange[0] + 3599]
    this.isLoaded = true
    this.myState.statusMessage = ''
    this.gzipWorker.terminate()
    console.log('DONE: layers', this.eventLayers.length)
    // this.eventLayers = [...this.eventLayers]

    return

    console.log('ALL DONE', { totalRows, data: data.range, time: this.timeRange })
    this.myState.statusMessage = ''
    this.timeFilter = [this.timeRange[0], this.timeRange[0] + 3599]
    this.isLoaded = true
    this.range = data.range
    // if (!this.timeRange[1]) this.timeRange[1] = 1
    this.gzipWorker.terminate()

    this.setColors()
    this.moveLogo()
  }

  private ANIMATE_SPEED = 0.25
  private animationElapsedTime = 0
  private animationClockTime = 0

  private animate() {
    if (!this.isAnimating) return

    this.animationElapsedTime = this.ANIMATE_SPEED * (Date.now() - this.startTime)

    this.animationClockTime = this.animationElapsedTime + this.timeRange[0]

    if (this.animationClockTime > this.timeRange[1]) {
      this.startTime = Date.now()
      this.animationElapsedTime = 0 // this.timeRange[0]
    }

    const span = this.timeFilter[1] - this.timeFilter[0]
    this.timeFilter = [this.animationClockTime, this.animationClockTime + span]

    this.animator = window.requestAnimationFrame(this.animate)
  }

  private toggleAnimation() {
    this.isAnimating = !this.isAnimating
    if (this.isAnimating) {
      this.animationElapsedTime = this.timeFilter[0] - this.timeRange[0]
      this.startTime = Date.now() - this.animationElapsedTime / this.ANIMATE_SPEED
      this.animate()
    }
  }

  private setColors() {
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

    // figure out min and max
    const max1 = Math.pow(this.range[1], 1 / EXPONENT)
    const max2 = (max1 * this.guiConfig['clip max']) / 100.0
    // const clippedMin = (this.range[1] * this.clipData[0]) / 100.0

    // console.log({ max1, max2 })

    const breakpoints = [] as number[]
    for (let i = 1; i < this.guiConfig.buckets; i++) {
      const raw = (max2 * i) / this.guiConfig.buckets
      const breakpoint = Math.pow(raw, EXPONENT)
      breakpoints.push(breakpoint)
    }

    // only update legend if we have the full dataset already
    if (this.isLoaded) this.setLegend(colors, breakpoints)

    this.colors = colors
    this.breakpoints = breakpoints
  }

  private setLegend(colors: any[], breakpoints: number[]) {
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
  }

  private async loadNetwork() {
    // get network
    console.log('1 loading network')
    let networkFilename = this.vizDetails.file.replace('events.xml', 'network.xml')
    const network = await this.myDataManager.getRoadNetwork(
      networkFilename,
      this.myState.subfolder,
      Object.assign({ projection: '25833' }, this.vizDetails)
    )

    const linkIdLookup = {} as any
    let i = 0
    for (const link of network.linkIds) {
      linkIdLookup[`${link}`] = i
      i++
    }

    console.log(2, linkIdLookup['1'], { linkIdLookup, network })
    return { network, linkIdLookup }
  }

  private async loadFiles() {
    const { network, linkIdLookup } = await this.loadNetwork()
    this.network = network
    this.linkIdLookup = linkIdLookup

    let dataArray: any = []
    if (!this.myState.fileApi) return { dataArray }

    try {
      let filename = `${this.myState.subfolder}/${this.vizDetails.file}`
      await this.streamEventFile(filename)
    } catch (e) {
      console.error(e)
      this.myState.statusMessage = '' + e
      this.$store.commit('setStatus', {
        type: Status.ERROR,
        msg: `Loading/Parsing Error`,
        desc: 'Error loading/parsing: ${this.myState.subfolder}/${this.vizDetails.file}',
      })
    }
  }

  private convertSecondsToClockTimeMinutes(index: number) {
    const h = Math.floor(index / 3600)
    const m = Math.floor((index - h * 3600) / 60)
    const s = index - h * 3600 - m * 60

    const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

    return `${hms.h}:${hms.m}`
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'events',
  prettyName: 'Event Viewer',
  description: 'MATSim event viewer',
  filePatterns: ['**/viz-events*.y?(a)ml', '**/*events.xml'],
  component: Plugin,
} as VisualizationPlugin)

export default Plugin
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
