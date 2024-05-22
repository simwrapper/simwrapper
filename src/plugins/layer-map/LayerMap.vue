<template lang="pug">
.layer-map(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  .status-bar(v-show="statusText") {{ statusText }}

  .my-map(v-if="!thumbnail" :id="`container-${viewId}`")

    all-layers(v-show="!needsInitialMapExtent"
      :viewId="viewId"
      :layers="mapLayers"
      :cbError="emitError"
    )

    layer-configurator.layer-configurator(
      :layers="mapLayers"
      @update="updateLayers"
    )

    zoom-buttons(v-if="isLoaded && !thumbnail")

    //- geojson-layer(v-if="!needsInitialMapExtent"
    //-   :viewId="viewId"
    //-   :fillColors="dataFillColors"
    //-   :lineColors="dataLineColors"
    //-   :lineWidths="dataLineWidths"
    //-   :fillHeights="dataFillHeights"
    //-   :screenshot="triggerScreenshot"
    //-   :featureFilter="boundaryFilters"
    //-   :opacity="sliderOpacity"
    //-   :pointRadii="dataPointRadii"
    //-   :cbTooltip="cbTooltip"
    //- )

    //- viz-configurator(v-if="isLoaded"
    //-   :embedded="isEmbedded"
    //-   :sections="configuratorSections"
    //-   :fileSystem="fileSystem"
    //-   :subfolder="subfolder"
    //-   :yamlConfig="generatedExportFilename"
    //-   :vizDetails="vizDetails"
    //-   :datasets="datasets"
    //-   :legendStore="legendStore"
    //-   :filterDefinitions="currentUIFilterDefinitions"
    //-   @update="changeConfiguration"
    //-   @screenshot="takeScreenshot"
    //- )

    //- .details-panel(v-if="tooltipHtml && !statusText" v-html="tooltipHtml")


  //- .config-bar(v-if="!thumbnail && !isEmbedded && isLoaded && Object.keys(filters).length"
  //-   :class="{'is-standalone': !configFromDashboard, 'is-disabled': !isLoaded}")

  //-   //- Filter pickers
  //-   .filter(v-for="filter in Object.keys(filters)")
  //-     p {{ filter }}
  //-     b-dropdown(
  //-       v-model="filters[filter].active"
  //-       :scrollable="filters[filter].active.length > 10"
  //-       max-height="250"
  //-       multiple
  //-       @change="handleUserSelectedNewFilters(filter)"
  //-       aria-role="list" :mobile-modal="false" :close-on-click="true"
  //-     )
  //-       template(#trigger="{ active }")
  //-         b-button.is-primary(
  //-           :type="filters[filter].active.length ? '' : 'is-outlined'"
  //-           :label="filterLabel(filter)"
  //-         )

  //-       b-dropdown-item(v-for="option in filters[filter].options"
  //-         :key="option" :value="option" aria-role="listitem") {{ option }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { group, zip, sum } from 'd3-array'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import avro from '@/js/avro'
import readBlob from 'read-blob'
import reproject from 'reproject'
import Sanitize from 'sanitize-filename'
import YAML from 'yaml'

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
} from '@/Globals'

import AllLayers from './AllLayers'
import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import LayerConfigurator from './LayerConfigurator.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import { arrayBufferToBase64 } from '@/js/util'
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
  name: 'ShapeFilePlugin',
  components: {
    AllLayers,
    BackgroundMapOnTop,
    LayerConfigurator,
    VizConfigurator,
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
      mapLayers: [] as any[],

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
      datasetJoinSelector: {} as { [id: string]: { title: string; columns: string[] } },
      showJoiner: false,

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
        showDifferences: false,
        shpFile: '',
        dbfFile: '',
        network: '',
        geojsonFile: '',
        projection: '',
        widthFactor: null as any,
        thumbnail: '',
        sum: false,
        filters: [] as { [filterId: string]: any }[],
        shapes: '' as string | { file: string; join: string },
        zoom: null as number | null,
        center: null as any[] | null,
        pitch: null as number | null,
        bearing: null as number | null,
        display: {
          fill: {} as any,
          fillHeight: {} as any,
          color: {} as any,
          width: {} as any,
          lineColor: {} as any,
          lineWidth: {} as any,
          radius: {} as any,
        },
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
        const tooltips = this.vizDetails.tooltip || []
        this.vizDetails.tooltip = [...tooltips]
      })
    },
  },

  methods: {
    emitError(msg: string) {
      this.$emit('error', msg)
    },

    updateLayers() {
      this.mapLayers = [...this.mapLayers]
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
          const ycfg = await this.loadYamlConfig()
          this.config = ycfg
          this.vizDetails = Object.assign({}, emptyState, ycfg)
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
        return YAML.parse(text)
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
          return YAML.parse(text)
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

    async loadDataset(datasetKey: string) {
      try {
        if (!datasetKey) return

        // dataset could be  { dataset: myfile.csv }
        //               or  { dataset: { file: myfile.csv, join: TAZ }}
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
      } catch (e) {
        const msg = '' + e
        console.error(msg)
        this.$emit('error', `Error loading ${datasetKey}: ${msg}`)
      }
      return []
    },

    clearData() {
      // these lines change the properties of these objects
      // WITHOUT reassigning them to new objects; this is
      // essential for the garbage-collection to work properly.
      // Otherwise we get a 500Mb memory leak on every view :-D
      // this.boundaries = []
      // this.centroids = []
      // this.boundaryDataTable = {}
      // this.boundaryFilters = new Float32Array(0)
      this.datasets = {}
      // this.dataFillColors = '#888'
      // this.dataLineColors = ''
      // this.dataLineWidths = 1
      // this.dataPointRadii = 5
      // this.dataFillHeights = 0
      // this.dataCalculatedValues = null
      // this.dataCalculatedValueLabel = ''
    },

    setMapCenter() {
      console.log(1)
      if (this.vizDetails.center && typeof this.vizDetails.center === 'string') {
        this.vizDetails.center = this.vizDetails.center
          //@ts-ignore
          .split(',')
          .map((coord: any) => parseFloat(coord))
        this.config.center = this.config.center.split(',').map((coord: any) => parseFloat(coord))
      }

      if (!this.vizDetails.center) this.vizDetails.center = [13.45, 52.5]
      console.log(2)

      if (this.needsInitialMapExtent && this.vizDetails.center) {
        console.log(3)
        this.$store.commit('setMapCamera', {
          center: this.vizDetails.center,
          zoom: this.vizDetails.zoom || 9,
          bearing: this.vizDetails.bearing || 0,
          pitch: this.vizDetails.pitch || 0,
          longitude: this.vizDetails.center ? this.vizDetails.center[0] : 0,
          latitude: this.vizDetails.center ? this.vizDetails.center[1] : 0,
          initial: true,
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
  },

  async mounted() {
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
}

.layer-map.hide-thumbnail {
  background: unset;
  z-index: 0;
}

.layer-configurator {
  width: 20rem;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  z-index: 2;
  margin: 0.75rem;
  height: 100%;
}

.my-map {
  display: flex;
  flex-direction: column;
  grid-row: 1 / 2;
  grid-column: 1 / 3;
  background-color: var(--bgBold);
  height: 100%;
}

.config-bar {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: row;
  margin: 0.5rem;
  padding: 0.25rem 0rem 0.5rem 0.5rem;
  background-color: var(--bgPanel);
  z-index: 9;
  opacity: 0.93;
  input.slider {
    margin: auto 0 0.5rem auto;
    width: 8rem;
  }

  .map-type-buttons {
    margin: auto 0 0 0.5rem;
  }

  .img-button {
    margin: 0 0rem -5px 0.5rem;
    height: 2.3rem;
    width: 2.3rem;
    border: var(--borderThin);
    border-radius: 4px;
  }
  .img-button:hover {
    border: 2px solid var(--linkHover);
  }
}

.config-bar.is-disabled {
  pointer-events: none;
  opacity: 0.5;
}

.filter {
  margin-right: 0.5rem;
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.filter p {
  margin: -0.25rem 0 0 0;
  font-weight: bold;
}

.title-panel {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 1rem 0.25rem 2rem;
  background-color: var(--bgPanel);
  filter: $filterShadow;
  z-index: 2;
}

.status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 200;
  background-color: var(--bgPanel2);
  padding: 1rem 1rem;
  font-size: 1.1rem;
  margin-bottom: 6px;
  border: 1px solid var(--);
}

.right {
  margin-left: auto;
}

.details-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  text-align: left;
  background-color: var(--bgPanel);
  display: flex;
  filter: $filterShadow;
  flex-direction: row;
  margin: 0.5rem;
  padding: 0.25rem 0.5rem;
  // width: 15rem;
  font-size: 0.8rem;
  color: var(--bold);
  opacity: 0.95;
  max-height: 75%;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: nowrap;
}

@media only screen and (max-width: 640px) {
}
</style>
