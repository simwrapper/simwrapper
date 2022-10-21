<template lang="pug">
.xy-hexagons(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  xy-time-deck-layer.hex-layer(v-if="!thumbnail && isLoaded"
    :pointLayers="pointLayers"
    :dark="this.$store.state.isDarkMode"
  )

  zoom-buttons(v-if="!thumbnail")
  //- drawing-tool.drawing-tool(v-if="!thumbnail")

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
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import CSVParserWorker from './CsvGzipParser.worker.ts?worker'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import XyTimeDeckLayer from './XyTimeDeckLayer'
import ZoomButtons from '@/components/ZoomButtons.vue'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  Status,
} from '@/Globals'

interface Aggregations {
  [heading: string]: {
    title: string
    x: string
    y: string
  }[]
}

interface VizDetail {
  title: string
  description?: string
  file: string
  projection: any
  thumbnail?: string
  elements?: string
  center: any
  zoom: number
}

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    XyTimeDeckLayer,
    VueSlider,
    ToggleButton,
    ZoomButtons,
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

  private colorRamps = ['bathymetry', 'par', 'chlorophyll', 'magma']
  // private buttonColors = ['#5E8AAE', '#BF7230', '#269367', '#9C439C']

  // private aggregations: Aggregations = {}
  private columnLookup: number[] = []
  private gzipWorker!: Worker

  private colorRamp = this.colorRamps[0]
  private globalState = globalStore.state

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

  private rowCache: {
    [id: string]: { raw: Float32Array; length: number; coordColumns: number[] }
  } = {}

  private pointLayers: { color: Uint8Array; coordinates: Float32Array; time: Float32Array }[] = []

  // private points: { coordinates: Float32Array; time: Float32Array } = {
  //   coordinates: new Float32Array(0),
  //   time: new Float32Array(0),
  // }

  private isLoaded = false

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()
    await this.getVizDetails()
    await this.buildThumbnail()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    await this.loadFiles()
    // this.mapState.center = this.findCenter(this.rawRequests)

    this.isLoaded = true
  }

  private beforeDestroy() {
    try {
      if (this.gzipWorker) this.gzipWorker.terminate()
    } catch (e) {
      console.warn(e)
    }

    this.$store.commit('setFullScreen', false)
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
      console.log('NO YAML WTF')
      this.setConfigForRawCSV()
    }
  }

  private setConfigForRawCSV() {
    let projection = 'EPSG:25833' // 'EPSG:25832', // 'EPSG:31468', // TODO: fix

    // if (!this.myState.thumbnail) {
    //   projection = prompt('Enter projection: e.g. "EPSG:31468"') || 'EPSG:31468'
    //   if (!!parseInt(projection, 10)) projection = 'EPSG:' + projection
    // }

    console.log(this.myState)

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

  // private get textColor() {
  //   const lightmode = {
  //     text: '#3498db',
  //     bg: '#eeeef480',
  //   }

  //   const darkmode = {
  //     text: 'white',
  //     bg: '#181518aa',
  //   }

  //   return this.$store.state.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  // }

  private async setMapCenter() {
    const data = Object.values(this.rowCache)[0].raw

    // If user gave us the center, use it
    if (this.vizDetails.center) {
      if (typeof this.vizDetails.center == 'string') {
        this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
      }

      this.$store.commit('setMapCamera', {
        longitude: this.vizDetails.center[0],
        latitude: this.vizDetails.center[1],
        bearing: 0,
        pitch: 0,
        zoom: this.vizDetails.zoom || 10, // use 10 default if we don't have a zoom
        jump: false,
      })
      return
    }

    // user didn't give us the center, so calculate it
    if (!data.length) return

    let samples = 0
    let longitude = 0
    let latitude = 0

    const numLinks = data.length / 2

    const gap = 4096
    for (let i = 0; i < numLinks; i += gap) {
      longitude += data[i * 2]
      latitude += data[i * 2 + 1]
      samples++
    }

    longitude = longitude / samples
    latitude = latitude / samples

    const currentView = this.$store.state.viewState

    if (longitude && latitude) {
      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        bearing: currentView.bearing,
        pitch: currentView.pitch,
        zoom: this.vizDetails.zoom || currentView.zoom,
        jump: false,
      })
    }
  }

  private async parseCSVFile(filename: string) {
    if (!this.myState.fileSystem) return
    this.myState.statusMessage = 'Loading file...'

    let totalRows = 0
    // get the raw unzipped arraybuffer
    this.gzipWorker = new CSVParserWorker()

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
        console.log('ALL DONE')
        this.myState.statusMessage = ''
        this.gzipWorker.terminate()
      } else {
        // totalRows += event.data.time.length
        // this.myState.statusMessage = `Loading ${totalRows} rows...`
        // this.myState.statusMessage = `Cleaning up...`
        const layers = [] as any[]

        const SHARD_SIZE = 1024 * 1024
        const numShards = Math.ceil(event.data.time.length / SHARD_SIZE)
        for (let shard = 0; shard < numShards; shard++) {
          const start = shard * SHARD_SIZE
          const end = SHARD_SIZE + start

          layers.push({
            time: event.data.time.subarray(start, end),
            coordinates: event.data.coordinates.subarray(start * 2, end * 2),
            color: event.data.color.subarray(start * 3, end * 3),
          })
        }
        console.log({ layers })
        this.pointLayers = layers
      }
    }

    this.gzipWorker.postMessage({
      filepath: filename,
      fileSystem: this.myState.fileSystem,
      projection: this.vizDetails.projection,
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
    margin: auto 0.5rem auto 0;
    font-weight: normal;
    padding: 0 0;
    color: var(--textFancy);
  }
}

.speed-block {
  margin-top: 1rem;
}

.legend-block {
  margin-top: 2rem;
}

.speed-slider {
  min-width: 6rem;
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

.speed-label {
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
