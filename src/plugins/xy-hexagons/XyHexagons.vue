<template lang="pug">
.xy-hexagons(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  xy-hex-deck-map.hex-layer(
    v-if="!thumbnail && isLoaded"
    :props="mapProps"
    @hexClick="handleHexClick"
    @emptyClick="handleEmptyClick"
  )

  zoom-buttons(v-if="!thumbnail")
  drawing-tool.drawing-tool(v-if="!thumbnail")

  .left-side(v-if="isLoaded && !thumbnail && vizDetails.title")
    collapsible-panel(direction="left" :locked="true")
      //- show the header in upper/left if we are in single-view mode
      .panel-items(v-if="!config")
        p.big {{ vizDetails.title }}
        p {{ vizDetails.description }}

      .panel-items(v-if="hexStats" style="color: #c0f;")
        p.big(style="margin-top: 2rem;") {{ $t('selection') }}:
        h3(style="margin-top: -1rem;") {{ $t('areas') }}: {{ hexStats.numHexagons }}, {{ $t('count') }}: {{ hexStats.rows }}
        button.button(style="color: #c0f; border-color: #c0f" @click="handleShowSelectionButton") {{ $t('showDetails') }}

  .control-panel(v-if="isLoaded && !thumbnail && !myState.statusMessage"
    :class="{'is-dashboard': config !== undefined }"
  )
        .panel-item(v-for="group in Object.keys(aggregations)" :key="group")
          p.speed-label {{ group }}
          button.button.is-small.aggregation-button(
            v-for="element,i in aggregations[group]"
            :key="i"
            :style="{'margin-bottom': '0.25rem', 'color': activeAggregation===`${group}~${i}` ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'border-right': `0.4rem solid ${buttonColors[i]}`,'border-radius': '4px', 'background-color': activeAggregation===`${group}~${i}` ? buttonColors[i] : $store.state.isDarkMode ? '#333':'white'}"
            @click="handleOrigDest(group,i)") {{ element.title }}

        .panel-item.right
          p.speed-label {{ $t('maxHeight') }}: {{ maxHeight }}
          vue-slider.speed-slider(v-model="maxHeight"
            :min="0" :max="250" :interval="5"
            :duration="0" :dotSize="12"
            tooltip="none"
          )

          p.speed-label Hex Radius: {{ radius }}
          vue-slider.speed-slider(v-model="radius"
            :min="50" :max="1000" :interval="5"
            :duration="0" :dotSize="12"
            tooltip="none"
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
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import CSVParserWorker from './CsvGzipParser.worker.ts?worker'

import {
  ColorScheme,
  FileSystem,
  LegendItem,
  LegendItemType,
  FileSystemConfig,
  VisualizationPlugin,
  Status,
} from '@/Globals'

import XyHexDeckMap from './XyHexDeckMap.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

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
  aggregations: Aggregations
}

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    XyHexDeckMap,
    VueSlider,
    ToggleButton,
    ZoomButtons,
  } as any,
})
class XyHexagons extends Vue {
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

  @Watch('extrudeTowers')
  private handleExtrude() {
    if (this.extrudeTowers && this.globalState.viewState.pitch == 0) {
      globalStore.commit(
        'setMapCamera',
        Object.assign({}, this.globalState.viewState, { pitch: 10 })
      )
    }
  }

  private radius = 250
  private maxHeight = 0

  private colorRamps = ['bathymetry', 'par', 'chlorophyll', 'magma']
  private buttonColors = ['#5E8AAE', '#BF7230', '#269367', '#9C439C']

  private aggregations: Aggregations = {}
  private columnLookup: number[] = []
  private gzipWorker!: Worker

  private get buttonLabel() {
    const [group, offset] = this.activeAggregation.split('~') as any[]
    return this.aggregations[group][offset].title
  }

  private colorRamp = this.colorRamps[0]
  private globalState = globalStore.state

  private vizDetails: VizDetail = {
    title: '',
    description: '',
    file: '',
    projection: '',
    thumbnail: '',
    aggregations: {},
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

  private requests: { raw: Float32Array; length: number } = {
    raw: new Float32Array(0),
    length: 0,
  }

  private highlightedTrips: any[] = []

  private searchTerm: string = ''
  private searchEnabled = false

  private isLoaded = false

  private activeAggregation: string = ''

  private isHighlightingZone = false

  // index of each selected hexagon, maps to the array of points that were aggregated into it
  // we only care about this during multi-select.
  private multiSelectedHexagons: { [index: string]: any[] } = {}

  private get mapProps() {
    return {
      colorRamp: this.colorRamp,
      coverage: 0.65,
      dark: this.$store.state.isDarkMode,
      data: this.requests,
      extrude: this.extrudeTowers,
      highlights: this.highlightedTrips,
      maxHeight: this.maxHeight,
      metric: this.buttonLabel,
      radius: this.radius,
      upperPercentile: 100,
      selectedHexStats: this.hexStats,
    }
  }

  private get extrudeTowers() {
    return this.maxHeight > 0
  }

  private handleEmptyClick() {
    this.flipViewToShowInvertedData({})
  }

  private handleHexClick(pickedObject: any, event: any) {
    if (!event.srcEvent.shiftKey) {
      this.multiSelectedHexagons = {}
      this.hexStats = null
      this.flipViewToShowInvertedData(pickedObject)
      return
    }

    // SHIFT!!
    const index = pickedObject?.object?.index
    if (index !== undefined) {
      if (index in this.multiSelectedHexagons) {
        delete this.multiSelectedHexagons[index]
      } else {
        this.multiSelectedHexagons[index] = pickedObject.object.points
      }
      this.hexStats = this.selectedHexagonStatistics()
    }
  }

  private flipViewToShowInvertedData(pickedObject: any) {
    if (this.isHighlightingZone) {
      // force highlight off if user clicked on a second hex
      this.isHighlightingZone = false
    } else if (!pickedObject.object) {
      // force highlight off if user clicked away
      this.isHighlightingZone = false
    } else {
      this.isHighlightingZone = true
    }

    const parts = this.activeAggregation.split('~') // an unlikely unicode

    let suffix = 0
    let revSuffix = 0

    // set up the hexagons
    if (!this.isHighlightingZone) {
      // reset the view
      this.hexStats = null
      this.multiSelectedHexagons = {}
      this.handleOrigDest(parts[0], parseInt(parts[1]))
    } else {
      // select the anti-view
      suffix = parseInt(parts[1])
      revSuffix = suffix % 2 ? suffix - 1 : suffix + 1

      const origKey = `${parts[0]}${suffix}`
      const origArray = this.rowCache[origKey]

      const key = `${parts[0]}${revSuffix}`
      const inverseArray = this.rowCache[key]

      const arcFilteredRows: any = []

      for (const row of pickedObject.object.points) {
        const zoffset = row.index * 2
        const coords = [inverseArray.raw[zoffset], inverseArray.raw[zoffset + 1]]

        arcFilteredRows.push([
          // from
          [origArray.raw[zoffset], origArray.raw[zoffset + 1]],
          // to
          coords,
        ])
        this.highlightedTrips = arcFilteredRows
      }

      if (this.hexStats) this.hexStats.selectedHexagonIds = []
      this.multiSelectedHexagons = {}

      this.colorRamp = this.colorRamps[revSuffix]
    }

    // set up the connecting arc-lines
    if (!this.isHighlightingZone) {
      this.highlightedTrips = []
    } else {
      // this.highlightedTrips = arcFilteredRows
    }
  }

  private async handleOrigDest(groupName: string, number: number) {
    const cacheKey = groupName + number

    this.hexStats = null
    this.multiSelectedHexagons = {}

    // const xytitle = this.aggregations[groupName][number]
    // const x = this.columnLookup.indexOf(xytitle.x)
    // const y = this.columnLookup.indexOf(xytitle.y)

    this.highlightedTrips = []
    this.activeAggregation = `${groupName}~${number}`

    // get element offsets in data array
    // const col = this.aggregations[item]
    // this.whichCoords = { x, y }

    // this.requests = this.rawRequests.map(r => [r[x], r[y]]).filter(z => z[0] && z[1])
    // this.requests = this.rawRequests
    this.requests = this.rowCache[cacheKey]
    this.colorRamp = this.colorRamps[number]
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
    // console.log('built it', this.myState.fileApi)
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
      this.vizDetails = Object.assign({}, this.config)
      return
    }

    const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

    if (hasYaml) {
      await this.loadYamlConfig()
    } else {
      this.loadOutputTripsConfig()
    }
  }

  private loadOutputTripsConfig() {
    let projection = 'EPSG:31468' // 'EPSG:25832', // 'EPSG:31468', // TODO: fix
    if (!this.myState.thumbnail) {
      projection = prompt('Enter projection: e.g. "EPSG:31468"') || 'EPSG:31468'
      if (!!parseInt(projection, 10)) projection = 'EPSG:' + projection
    }

    // output_trips:
    this.vizDetails = {
      title: 'Output Trips',
      description: this.myState.yamlConfig,
      file: this.myState.yamlConfig,
      projection,
      aggregations: {
        'Trip Summary': [
          { title: 'Origins', x: 'start_x', y: 'start_y' },
          { title: 'Destinations', x: 'end_x', y: 'end_y' },
        ],
      },
    }
    this.$emit('title', this.vizDetails.title)
    // this.solveProjection()
    return
  }

  private async loadYamlConfig() {
    if (!this.myState.fileApi) return
    try {
      // might be a project config:
      const filename =
        this.myState.yamlConfig.indexOf('/') > -1
          ? this.myState.yamlConfig
          : this.myState.subfolder + '/' + this.myState.yamlConfig

      const text = await this.myState.fileApi.getFileText(filename)
      this.vizDetails = YAML.parse(text)
    } catch (err) {
      const e = err as any
      console.log('failed')
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.needPassword && e.status === 401) {
        this.$store.commit('requestLogin', this.myState.fileSystem.slug)
      } else {
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `File not found`,
          desc: 'Could not find: ${this.myState.subfolder}/${this.myState.yamlConfig}',
        })
      }
    }
    const t = this.vizDetails.title ? this.vizDetails.title : 'Hex Aggregation'
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

  private get textColor() {
    const lightmode = {
      text: '#3498db',
      bg: '#eeeef480',
    }

    const darkmode = {
      text: 'white',
      bg: '#181518aa',
    }

    return this.$store.state.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private handleShowSelectionButton() {
    const arrays = Object.values(this.multiSelectedHexagons)
    let points: any[] = []
    arrays.map(a => (points = points.concat(a)))

    const pickedObject = { object: { points } }
    this.flipViewToShowInvertedData(pickedObject)
  }

  private hexStats: {
    rows: number
    numHexagons: number
    selectedHexagonIds: any[]
  } | null = null

  private selectedHexagonStatistics(): {
    rows: number
    numHexagons: number
    selectedHexagonIds: any[]
  } | null {
    const selectedHexes = Object.keys(this.multiSelectedHexagons).map(a => parseInt(a))
    if (!selectedHexes.length) return null

    const arrays = Object.values(this.multiSelectedHexagons)
    const ll = arrays.reduce((a: number, v: any) => a + v.length, 0)

    return { rows: ll, numHexagons: selectedHexes.length, selectedHexagonIds: selectedHexes }
  }

  private jumpToCenter() {
    // Only jump in camera is not yet set
    // if (!this.$store.state.viewState.initial) return

    let x = 0
    let y = 0

    try {
      const data = Object.values(this.rowCache)[0].raw

      let count = 0
      for (let i = 0; i < data.length; i += 1024) {
        const tx = data[i]
        const ty = data[i + 1]
        if (tx && ty) {
          count++
          x += tx
          y += ty
        }
      }
      x = x / count
      y = y / count
    } catch (e) {
      // that's ok
      console.warn(e)
    }

    // don't move for reasons
    if (!x || !y) return

    // jump!
    const currentView = this.$store.state.viewState
    const jumpView = {
      longitude: x,
      latitude: y,
      bearing: currentView.bearing,
      pitch: currentView.pitch,
      zoom: currentView.zoom,
    }

    this.$store.commit('setMapCamera', jumpView)
  }

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.myState.statusMessage = `${this.$i18n.t('loading')}`

    this.aggregations = this.vizDetails.aggregations

    // console.log('loading files')
    await this.loadFiles()

    // this.mapState.center = this.findCenter(this.rawRequests)

    this.buildThumbnail()

    this.isLoaded = true
    this.handleOrigDest(Object.keys(this.aggregations)[0], 0) // show first data
  }

  private beforeDestroy() {
    try {
      if (this.gzipWorker) {
        this.gzipWorker.terminate()
      }
    } catch (e) {
      console.warn(e)
    }

    this.$store.commit('setFullScreen', false)
  }

  private async parseCSVFile(filename: string) {
    if (!this.myState.fileSystem) return
    this.myState.statusMessage = 'Loading file...'

    // get the raw unzipped arraybuffer
    this.gzipWorker = new CSVParserWorker()

    this.gzipWorker.onmessage = async (buffer: MessageEvent) => {
      if (buffer.data.status) {
        this.myState.statusMessage = buffer.data.status
      } else if (buffer.data.error) {
        this.myState.statusMessage = buffer.data.error
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `Loading Error`,
          desc: 'Error loading: ${this.myState.subfolder}/${this.vizDetails.file}',
        })
      } else {
        const { rowCache, columnLookup } = buffer.data
        this.gzipWorker.terminate()
        this.dataIsLoaded({ rowCache, columnLookup })
      }
    }

    this.gzipWorker.postMessage({
      filepath: filename,
      fileSystem: this.myState.fileSystem,
      aggregations: this.vizDetails.aggregations,
      projection: this.vizDetails.projection,
    })
  }

  private dataIsLoaded({ rowCache, columnLookup }: any) {
    this.columnLookup = columnLookup
    this.rowCache = rowCache
    this.requests = rowCache[this.activeAggregation.replaceAll('~', '')]
    this.jumpToCenter()

    this.myState.statusMessage = ''
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
  kebabName: 'xy-hexagons',
  prettyName: 'XY Aggregator',
  description: 'Collects XY data into geographic hexagons',
  filePatterns: ['**/viz-xy*.y?(a)ml', '*output_trips.csv?(.gz)'],
  component: XyHexagons,
} as VisualizationPlugin)

export default XyHexagons
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
