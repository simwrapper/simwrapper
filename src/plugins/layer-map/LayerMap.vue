<template lang="pug">
.layer-map(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  //- .status-bar(v-show="statusText") {{ statusText }}

  layer-configurator.layer-configurator(v-show="!isPanelReallyHidden"
    :class="{'is-hide-me': isPanelHidden}"
    :layers="mapLayers"
    :datasets="datasets"
    :theme="theme"
    @add="addNewLayer"
    @addData="showAddData=true"
    @update="updateLayers"
    @theme="updateTheme"
  )

  .my-map(v-if="!thumbnail" :id="`container-${viewId}`")

    p.btn-show-hide
      i.fas(
        :class="`fa-chevron-circle-${isPanelReallyHidden ? 'right': 'left'}`"
        @click="toggleHidePanel()"
      )

    all-layers(v-show="!needsInitialMapExtent"
      :viewId="viewId"
      :layers="mapLayers"
      :cbError="emitError"
    )

    background-map-on-top(v-if="theme.roads=='above'")

    zoom-buttons(v-if="isLoaded && !thumbnail")

    //- .details-panel(v-if="tooltipHtml && !statusText" v-html="tooltipHtml")

  add-data-modal(v-if="showAddData"
    @close="showAddData=false"
    @update="addDataset"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import Sanitize from 'sanitize-filename'
import YAML from 'js-yaml'

import globalStore from '@/store'
import {
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
  DataSet,
} from '@/Globals'

import AllLayers from './AllLayers'
import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import LayerConfigurator from './LayerConfigurator.vue'
import AddDataModal from './AddDataModal.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import UTIL from '@/js/util'
import { CircleRadiusDefinition } from '@/components/viz-configurator/CircleRadius.vue'
import { FillColorDefinition } from '@/components/viz-configurator/FillColors.vue'
import { LineColorDefinition } from '@/components/viz-configurator/LineColors.vue'
import { LineWidthDefinition } from '@/components/viz-configurator/LineWidths.vue'
import { FillHeightDefinition } from '@/components/viz-configurator/FillHeight.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import Coords from '@/js/Coords'
import LegendStore from '@/js/LegendStore'

import layerCatalog from './layers/layerCatalog'

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
  dataset?: any
}

export default defineComponent({
  name: 'LayerMap',
  components: {
    AddDataModal,
    AllLayers,
    BackgroundMapOnTop,
    LayerConfigurator,
    ZoomButtons,
    DrawingTool,
  },

  props: {
    configFromDashboard: { type: Object as any },
    datamanager: { type: Object as PropType<DashboardDataManager> },
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    thumbnail: Boolean,
    yamlConfig: String,
  },

  data() {
    return {
      isPanelHidden: false,
      isPanelReallyHidden: false,
      mapLayers: [] as any[],
      showAddData: false,
      theme: { bg: globalStore.state.isDarkMode ? 'dark' : 'light', roads: 'below', labels: 'on' },
      cbDatasetJoined: undefined as any,
      legendStore: new LegendStore(),
      globalStore,
      globalState: globalStore.state,
      viewId: Math.floor(1e12 * Math.random()),
      isEmbedded: false,
      isLoaded: false,
      statusText: 'Loading...',
      needsInitialMapExtent: true,
      triggerScreenshot: 0,
      datasets: {} as { [id: string]: DataTable },
      datasetKeyToFilename: {} as any,
      // datasetJoinSelector: {} as { [id: string]: { title: string; columns: string[] } },
      // showJoiner: false,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      config: {} as any,

      // these are the processed filter defs passed to the data manager
      filterDefinitions: [] as FilterDefinition[],

      resizer: null as null | ResizeObserver,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

      tooltipHtml: '',

      vizDetails: {
        title: '',
        description: '',
        datasets: {} as { [id: string]: { file: string; join: string } },
        useSlider: false,
        projection: '',
        thumbnail: '',
        filters: [] as { [filterId: string]: any }[],
        zoom: null as number | null,
        center: null as any[] | null,
        pitch: null as number | null,
        bearing: null as number | null,
        tooltip: [] as string[],
        layers: [] as any[],
      },
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

    datasetChoices(): string[] {
      return Object.keys(this.datasets)
    },

    generatedExportFilename(): string {
      let filename = Sanitize(this.yamlConfig ?? '')
      filename = filename.replaceAll(' ', '-')

      if (!filename.startsWith('viz-map-')) filename = 'viz-map-' + filename
      if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) filename = filename + '.yaml'

      return filename
    },

    urlThumbnail(): string {
      return this.thumbnailUrl
    },
  },

  watch: {
    'globalState.viewState'() {
      if (!REACT_VIEW_HANDLES[this.viewId]) return
      REACT_VIEW_HANDLES[this.viewId]()
    },

    'globalState.colorScheme'() {
      // change one element to force a deck.gl redraw
      this.$nextTick().then(p => {
        this.theme.bg = this.globalState.isDarkMode ? 'dark' : 'light'
        this.mapLayers = [...this.mapLayers]
      })
    },
  },

  methods: {
    async toggleHidePanel() {
      if (this.isPanelReallyHidden) {
        console.log('show')
        // show the panel
        this.isPanelReallyHidden = false
        setTimeout(() => {
          this.isPanelReallyHidden = false
          this.isPanelHidden = false
        }, 50)
      } else {
        // hide the panel
        this.isPanelHidden = true
        this.isPanelReallyHidden = false
        setTimeout(() => {
          this.isPanelReallyHidden = true
        }, 250)
      }
    },

    emitError(msg: string) {
      this.$emit('error', msg)
    },

    addNewLayer(layerType: string) {
      const Layer = layerCatalog[layerType]

      if (Layer) {
        console.log('NEW LAYER', layerType)

        const systemProps = {
          datasets: this.datasets,
          datamanager: this.myDataManager,
        }

        try {
          const mapLayer = new Layer(systemProps, { type: layerType })
          this.mapLayers.push(mapLayer)
          this.mapLayers = [...this.mapLayers]
        } catch (e) {
          console.error('' + e)
          this.$emit('error', e)
        }
      }
    },

    updateTheme(props: { bg?: string; roads?: string; labels?: string }) {
      if (props.bg) this.$store.commit('setTheme', props.bg)
      if (props.roads) this.theme.roads = props.roads
    },

    updateLayers(props: null | { command: string; layers?: any[]; index?: number }) {
      if (props?.command == 'reorder' && props.layers) {
        this.mapLayers = [...props.layers]
      }

      this.mapLayers = this.mapLayers.filter((l: any, i: number) => {
        if (!props) return true
        if ((props.command = 'delete')) return i !== props.index
        return true
      })
    },

    // incrementing screenshot count triggers the screenshot.
    takeScreenshot() {
      this.triggerScreenshot++
    },

    setEmbeddedMode() {
      if ('embed' in this.$route.query) {
        console.log('EMBEDDED MODE')
        this.isEmbedded = true
        this.$store.commit('setShowLeftBar', false)
        this.$store.commit('setFullWidth', true)
      }
    },

    setupLogoMover() {
      this.resizer = new ResizeObserver(this.moveLogo)
      const deckmap = document.getElementById(`container-${this.viewId}`) as HTMLElement
      this.resizer.observe(deckmap)
    },

    moveLogo() {
      const deckmap = document.getElementById(`container-${this.viewId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },

    columnsInDataset(datasetId: string) {
      const data = this.datasets[datasetId]
      return Object.keys(data)
    },

    // this will only round a number if it is a plain old regular number with
    // a fractional part to the right of the decimal point.
    truncateFractionalPart(value: any, precision: number) {
      if (typeof value !== 'number') return value

      let printValue = '' + value
      if (printValue.includes('.') && printValue.indexOf('.') === printValue.lastIndexOf('.')) {
        if (/\d$/.test(printValue))
          return printValue.substring(0, 1 + precision + printValue.lastIndexOf('.')) // precise(value, precision)
      }
      return value
    },

    cbTooltip(index: number, object: any) {
      this.tooltipHtml = ''
      return
    },

    honorQueryParameters() {
      const query = this.$route.query
      // if (query.show == 'dots') this.useCircles = true

      // this.setupQueryFilters()
    },

    convertCommasToArray(thing: any): any[] {
      if (thing === undefined) return []
      if (Array.isArray(thing)) return thing

      if (thing.indexOf(',') > -1) {
        thing = thing.split(',').map((f: any) => f.trim())
      } else {
        thing = [thing.trim()]
      }
      return thing
    },

    async getVizDetails() {
      const emptyState = {
        datasets: {} as any,
        display: { fill: {} as any },
      }

      // are we in a dashboard?
      if (this.configFromDashboard) {
        this.config = JSON.parse(JSON.stringify(this.configFromDashboard))
        this.vizDetails = Object.assign({}, emptyState, this.configFromDashboard)
      } else {
        // was a YAML file was passed in?
        const filename = (this.yamlConfig ?? '').toLocaleLowerCase()

        if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
          const yconfig = await this.loadYamlConfig()
          this.config = yconfig
          this.vizDetails = Object.assign({}, emptyState, yconfig)
        }

        // OR is this a bare geojson/shapefile file? - build vizDetails manually
        if (
          /(\.geojson)(|\.gz)$/.test(filename) ||
          /\.shp$/.test(filename) ||
          /network\.avro$/.test(filename)
        ) {
          const title = `${filename.endsWith('shp') ? 'Shapefile' : 'File'}: ${this.yamlConfig}`

          this.vizDetails = Object.assign({}, emptyState, this.vizDetails, {
            title,
            description: this.subfolder,
            shapes: this.yamlConfig,
          })

          this.config = JSON.parse(JSON.stringify(this.vizDetails))
        }
      }

      const t = this.vizDetails.title || 'Map'
      this.$emit('title', t)
    },

    async loadYamlConfig() {
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      // 1. First try loading the file directly
      try {
        const text = await this.fileApi.getFileText(filename)
        return YAML.load(text) as any
      } catch (err) {
        const message = '' + err
        if (message.startsWith('YAMLSemantic')) {
          this.$emit('error', `${filename}: ${message}`)
        }
        console.log(`${filename} not found, trying config folders`)
      }

      // 2. Try loading from a config folder instead
      const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
      if (vizes[config]) {
        try {
          const text = await this.fileApi.getFileText(vizes[config])
          return YAML.load(text) as any
        } catch (err) {
          console.error(`Also failed to load ${vizes[config]}`)
        }
      }
      this.$emit('error', 'Could not load YAML: ' + filename)
    },

    async handleNewDataset(props: DatasetDefinition) {
      const { key, dataTable, filename } = props
      const datasetId = key
      const datasetFilename = filename || datasetId

      console.log('HANDLE NEW DATSET:', datasetId, datasetFilename)

      this.myDataManager.setPreloadedDataset({
        key: this.datasetKeyToFilename[datasetId],
        dataTable,
      })

      // this.myDataManager.addFilterListener(
      //   { dataset: this.datasetKeyToFilename[datasetId] },
      //   this.processFiltersNow
      // )

      this.vizDetails.datasets[datasetId] = {
        file: datasetFilename,
      } as any

      this.vizDetails = Object.assign({}, this.vizDetails)
      this.datasets[datasetId] = dataTable
      this.datasets = Object.assign({}, this.datasets)
    },

    async handleMapClick(click: any) {
      try {
        const { x, y, data } = click.points[0]
        const filter = this.config.groupBy
        const value = x

        // this.datamanager.setFilter(this.config.dataset, filter, value)
      } catch (e) {
        console.error(e)
      }
    },

    async loadDatasets() {
      const keys = Object.keys(this.vizDetails.datasets)
      for (const key of keys) {
        // don't reload datasets we already loaded
        if (key in this.datasets) continue

        await this.loadDataset(key)
      }
    },

    addDataset(dataset: DatasetDefinition) {
      console.log('ADDING', dataset)
      this.myDataManager.setPreloadedDataset(dataset)
      this.showAddData = false
      this.datasets[dataset.key] = dataset.dataTable
      this.datasets = { ...this.datasets }
    },

    async loadDataset(datasetKey: string) {
      console.log('### LOAD', datasetKey)
      if (!datasetKey) return

      try {
        // dataset could be  { dataset: myfile.csv }
        //               or  { dataset: { file: myfile.csv, join: TAZ }}
        //               or  ['red','blue','green']
        //               or  { type: 'Float32Array', data: 'data:base64,Mzs23fshER3592'}

        const datasetConfig = this.config.datasets[datasetKey]

        console.log({ datasetConfig })

        // 1. dataset: filename.csv
        if ('string' === typeof datasetConfig) {
          return await this.loadDatasetFromFile(datasetKey)
        }

        // 2. dataset: { file: filename.csv, join: TAZ }
        if (datasetConfig.file) {
          return await this.loadDatasetFromFile(datasetKey)
        }

        // 3. dataset: ['red','green', 'blue']
        if (Array.isArray(datasetConfig)) {
          return await this.loadDatasetEmbedded(datasetKey)
        }

        // 4. dataset: { type: 'Float32Array', data: 'data:base64,Mzs23fshER3592'}
        // ... but it's hard to test for this because we don't know column names
        // ... so we just try it:
        return await this.loadDatasetEmbedded(datasetKey)

        // console.error('DONT KNOW WHAT TO DO WITH', datasetKey)
      } catch (e) {
        const msg = '' + e
        console.error(msg)
        this.$emit('error', `Error loading ${datasetKey}: ${msg}`)
      }
    },

    async loadDatasetFromFile(datasetKey: string) {
      const datasetFilename =
        'string' === typeof this.config.datasets[datasetKey]
          ? this.config.datasets[datasetKey]
          : this.config.datasets[datasetKey].file

      this.statusText = `Loading dataset ${datasetFilename} ...`

      await this.$nextTick()

      let loaderConfig = { dataset: datasetFilename }
      if ('string' !== typeof this.config.datasets[datasetKey]) {
        loaderConfig = Object.assign(loaderConfig, this.config.datasets[datasetKey])
      }

      // save the filename and key for later lookups
      this.datasetKeyToFilename[datasetKey] = datasetFilename

      const dataset = await this.myDataManager.getDataset(loaderConfig)

      // figure out join - use ".join" or first column key
      const joiner =
        'string' === typeof this.config.datasets[datasetKey]
          ? Object.keys(dataset.allRows)[0]
          : this.config.datasets[datasetKey].join

      const joinColumns = joiner?.split(':') || []

      // TODO if join is one column then really we should just ignore it but for now...
      if (joinColumns.length == 1) joinColumns.push(joinColumns[0])

      // save it!
      this.datasets[datasetKey] = dataset.allRows

      await this.$nextTick()

      // Set up filters -- there could be some in YAML already
      // this.activateFiltersForDataset(datasetKey)
    },

    async loadDatasetEmbedded(datasetKey: string) {
      const datasetConfig = this.config.datasets[datasetKey]

      const dataset = {} as DataTable

      for (const columnName of Object.keys(datasetConfig)) {
        let myArray
        let dataColumn = { name: columnName } as DataTableColumn

        const column = datasetConfig[columnName]

        // plain javascript array
        if (Array.isArray(column)) {
          myArray = column
          dataColumn.type = DataType.STRING
        }

        // convert data if needed
        if (column.data) {
          const rawData = await UTIL.dataUrlToBytes(column.data)
          if (column.type == 'Float32Array') {
            dataColumn.type = DataType.NUMBER
            myArray = new Float32Array(rawData.buffer)
          }
          if (column.type == 'Float64Array') {
            dataColumn.type = DataType.NUMBER
            myArray = new Float64Array(rawData.buffer)
          }
        }

        // none of the above worked?
        if (!myArray) {
          this.$emit('error', `Unable to parse ${datasetKey} ${columnName}`)
          continue
        }

        // ok we have the array now!
        dataColumn.values = myArray
        dataset[columnName] = dataColumn

        // save memory: delete the embedded data
        delete this.config.datasets[datasetKey]
      }

      // all done
      this.myDataManager.setPreloadedDataset({ key: datasetKey, dataTable: dataset })
      this.datasets[datasetKey] = dataset
    },

    clearData() {
      this.datasets = {}
    },

    setStartingMap() {
      this.$store.commit('setMapCamera', {
        zoom: this.vizDetails.zoom || 4,
        bearing: this.vizDetails.bearing || 0,
        pitch: this.vizDetails.pitch || 0,
        longitude: 15,
        latitude: 45,
        initial: true,
      })
      this.needsInitialMapExtent = false
    },

    setMapCenter() {
      if (this.vizDetails.center && typeof this.vizDetails.center === 'string') {
        this.vizDetails.center = this.vizDetails.center
          //@ts-ignore
          .split(',')
          .map((coord: any) => parseFloat(coord))
        this.config.center = this.config.center.split(',').map((coord: any) => parseFloat(coord))
      }

      if (!this.vizDetails.center) this.vizDetails.center = [13.45, 52.5]

      if (this.needsInitialMapExtent && this.vizDetails.center) {
        this.$store.commit('setMapCamera', {
          center: this.vizDetails.center,
          zoom: this.vizDetails.zoom || 9,
          bearing: this.vizDetails.bearing || 0,
          pitch: this.vizDetails.pitch || 0,
          longitude: this.vizDetails.center ? this.vizDetails.center[0] : 0,
          latitude: this.vizDetails.center ? this.vizDetails.center[1] : 0,
          initial: false,
        })
        this.needsInitialMapExtent = false
      }
    },

    initializeLayers() {
      console.log('INIT LAYERS')

      for (const layerProps of this.vizDetails.layers) {
        this.setupLayer(layerProps)
      }
    },

    setupLayer(layerProps: { type: string; title: string; description: string }) {
      const Layer = layerCatalog[layerProps.type]

      if (Layer) {
        console.log('INIT', layerProps.type)

        const systemProps = {
          datasets: this.datasets,
          datamanager: this.myDataManager,
        }

        try {
          const mapLayer = new Layer(systemProps, layerProps)
          this.mapLayers.push(mapLayer)
        } catch (e) {
          this.$emit('error', e)
        }
      }
    },

    async loadConfig() {
      try {
        this.clearData()

        await this.getVizDetails()

        if (this.thumbnail) return

        // -----------------------------

        this.setEmbeddedMode()
        this.setupLogoMover()

        await this.loadDatasets()

        console.log('DATA LOADED', this.datasets)

        this.isLoaded = true
        this.$emit('isLoaded')

        // set map-wide globals
        this.datasets = Object.assign({}, this.datasets)
        this.config.datasets = JSON.parse(JSON.stringify(this.datasets))
        this.vizDetails = Object.assign({}, this.vizDetails)

        this.honorQueryParameters()
        this.setMapCenter()
        this.initializeLayers()

        // console.log(5, this.needsInitialMapExtent)

        this.statusText = ''
      } catch (e) {
        this.statusText = ''
        this.$emit('error', '' + e)
        this.$emit('isLoaded')
      }
    },
  },

  async mounted() {
    // we have a filepath --------

    if (this.root || this.configFromDashboard) {
      this.loadConfig()
      return
    }

    // we are starting with a blank map --------

    this.clearData()
    this.setEmbeddedMode()
    this.setupLogoMover()

    // this.honorQueryParameters()
    this.setMapCenter()

    this.$emit('isLoaded')
    this.isLoaded = true
    this.statusText = ''

    setTimeout(() => {
      this.showAddData = true
    }, 500)
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.viewId]

    if (REACT_VIEW_HANDLES[1000 + this.viewId]) {
      REACT_VIEW_HANDLES[1000 + this.viewId]([])
      delete REACT_VIEW_HANDLES[1000 + this.viewId]
    }

    this.clearData()
    this.legendStore.clear()
    this.resizer?.disconnect()

    // this.myDataManager.removeFilterListener(this.config, this.processFiltersNow)
    // this.myDataManager.clearCache()
    this.$store.commit('setFullScreen', false)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layer-map {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-rows: 1fr;
  grid-template-columns: auto 1fr;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  z-index: -1;
  height: 100%;
  max-height: 100%;
}

.layer-map.hide-thumbnail {
  background: unset;
  z-index: 0;
}

.layer-configurator {
  width: 20rem;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  transition: transform 0.25s ease-in;
  opacity: 0.95;
  transform: translateX(0rem);
}

.layer-configurator.is-hide-me {
  transform: translateX(-22rem);
}

.my-map {
  position: relative;
  display: flex;
  flex-direction: column;
  grid-row: 1 / 2;
  grid-column: 1 / 3;
  background-color: var(--bgBold);
}

.right {
  margin-left: auto;
}

.btn-show-hide {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  z-index: 50;
  border: none;
  font-size: 24px;
  line-height: 24px;
  color: #37d3b1;
  padding: 2px;
  border-radius: 8px;
  background-color: var(--iconShowHide);
}

.btn-show-hide:hover {
  cursor: pointer;
  color: #379ec1;
}
</style>
