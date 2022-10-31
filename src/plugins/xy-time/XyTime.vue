<template lang="pug">
.viz-plugin(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  xy-time-deck-map.map-layer(v-if="!thumbnail"
    :viewId="viewId"
    :pointLayers="pointLayers"
    :timeFilter="timeFilter"
    :dark="this.$store.state.isDarkMode"
    :colors="this.colors"
    :breakpoints="this.breakpoints"
  )

  zoom-buttons(v-if="!thumbnail")

  .bottom-right
    .legend-area(v-if="legendStore")
      legend-box(:legendStore="legendStore")

    .configurator
      .buckets
        b-button.is-link(outlined size="is-small" @click="incBuckets(-1)") <
        p(style="margin: 0 auto") {{ numBuckets }}
        b-button.is-link(outlined size="is-small" @click="incBuckets(1)") >
      .buckets
        b-button.is-link(outlined size="is-small" @click="incPowerFunction(-1)") <
        p(style="margin: 0 auto") {{ powerFunction }}
        b-button.is-link(outlined size="is-small" @click="incPowerFunction(1)") >
      .buckets.clip-slider
        b-slider(v-model="clipData" :min="0" :max="100")
      .buckets
        b-checkbox(outlined size="is-small" v-model="isColorRampFlipped") Flip
      .buckets
        b-select.selector.ramp-selector(expanded v-model="colorRamp" size="is-small" @select="handleColorRamp")
          option(v-for="column in colorRamps" :value="column" :label="column")

  .time-slider(v-if="isLoaded")
    time-slider(
      :range="[0,86400]"
      :values="timeFilter"
      :labels="timeLabels"
      @values="handleTimeSliderValues"
      @drag="isAnimating=false"
    )
    b-button.play-button(size="is-small" type="is-link"
      :style="{fontWeight: isAnimating ? '' : 'bold'}"
      @click="toggleAnimation"
      ) {{ isAnimating ? '| |' : '▶️' }}

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

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
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
    LegendBox,
    TimeSlider,
    ZoomButtons,
    XyTimeDeckMap,
  } as any,
})
class XyTime extends Vue {
  @Prop({ required: true })
  private root!: string

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private config!: any

  @Prop({ required: false })
  private thumbnail!: boolean

  private viewId = ('xyt-id-' + Math.random()) as any

  private timeLabels: any[] = [0, 1]
  private elapsed = 0
  private startTime = 0
  private isAnimating = false
  private timeFilter = [0, 3599]

  private colors: number[][] = [
    [128, 128, 128],
    [128, 128, 128],
  ]
  private breakpoints: number[] = [0.0]
  private range = [Infinity, -Infinity]

  private clipData = [0, 100]

  @Watch('colorRamp')
  private handleColorRamp() {
    this.setColors()
  }

  @Watch('clipData')
  private handleClipData() {
    this.setColors()
  }

  private legendStore: LegendStore | null = null

  private handleTimeSliderValues(timeValues: any[]) {
    this.elapsed = timeValues[0]
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

  private colorRamps = [
    'bathymetry',
    'chlorophyll',
    'electric',
    'inferno',
    'magma',
    'par',
    'viridis',
  ]
  private colorRamp = 'viridis'

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

  private pointLayers: PointLayer[] = []

  private isLoaded = false

  private animator: any = null

  private async mounted() {
    console.log('MOUNTED!')
    this.$store.commit('setFullScreen', !this.thumbnail)
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()
    await this.getVizDetails()
    await this.buildThumbnail()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    if (!this.isLoaded) await this.loadFiles()
    // this.mapState.center = this.findCenter(this.rawRequests)
  }

  private beforeDestroy() {
    try {
      if (this.gzipWorker) this.gzipWorker.terminate()
    } catch (e) {
      console.warn(e)
    }

    if (this.animator) window.cancelAnimationFrame(this.animator)

    this.$store.commit('setFullScreen', false)
  }

  @Watch('$store.state.viewState') viewMoved() {
    if (!REACT_VIEW_HANDLES[this.viewId]) return
    REACT_VIEW_HANDLES[this.viewId]()
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
    let projection = 'EPSG:25833' // 'EPSG:25832', // 'EPSG:31468', // TODO: fix

    // if (!this.myState.thumbnail) {
    //   projection = prompt('Enter projection: e.g. "EPSG:31468"') || 'EPSG:31468'
    //   if (!!parseInt(projection, 10)) projection = 'EPSG:' + projection
    // }

    // console.log(this.myState)

    // output_trips:
    this.vizDetails = {
      title: 'Point Data',
      description: this.myState.yamlConfig,
      file: this.myState.yamlConfig,
      projection,
      center: this.vizDetails.center,
      zoom: this.vizDetails.zoom,
    }
    this.$emit('title', this.vizDetails.title)
    // this.solveProjection()
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

    const t = this.vizDetails.title ? this.vizDetails.title : 'Point Data'
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

  private async parseCSVFile(filename: string) {
    if (!this.myState.fileSystem) return
    this.myState.statusMessage = 'Loading file...'

    let totalRows = 0
    // get the raw unzipped arraybuffer
    this.gzipWorker = new XytDataParser()

    this.gzipWorker.onmessage = async (event: MessageEvent) => {
      if (event.data.status) {
        this.myState.statusMessage = event.data.status
      } else if (event.data.error) {
        this.myState.statusMessage = event.data.error
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `Loading Error`,
          desc: 'Error loading: ${this.myState.subfolder}/${this.vizDetails.file}',
        })
      } else if (event.data.finished) {
        this.finishedLoadingData(totalRows, event.data)
      } else {
        totalRows += event.data.time.length
        this.pointLayers.push(event.data)
      }
    }

    this.gzipWorker.postMessage({
      filepath: filename,
      fileSystem: this.myState.fileSystem,
      projection: this.vizDetails.projection,
    })
  }

  private finishedLoadingData(totalRows: number, data: any) {
    console.log('ALL DONE', totalRows)
    this.isLoaded = true
    this.range = data.range
    this.myState.statusMessage = ''
    this.gzipWorker.terminate()

    this.setColors()
  }

  private animate() {
    setTimeout(() => {
      if (!this.isAnimating) return

      this.elapsed = 5 * (Date.now() - this.startTime)

      if (this.elapsed > 86400) {
        this.startTime = Date.now()
        this.elapsed = 0
      }

      const span = this.timeFilter[1] - this.timeFilter[0]
      this.timeFilter = [this.elapsed, this.elapsed + span]

      this.animator = window.requestAnimationFrame(this.animate)
    }, 16.6666666667)
  }

  private toggleAnimation() {
    this.isAnimating = !this.isAnimating
    if (this.isAnimating) {
      this.startTime = Date.now() - this.elapsed / 5
      this.animate()
    }
  }

  private isColorRampFlipped = false

  @Watch('isColorRampFlipped')
  private flipColorRamp() {
    this.setColors()
  }

  private numBuckets = 7
  private incBuckets(num: number) {
    this.numBuckets += num
    this.numBuckets = Math.max(2, Math.min(15, this.numBuckets))
    this.setColors()
  }

  private powerFunction = 4
  private incPowerFunction(num: number) {
    this.powerFunction += num
    this.powerFunction = Math.max(1, Math.min(10, this.powerFunction))
    this.setColors()
  }

  private setColors() {
    const EXPONENT = this.powerFunction // 4 // log-e? not steep enough

    let colors256 = colormap({
      colormap: this.colorRamp,
      nshades: 256,
      format: 'rba',
      alpha: 1,
    }).map((c: number[]) => [c[0], c[1], c[2]])

    if (this.isColorRampFlipped) colors256 = colors256.reverse()

    const step = 256 / (this.numBuckets - 1)
    const colors = []
    for (let i = 0; i < this.numBuckets - 1; i++) {
      colors.push(colors256[Math.round(step * i)])
    }
    colors.push(colors256[255])

    // figure out min and max
    const max1 = Math.pow(this.range[1], 1 / EXPONENT)
    const max2 = (max1 * this.clipData[1]) / 100.0
    // const clippedMin = (this.range[1] * this.clipData[0]) / 100.0

    console.log({ max1, max2 })

    const breakpoints = [] as number[]
    for (let i = 1; i < this.numBuckets; i++) {
      const raw = (max2 * i) / this.numBuckets
      const breakpoint = Math.pow(raw, EXPONENT)
      breakpoints.push(breakpoint)
    }

    // only update legend if we have the full dataset already
    if (this.isLoaded) this.setLegend(colors, breakpoints)

    this.colors = colors
    this.breakpoints = breakpoints
  }

  private setLegend(colors: any[], breakpoints: number[]) {
    console.log({ colors, breakpoints })
    this.legendStore = new LegendStore()
    this.legendStore.setLegendSection({
      section: 'Legend',
      column: 'NOx: g/m',
      values: colors.map((rgb, index) => {
        const breakpoint = breakpoints[index == 0 ? index : index - 1]
        let label = '' + Math.round(1e6 * breakpoint) / 1e6
        if (index == 0) label = '< ' + label
        if (index == colors.length - 1) label = '> ' + label
        return { label, value: rgb }
      }),
    })
  }

  private async loadFiles() {
    let dataArray: any = []
    if (!this.myState.fileApi) return { dataArray }

    try {
      let filename = `${this.myState.subfolder}/${this.vizDetails.file}`
      await this.parseCSVFile(filename)
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
  kebabName: 'xy-time',
  prettyName: 'X/Y Time Viewer',
  description: 'Displays point data over time',
  filePatterns: ['**/viz-xyt-*.y?(a)ml', '**/*xyt.csv?(.gz)'],
  component: XyTime,
} as VisualizationPlugin)

export default XyTime
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
  margin: auto 1rem 7rem auto;
}

.legend-area {
  background-color: var(--bgPanel);
  border: 1px solid var(--bgPanel2);
}

.time-slider {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0 1rem 20px 1rem;
  display: flex;
  flex-direction: column;
}

.time-slider button {
  margin-top: 4px;
  margin-right: auto;
}

.time-slider .play-button {
  background-color: #37547d;
}

.time-slider .play-button:hover {
  background-color: #173b6d;
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

@media only screen and (max-width: 640px) {
  .message {
    padding: 0.5rem 0.5rem;
  }
}
</style>
