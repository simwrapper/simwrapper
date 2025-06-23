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

        .panel-item(v-for="group in Object.keys(aggregations)" :key="group")
          p.ui-label {{ group }}
          button.button.is-small.aggregation-button(
            v-for="element,i in aggregations[group]"
            :key="i"
            :style="{'margin-bottom': '0.25rem', 'color': activeAggregation===`${group}~${i}` ? 'white' : buttonColors[i], 'border': `1px solid ${buttonColors[i]}`, 'border-right': `0.4rem solid ${buttonColors[i]}`,'border-radius': '4px', 'background-color': activeAggregation===`${group}~${i}` ? buttonColors[i] : $store.state.isDarkMode ? '#333':'white'}"
            @click="handleOrigDest(group,i)") {{ element.title }}

        .panel-item
          p.ui-label {{ $t('maxHeight') }}: {{ vizDetails.maxHeight }}
          b-slider.ui-slider(v-model="vizDetails.maxHeight"
            size="is-small"
            :min="0" :max="250" :step="5"
            :duration="0" :dotSize="12"
            :tooltip="false"
          )

          p.ui-label Hex Radius: {{ vizDetails.radius }}
          b-slider.ui-slider(v-model="vizDetails.radius"
            size="is-small"
            :min="50" :max="1000" :step="5"
            :duration="0" :dotSize="12"
            :tooltip="false"
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
import type { PropType } from 'vue'

import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'
import { REACT_VIEW_HANDLES } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'

import CSVParserWorker from './CsvGzipParser.worker.ts?worker'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import XyHexDeckMap from './XyHexLayer'
import NewXmlFetcher from '@/workers/NewXmlFetcher.worker?worker'

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
  aggregations: Aggregations
  radius: number
  maxHeight: number
  center: any
  zoom: number
  mapIsIndependent?: boolean
}

const MyComponent = defineComponent({
  name: 'XyHexagonsPlugin',
  i18n,
  components: {
    CollapsiblePanel,
    DrawingTool,
    XyHexDeckMap,
    ToggleButton,
    ZoomButtons,
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
      id: `id-${Math.floor(1e12 * Math.random())}` as any,

      resolvers: {} as { [id: number]: any },
      resolverId: 0,
      _xmlConfigFetcher: {} as any,

      standaloneYAMLconfig: {
        title: '',
        description: '',
        file: '',
        projection: '',
        thumbnail: '',
        aggregations: {},
        radius: 250,
        maxHeight: 0,
        center: null as any,
        zoom: 9,
        mapIsIndependent: false,
      },
      YAMLrequirementsXY: { file: '', aggregations: {} },
      colorRamps,
      buttonColors: ['#5E8AAE', '#BF7230', '#269367', '#9C439C'],
      aggregations: {} as Aggregations,
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
        aggregations: {},
        radius: 250,
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
      const [group, offset] = this.activeAggregation.split('~') as any[]
      return this.aggregations[group][offset].title
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
        data: this.requests,
        extrude: this.extrudeTowers,
        highlights: this.highlightedTrips,
        mapIsIndependent: this.vizDetails.mapIsIndependent,
        maxHeight: this.vizDetails.maxHeight,
        metric: this.buttonLabel,
        radius: this.vizDetails.radius,
        selectedHexStats: this.hexStats,
        upperPercentile: 100,
        onClick: this.handleClick,
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
      console.log({ target, event })
      if (!target.layer) this.handleEmptyClick()
      else this.handleHexClick(target, event)
    },

    handleEmptyClick() {
      this.flipViewToShowInvertedData({})
    },

    handleHexClick(pickedObject: any, event: any) {
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
    },

    flipViewToShowInvertedData(pickedObject: any) {
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
    },

    async handleOrigDest(groupName: string, number: number) {
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
    },

    async getVizDetails() {
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
        await this.loadOutputTripsConfig()
      }
    },

    fetchXML(props: { worker: any; slug: string; filePath: string; options?: any }) {
      let xmlWorker = props.worker

      xmlWorker.onmessage = (message: MessageEvent) => {
        // message.data will have .id and either .error or .xml
        const { resolve, reject } = this.resolvers[message.data.id]
        xmlWorker.terminate()
        if (message.data.error) reject(message.data.error)
        resolve(message.data.xml)
      }
      // save the promise by id so we can look it up when we get messages
      const id = this.resolverId++
      xmlWorker.postMessage({
        id,
        fileSystem: this.fileSystem,
        filePath: props.filePath,
        options: props.options,
      })

      const promise = new Promise((resolve, reject) => {
        this.resolvers[id] = { resolve, reject }
      })
      return promise
    },

    async figureOutProjection() {
      const { files } = await this.fileApi.getDirectory(this.myState.subfolder)
      const outputConfigs = files.filter(
        f => f.indexOf('.output_config.xml') > -1 || f.indexOf('.output_config_reduced.xml') > -1
      )
      if (outputConfigs.length && this.fileSystem) {
        for (const xmlConfigFileName of outputConfigs) {
          try {
            const configXML: any = await this.fetchXML({
              worker: this._xmlConfigFetcher,
              slug: this.fileSystem.slug,
              filePath: this.myState.subfolder + '/' + xmlConfigFileName,
            })
            const global = configXML.config.module.filter((f: any) => f.$name === 'global')[0]
            const crs = global.param.filter((p: any) => p.$name === 'coordinateSystem')[0]
            const crsValue = crs.$value
            return crsValue
          } catch (e) {
            console.warn('Failed parsing', xmlConfigFileName)
          }
        }
      }
    },

    async loadOutputTripsConfig() {
      let projection = await this.figureOutProjection()
      if (!this.myState.thumbnail && !projection) {
        projection = prompt('Enter projection: e.g. "EPSG:31468"') || 'EPSG:31468'
        if (!!parseInt(projection, 10)) projection = 'EPSG:' + projection
      }

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
        radius: this.vizDetails.radius,
        maxHeight: this.vizDetails.maxHeight,
        center: this.vizDetails.center,
        zoom: this.vizDetails.zoom,
      }
      this.$emit('title', this.vizDetails.title)
      return
    },

    setRadiusAndHeight() {
      if (!this.vizDetails.radius) {
        Vue.set(this.vizDetails, 'radius', 250)
      }

      if (!this.vizDetails.maxHeight) {
        Vue.set(this.vizDetails, 'maxHeight', 0)
      }
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
        console.error('failed', '' + err)
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
        if (!(key in configuration)) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `XYHexagon: ${this.yamlConfig}: missing required key: ${key}`,
            desc: `XYHexagon requires ${Object.keys(this.YAMLrequirementsXY)}`,
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
      const arrays = Object.values(this.multiSelectedHexagons)
      let points: any[] = []
      arrays.map(a => (points = points.concat(a)))

      const pickedObject = { object: { points } }
      this.flipViewToShowInvertedData(pickedObject)
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
      const data = Object.values(this.rowCache)[0].raw

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

      // user didn't give us the center, so calculate it
      if (!data.length) return

      let samples = 0
      let longitude = 0
      let latitude = 0

      const numLinks = data.length / 2

      const gap = 512
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

    async parseCSVFile(filename: string) {
      this.myState.statusMessage = 'Loading file...'

      // get the raw unzipped arraybuffer
      this.gzipWorker = new CSVParserWorker()

      this.gzipWorker.onmessage = async (buffer: MessageEvent) => {
        if (buffer.data.status) {
          this.myState.statusMessage = buffer.data.status
        } else if (buffer.data.error) {
          this.myState.statusMessage = buffer.data.error
          this.$emit('error', {
            type: Status.ERROR,
            msg: `Loading Error`,
            desc: 'Error loading: ${this.myState.subfolder}/${this.vizDetails.file}',
          })
        } else {
          const { rowCache, columnLookup } = buffer.data
          if (this.gzipWorker) this.gzipWorker.terminate()
          this.dataIsLoaded({ rowCache, columnLookup })
        }
      }

      this.gzipWorker.postMessage({
        filepath: filename,
        fileSystem: this.fileSystem,
        aggregations: this.vizDetails.aggregations,
        projection: this.vizDetails.projection,
      })
    },

    dataIsLoaded({ rowCache, columnLookup }: any) {
      this.columnLookup = columnLookup
      this.rowCache = rowCache

      const agg = this.activeAggregation.replaceAll('~', '')
      this.requests = this.rowCache[agg]

      this.setMapCenter()
      this.moveLogo()
      this.myState.statusMessage = ''
    },

    async loadFiles() {
      let dataArray: any = []
      if (!this.fileApi) return { dataArray }

      try {
        let filename = `${this.myState.subfolder}/${this.vizDetails.file}`
        await this.parseCSVFile(filename)
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
  },
  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig || ''
    this.myState.subfolder = this.subfolder

    this._xmlConfigFetcher = new NewXmlFetcher()

    await this.getVizDetails()

    if (this.thumbnail) return

    this.setupLogoMover()

    this.myState.statusMessage = `${this.$i18n.t('loading')}`
    this.aggregations = this.vizDetails.aggregations

    // console.log('loading files')
    await this.loadFiles()

    // this.mapState.center = this.findCenter(this.rawRequests)

    this.buildThumbnail()

    this.isLoaded = true
    this.handleOrigDest(Object.keys(this.aggregations)[0], 0) // show first data
  },

  beforeDestroy() {
    if (this._xmlConfigFetcher) this._xmlConfigFetcher.terminate()

    this.resizer?.disconnect()
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
