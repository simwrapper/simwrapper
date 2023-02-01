<template lang="pug">
.map-layout(:class="{'hide-thumbnail': !thumbnail}"
            :style='{"background": urlThumbnail}'
            oncontextmenu="return false")

  .status-bar(v-show="statusText") {{ statusText }}

  modal-join-column-picker(v-if="showJoiner"
    v-bind="datasetJoinSelector"
    @join="cbDatasetJoined"
  )

  .area-map(v-if="!thumbnail" :id="`container-${layerId}`")
    //- drawing-tool.draw-tool(v-if="isLoaded && !thumbnail")

    geojson-layer(v-if="!needsInitialMapExtent"
      :viewId="layerId"
      :fillColors="dataFillColors"
      :featureDataTable="boundaryDataTable"
      :lineColors="dataLineColors"
      :lineWidths="dataLineWidths"
      :fillHeights="dataFillHeights"
      :screenshot="triggerScreenshot"
      :calculatedValues="dataCalculatedValues"
      :calculatedValueLabel="dataCalculatedValueLabel"
      :featureFilter="boundaryFilters"
      :opacity="sliderOpacity"
      :pointRadii="dataPointRadii"
      :tooltip="vizDetails.tooltip"
    )
    //- :features="useCircles ? centroids: boundaries"

    viz-configurator(v-if="isLoaded"
      :embedded="isEmbedded"
      :sections="configuratorSections"
      :fileSystem="fileSystem"
      :subfolder="subfolder"
      :yamlConfig="generatedExportFilename"
      :vizDetails="vizDetails"
      :datasets="datasets"
      :legendStore="legendStore"
      :filterDefinitions="currentUIFilterDefinitions"
      @update="changeConfiguration"
      @screenshot="takeScreenshot"
    )

  zoom-buttons(v-if="isLoaded && !thumbnail")

  .config-bar(v-if="!thumbnail && !isEmbedded"
    :class="{'is-standalone': !configFromDashboard, 'is-disabled': !isLoaded}")

    //- //- Column picker
    //- .filter(:disabled="!datasetValuesColumnOptions.length")
    //-   p Display
    //-   b-dropdown(v-model="datasetValuesColumn"
    //-     aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
    //-     :scrollable="datasetValuesColumnOptions.length > 10"
    //-     max-height="250"
    //-     @change="handleUserSelectedNewMetric"
    //-   )
    //-     template(#trigger="{ active }")
    //-       b-button.is-warning(:label="datasetValuesColumn" :icon-right="active ? 'menu-up' : 'menu-down'")

    //-     b-dropdown-item(v-for="option in datasetValuesColumnOptions"
    //-       :key="option" :value="option" aria-role="listitem") {{ option }}

    //- Filter pickers
    .filter(v-for="filter in Object.keys(filters)")
      p {{ filter }}
      b-dropdown(
        v-model="filters[filter].active"
        :scrollable="filters[filter].active.length > 10"
        max-height="250"
        multiple
        @change="handleUserSelectedNewFilters(filter)"
        aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
      )
        template(#trigger="{ active }")
          b-button.is-primary(
            :type="filters[filter].active.length ? '' : 'is-outlined'"
            :label="filterLabel(filter)"
            :icon-right="active ? 'menu-up' : 'menu-down'"
          )

        b-dropdown-item(v-for="option in filters[filter].options"
          :key="option" :value="option" aria-role="listitem") {{ option }}

    //- //- Filter ADDers
    //- .filter(v-if="availableFilterColumns.length")
    //-   p {{ Object.keys(filters).length ? "&nbsp;" : "Filter" }}
    //-   b-dropdown(v-model="chosenNewFilterColumn"
    //-     @change="handleUserCreatedNewFilter"
    //-     :scrollable="availableFilterColumns.length > 10"
    //-     max-height="250"
    //-     aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
    //-   )
    //-     template(#trigger="{ active }")
    //-       b-button.is-primary.is-outlined(
    //-         label="+"
    //-       )

    //-     b-dropdown-item(v-for="option in availableFilterColumns"
    //-       :key="option" :value="option" aria-role="listitem"
    //-     ) {{ option }}

    .filter.right
      p Transparency
      b-slider.slider.is-small.is-fullwidth.is-warning(
        id="sliderOpacity" :min="0" :max="100" v-model="sliderOpacity" :tooltip="false" :step="2.5" type="range")

    .map-type-buttons(v-if="isAreaMode")
      img.img-button(@click="showCircles(false)" src="../../assets/btn-polygons.jpg" title="Shapes")
      img.img-button(@click="showCircles(true)" src="../../assets/btn-circles.jpg" title="Circles")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { group, zip, sum } from 'd3-array'

import EPSGdefinitions from 'epsg'
import readBlob from 'read-blob'
import reproject from 'reproject'
import Sanitize from 'sanitize-filename'
import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
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
} from '@/Globals'

import GeojsonLayer from './GeojsonLayer'
// import GeojsonLayer from './GeojsonVueLayer.vue'

import ColorWidthSymbologizer from '@/js/ColorWidthSymbologizer'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ModalJoinColumnPicker from './ModalJoinColumnPicker.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'

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

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
}

const MyComponent = defineComponent({
  name: 'ShapeFilePlugin',
  components: {
    GeojsonLayer,
    ModalJoinColumnPicker,
    VizConfigurator,
    ZoomButtons,
    DrawingTool,
  },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager> },
    configFromDashboard: { type: Object as any },
    yamlConfig: String,
    thumbnail: Boolean,
    // fsConfig: { type: Object as PropType<FileSystemConfig> },
  },

  data() {
    return {
      boundaries: [] as any[],
      centroids: [] as any[],
      cbDatasetJoined: undefined as any,
      legendStore: new LegendStore(),
      chosenNewFilterColumn: '',
      availableFilterColumns: [] as string[],
      boundaryDataTable: {} as DataTable,

      dataFillColors: '#888' as string | Uint8Array,
      dataLineColors: '' as string | Uint8Array,
      dataLineWidths: 1 as number | Float32Array,
      dataPointRadii: 5 as number | Float32Array,
      dataFillHeights: 0 as number | Float32Array,
      dataCalculatedValues: null as Float32Array | null,
      dataCalculatedValueLabel: '',

      globalState: globalStore.state,
      layerId: Math.floor(1e12 * Math.random()),

      activeColumn: '',
      useCircles: false,
      sliderOpacity: 80,

      maxValue: 1000,
      expColors: false,
      isLoaded: false,
      isAreaMode: true,
      statusText: 'Loading...',

      // Filters. Key is column id; value array is empty for "all" or a list of "or" values
      filters: {} as { [column: string]: FilterDetails },

      fixedColors: ['#4e79a7'],

      needsInitialMapExtent: true,
      datasetJoinColumn: '',
      datasetFilename: '',
      triggerScreenshot: 0,

      datasetJoinSelector: {} as { [id: string]: { title: string; columns: string[] } },
      showJoiner: false,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      config: {} as any,
      // these are the filters defined in the UI
      currentUIFilterDefinitions: {} as any,
      // these are the processed filter defs passed to the data manager
      filterDefinitions: [] as FilterDefinition[],

      isEmbedded: false,
      resizer: null as null | ResizeObserver,
      boundaryFilters: new Float32Array(0),
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      boundaryJoinLookups: {} as { [column: string]: { [lookup: string | number]: number } },
      datasetKeyToFilename: {} as any,
      datasetValuesColumn: '',
      datasetValuesColumnOptions: [] as string[],

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
      },

      datasets: {} as { [id: string]: DataTable },
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem)
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

    configuratorSections(): string[] {
      if (this.isAreaMode)
        return ['fill-color', 'fill-height', 'line-color', 'line-width', 'circle-radius', 'filters']
      else return ['line-color', 'line-width', 'filters']
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
      if (!REACT_VIEW_HANDLES[this.layerId]) return
      REACT_VIEW_HANDLES[this.layerId]()
    },
  },

  methods: {
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
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      this.resizer.observe(deckmap)
    },

    moveLogo() {
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },

    filterShapesNow() {
      // shape filters only
      const shapeFilters = this.filterDefinitions.filter(f => f.dataset === 'shapes')

      this.boundaryFilters = new Float32Array(this.boundaries.length)

      // show all elements if there are no shapefilters defined
      if (!shapeFilters.length) return

      const isLTGT = /^(<|>)/ // starts with < or >

      for (const filter of shapeFilters) {
        console.log('filter >>>:', filter)
        let spec = filter.value
        let conditional = ''

        // prep LT/GT
        if (isLTGT.test(spec)) {
          if (spec.startsWith('<=')) {
            conditional = '<='
            spec = parseFloat(spec.substring(2).trim())
          } else if (spec.startsWith('>=')) {
            conditional = '>='
            spec = parseFloat(spec.substring(2).trim())
          } else if (spec.startsWith('<')) {
            conditional = '<'
            spec = parseFloat(spec.substring(1).trim())
          } else if (spec.startsWith('>')) {
            conditional = '>'
            spec = parseFloat(spec.substring(1).trim())
          }
        } else {
          // handle case where we are testing equal/inequal and its a "numeric" string
          if (typeof spec === 'string') {
            // handle a comma-separated list
            if (spec.indexOf(',') > -1) {
              spec = spec
                .split(',')
                .map(v => v.trim())
                .map(v => (isNaN(parseFloat(v)) ? v : parseFloat(v)))
            } else {
              const numericString = parseFloat(spec)
              if (!Number.isNaN(numericString)) spec = numericString
            }
          }
        }

        if (!Array.isArray(spec)) spec = [spec]

        const fullSpecification = { conditional, invert: filter.invert || false, values: spec }
        console.log('HEREWEGO: ', fullSpecification)
        const dataColumnValues = this.boundaryDataTable[filter.column].values

        // update every row
        for (let i = 0; i < this.boundaries.length; i++) {
          if (!checkFilterValue(fullSpecification, dataColumnValues[i])) {
            this.boundaryFilters[i] = -1
          }
        }
      }
    },

    filterShapesNowOriginal() {
      // shape filters only
      const shapeFilters = this.filterDefinitions.filter(f => f.dataset === 'shapes')

      this.boundaryFilters = new Float32Array(this.boundaries.length)

      // show all elements if there are no shapefilters defined
      if (!shapeFilters.length) return

      // console.log({ shapeFilters, length: this.boundaries.length })

      // loop on all boundaries and centroids
      for (let i = 0; i < this.boundaries.length; i++) {
        for (const filter of shapeFilters) {
          const hideElement = !this.checkIsFiltered(i, filter)
          if (hideElement) this.boundaryFilters[i] = -1
        }
      }
    },

    checkIsFiltered(i: number, filter: FilterDefinition) {
      const dataset =
        filter.dataset == 'shapes' ? this.boundaryDataTable : this.datasets[filter.dataset]
      const actualValue = dataset[filter.column].values[i]

      let includeElement = false

      let filterValue = filter.value
      if (typeof filterValue == 'string' && filterValue.indexOf(',') > -1) {
        filterValue = filterValue
          .split(',')
          .map(v => v.trim())
          .map(v => (isNaN(parseFloat(v)) ? v : parseFloat(v)))
      }

      if (Array.isArray(filterValue)) {
        // 1. filter is an array of categories
        includeElement = filterValue.indexOf(actualValue) > -1
      } else {
        // 2. filter is a string: exact value or CSV
        includeElement = filterValue == actualValue
      }

      // Invert if inverted
      if (filter.invert) includeElement = !includeElement

      return includeElement
    },

    parseFilterDefinitions(filterDefs: any) {
      // no filters? go away
      if (!filterDefs) return []

      const filters = [] as FilterDefinition[]

      // User may have specified an array or an object:
      let filterSpecs: any[]
      if (Array.isArray(filterDefs)) {
        filterSpecs = filterDefs.map(f => Object.entries(f)[0])
      } else {
        filterSpecs = Object.entries(filterDefs)
      }

      for (const filter of filterSpecs) {
        const [id, value] = filter
        const [dataset, column] = id.split('.')
        filters.push({
          dataset,
          value,
          column: column.endsWith('!') ? column.substring(0, column.length - 1) : column,
          invert: column.endsWith('!'),
        })
      }

      return filters
    },

    honorQueryParameters() {
      const query = this.$route.query
      if (query.show == 'dots') this.useCircles = true
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
        this.config = Object.assign({}, this.configFromDashboard)
        this.vizDetails = Object.assign({}, emptyState, this.configFromDashboard)
      } else {
        // was a YAML file was passed in?
        const filename = this.yamlConfig ?? ''

        if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
          const ycfg = await this.loadYamlConfig()
          this.config = Object.assign({}, ycfg)
          this.vizDetails = Object.assign({}, emptyState, ycfg)
        }

        // is this a bare geojson/shapefile file? - build vizDetails manually
        if (/(\.geojson)(|\.gz)$/.test(filename) || /\.shp$/.test(filename)) {
          const title = `${filename.endsWith('shp') ? 'Shapefile' : 'GeoJSON'}: ${filename}`

          this.vizDetails = Object.assign({}, emptyState, this.vizDetails, {
            title,
            description: this.subfolder,
            shapes: filename,
          })

          this.config = Object.assign({}, this.vizDetails)
        }
      }

      const t = this.vizDetails.title || 'Map'
      this.$emit('title', t)
    },

    async buildThumbnail() {
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await readBlob.arraybuffer(blob)
          const base64 = arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
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
          this.$store.commit('error', `${filename}: ${message}`)
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
      this.$store.commit('error', 'Could not load YAML: ' + filename)
    },

    /**
     * changeConfiguration: is the main entry point for changing the viz model.
     * anything that wants to change colors, widths, data, anthing like that
     * should all pass through this function so the underlying data model
     * is modified properly.
     */
    changeConfiguration(props: {
      fill?: FillColorDefinition
      dataset?: DatasetDefinition
      lineColor?: LineColorDefinition
      lineWidth?: LineWidthDefinition
      radius?: CircleRadiusDefinition
      fillHeight?: FillHeightDefinition
      filters?: FilterDefinition
    }) {
      // console.log('props', props)

      try {
        if (props['fill']) {
          this.vizDetails.display.fill = props.fill
          this.handleNewFillColor(props.fill)
        }

        if (props['fillHeight']) {
          this.vizDetails.display.fillHeight = props.fillHeight
          this.handleNewFillHeight(props.fillHeight)
        }

        if (props['lineColor']) {
          this.vizDetails.display.lineColor = props.lineColor
          this.handleNewLineColor(props.lineColor)
        }

        if (props['lineWidth']) {
          this.vizDetails.display.lineWidth = props.lineWidth
          this.handleNewLineWidth(props.lineWidth)
        }

        if (props['radius']) {
          this.vizDetails.display.radius = props.radius
          this.handleNewRadius(props.radius)
        }

        if (props['dataset']) {
          // vizdetails just had the string name, whereas props.dataset contains
          // a fully-build DatasetDefinition, so let's just handle that
          this.handleNewDataset(props.dataset)
        }

        if (props['filters']) {
          this.handleNewFilters(props.filters)
        }

        // console.log('DONE updating')
      } catch (e) {
        this.$store.commit('error', '' + e)
      }
    },

    async handleNewDataset(props: DatasetDefinition) {
      const { key, dataTable, filename } = props

      const datasetId = key
      this.datasetFilename = filename || datasetId

      // ask user for the join columns
      const join: any[] = await new Promise((resolve, reject) => {
        const boundaryProperties = new Set()
        // Some geojsons have an 'id' separate from their property table
        if (this.boundaries[0].id) boundaryProperties.add('id')
        // Features are always first dataset:
        const featureDataset = this.datasets[Object.keys(this.vizDetails.datasets)[0]]
        // Add list of boundary properties from feature dataset
        Object.keys(featureDataset).forEach(key => boundaryProperties.add(key))

        this.datasetJoinSelector = {
          data1: { title: datasetId, columns: Object.keys(dataTable) },
          data2: { title: 'Features', columns: Array.from(boundaryProperties) as string[] },
        }
        this.showJoiner = true

        this.cbDatasetJoined = (join: string[]) => {
          this.datasetJoinSelector = {}
          this.showJoiner = false
          resolve(join)
        }
      })

      if (!join.length) return

      const [dataJoinColumn, featureJoinColumn] = join
      this.setupJoin(dataTable, datasetId, dataJoinColumn, featureJoinColumn)

      this.figureOutRemainingFilteringOptions()
    },

    /**
     *
     */
    setupJoin(
      dataTable: DataTable,
      datasetId: string,
      dataJoinColumn: string,
      featureJoinColumn: string
    ) {
      // console.log('> setupJoin', datasetId)

      // make sure columns exist!
      if (!this.boundaryDataTable[featureJoinColumn])
        throw Error(`Geodata does not have property ${featureJoinColumn}`)
      if (!dataTable[dataJoinColumn])
        throw Error(`Dataset ${datasetId} does not have column ${dataJoinColumn}`)

      // create lookup column and write lookup offsets
      const lookupColumn: DataTableColumn = { type: DataType.LOOKUP, values: [], name: '@' }

      const dataValues = dataTable[dataJoinColumn].values
      const boundaryOffsets = this.getBoundaryOffsetLookup(featureJoinColumn)

      // console.log('retrieving lookup values:', featureJoinColumn, dataJoinColumn)

      // if user wants specific tooltips based on this dataset, save the values
      const tips = this.vizDetails.tooltip || []
      const relevantTips = tips
        .filter(tip => tip.substring(0, tip.indexOf('.')).startsWith(datasetId))
        .map(tip => {
          return [tip, tip.substring(1 + tip.indexOf('.'))]
        })

      // console.log({ relevantTips })

      for (let i = 0; i < dataValues.length; i++) {
        const featureOffset = boundaryOffsets[dataValues[i]]
        lookupColumn.values[i] = featureOffset
        for (const tip of relevantTips) {
          const feature = this.boundaries[featureOffset]
          const value = dataTable[tip[1]].values[i]
          if (feature && value) feature.properties[tip[0]] = value
        }
      }

      // Notify Deck.gl of the new tooltip data
      if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
        REACT_VIEW_HANDLES[1000 + this.layerId](this.boundaries)
      }

      // console.log({ boundaries: this.boundaries })

      // add this dataset to the datamanager
      dataTable['@'] = lookupColumn
      this.myDataManager.setPreloadedDataset({
        key: datasetId,
        dataTable,
        filename: this.datasetFilename,
      })

      this.myDataManager.addFilterListener(
        { dataset: this.datasetFilename },
        this.processFiltersNow
      )

      this.vizDetails.datasets[datasetId] = {
        file: this.datasetFilename,
        // if join columns are not named identically, use "this:that" format
        join:
          featureJoinColumn === dataJoinColumn
            ? featureJoinColumn
            : `${featureJoinColumn}:${dataJoinColumn}`,
      } as any

      // console.log('triggering updates')

      this.vizDetails = Object.assign({}, this.vizDetails)
      this.datasets[datasetId] = dataTable
      this.datasets = Object.assign({}, this.datasets)
    },

    getBoundaryOffsetLookup(joinColumn: string) {
      // return it if we already built it
      if (this.boundaryJoinLookups[joinColumn]) return this.boundaryJoinLookups[joinColumn]

      // build it
      this.statusText = 'Joining datasets...'
      this.boundaryJoinLookups[joinColumn] = {}
      const lookupValues = this.boundaryJoinLookups[joinColumn]

      const boundaryLookupColumnValues = this.boundaryDataTable[joinColumn].values

      for (let i = 0; i < this.boundaries.length; i++) {
        lookupValues[boundaryLookupColumnValues[i]] = i
      }
      this.statusText = ''
      return lookupValues
    },

    figureOutRemainingFilteringOptions() {
      this.datasetValuesColumnOptions = Object.keys(this.boundaryDataTable)
      const existingFilterColumnNames = Object.keys(this.filters)

      const columns = Array.from(this.datasetValuesColumnOptions).filter(
        f => f !== this.datasetJoinColumn && existingFilterColumnNames.indexOf(f) === -1
      )
      this.availableFilterColumns = columns
    },

    // private handleNewFill(fill: FillDefinition) {
    //   this.fixedColors = fill.fixedColors

    //   const columnName = fill.columnName

    //   if (columnName) {
    //     const datasetKey = fill.dataset
    //     const selectedDataset = this.datasets[datasetKey]
    //     if (selectedDataset) {
    //       this.activeColumn = 'value'
    //       this.datasetValuesColumn = columnName
    //     }
    //   }

    //   this.filterListener()
    // }

    handleNewFilters(filters: any) {
      // Filter shapes
      this.currentUIFilterDefinitions = filters
      this.filterDefinitions = this.parseFilterDefinitions(filters)
      this.filterShapesNow()

      // Filter datasets
      Object.keys(this.datasets).forEach((datasetKey, i) => {
        if (i === 0) return // skip shapefile
        // this.myDataManager.addFilterListener({ dataset: key }, this.processFiltersNow)
        this.activateFiltersForDataset({ datasetKey })
      })

      // handle UI filter options
      this.figureOutRemainingFilteringOptions()
    },

    handleNewFillColor(fill: FillColorDefinition) {
      // console.log('FILL COLOR')
      const color = fill
      this.fixedColors = color.fixedColors

      const columnName = color.columnName

      if (color.diffDatasets) {
        const key1 = color.diffDatasets[0] || ''
        const dataset1 = this.datasets[key1]
        const key2 = color.diffDatasets[1] || ''
        const dataset2 = this.datasets[key2]
        const relative = !!color.relative

        // console.log('999 DIFF', relative, key1, key2, dataset1, dataset2)

        if (dataset1 && dataset2) {
          const lookup1 = dataset1['@']
          const dataCol1 = dataset1[columnName]
          const lookup2 = dataset2['@']
          const dataCol2 = dataset2[columnName]

          if (!dataCol1) throw Error(`Dataset ${key1} does not contain column "${columnName}"`)
          if (!dataCol2) throw Error(`Dataset ${key2} does not contain column "${columnName}"`)

          // Calculate colors for each feature
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getColorsForDataColumn(
            {
              length: this.boundaries.length,
              data: dataCol1,
              data2: dataCol2,
              lookup: lookup1,
              lookup2: lookup2,
              options: color,
              filter: this.boundaryFilters,
              relative,
            }
          )

          this.dataFillColors = array

          // // Because we're using binary data we need to stretch the color array out, one element
          // // for each VERTEX, not each boundary! Blechh!
          // const rgb = new Uint8Array((3 * this.polygons.vertices.length) / 2) as any
          // let offset = 0
          // this.polygons.startIndices.forEach((numVertices, index) => {
          //   const rgb = array.slice(index * 3, index * 3 + 3)
          //   for (let i = 0; i < numVertices; i++) {
          //     const vNumber = offset + index
          //     rgb[vNumber * 3] = rgb[0]
          //     rgb[vNumber * 3 + 1] = rgb[1]
          //     rgb[vNumber * 3 + 2] = rgb[2]
          //   }
          //   offset += numVertices
          // })
          // this.dataFillColors = rgb

          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = `${relative ? '% ' : ''}Diff: ${columnName}` // : ${key1}-${key2}`

          this.legendStore.setLegendSection({
            section: 'Fill',
            column: dataCol1.name,
            values: legend,
            diff: true,
            relative,
          })
        }
      } else if (columnName) {
        // Get the data column
        const datasetKey = color.dataset || ''
        const selectedDataset = this.datasets[datasetKey]

        this.dataCalculatedValueLabel = ''

        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          const lookupColumn = selectedDataset['@']

          // Figure out the normal
          let normalColumn
          if (color.normalize) {
            const keys = color.normalize.split(':')
            this.dataCalculatedValueLabel = columnName + '/' + keys[1]

            // console.log({ keys, datasets: this.datasets })
            if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]])
              throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
            normalColumn = this.datasets[keys[0]][keys[1]]
            // console.log({ normalColumn })
          }

          // Calculate colors for each feature
          // console.log('Updating fills...')
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getColorsForDataColumn(
            {
              length: this.boundaries.length,
              data: dataColumn,
              normalize: normalColumn,
              lookup: lookupColumn,
              filter: this.boundaryFilters,
              options: color,
            }
          )

          this.dataFillColors = array

          // // Because we're using binary data we need to stretch the color array out, one element
          // // for each VERTEX, not each boundary! Blechh!
          // // this.dataFillColors = array
          // console.log('array is', array.length / 3)
          // console.log('startindices is', this.polygons.startIndices.length)
          // console.log('vertices is', this.polygons.vertices.length / 2)

          // // console.log(this.polygons.startIndices)
          // const tesselatedColors = new Uint8Array((this.polygons.vertices.length / 2) * 3)

          // let start = 0
          // this.polygons.startIndices.forEach((vertices, index) => {
          //   if (index == 0) return
          //   const lookup = (index - 1) * 3
          //   const finish = vertices
          //   for (let offset = start; offset < finish; offset++) {
          //     const element = offset * 3
          //     tesselatedColors[element] = array[lookup]
          //     tesselatedColors[element + 1] = array[lookup + 1]
          //     tesselatedColors[element + 2] = array[lookup + 2]
          //   }
          //   start = finish
          // })
          // this.dataFillColors = tesselatedColors
          // console.log(111, tesselatedColors)

          this.dataCalculatedValues = calculatedValues

          this.legendStore.setLegendSection({
            section: 'Color',
            column: dataColumn.name,
            values: legend,
          })
        }
      } else {
        // simple color
        // console.log('simple')
        this.dataFillColors = color.fixedColors[0]
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('Color')
      }
    },

    handleNewLineColor(color: LineColorDefinition) {
      try {
        this.fixedColors = color.fixedColors

        const columnName = color.columnName

        if (color.diffDatasets) {
          const key1 = color.diffDatasets[0] || ''
          const dataset1 = this.datasets[key1]
          const key2 = color.diffDatasets[1] || ''
          const dataset2 = this.datasets[key2]
          const relative = !!color.relative

          // console.log('000 DIFF', relative, key1, key2, dataset1, dataset2)

          if (dataset1 && dataset2) {
            const lookup1 = dataset1['@']
            const dataCol1 = dataset1[columnName]
            const lookup2 = dataset2['@']
            const dataCol2 = dataset2[columnName]

            if (!dataCol1) throw Error(`Dataset ${key1} does not contain column "${columnName}"`)
            if (!dataCol2) throw Error(`Dataset ${key2} does not contain column "${columnName}"`)

            // Calculate colors for each feature
            const { array, legend, calculatedValues } =
              ColorWidthSymbologizer.getColorsForDataColumn({
                length: this.boundaries.length,
                data: dataCol1,
                data2: dataCol2,
                lookup: lookup1,
                lookup2: lookup2,
                options: color,
                filter: this.boundaryFilters,
                relative,
              })
            this.dataLineColors = array
            this.dataCalculatedValues = calculatedValues
            this.dataCalculatedValueLabel = `${relative ? '% ' : ''}Diff: ${columnName}`

            this.legendStore.setLegendSection({
              section: 'Line Color',
              column: dataCol1.name,
              values: legend,
              diff: true,
              relative,
            })
          }
        } else if (columnName) {
          const datasetKey = color.dataset || ''
          const selectedDataset = this.datasets[datasetKey]
          if (selectedDataset) {
            const lookupColumn = selectedDataset['@']
            const dataColumn = selectedDataset[columnName]

            if (!dataColumn)
              throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)

            // Calculate colors for each feature
            const { array, legend, calculatedValues } =
              ColorWidthSymbologizer.getColorsForDataColumn({
                length: this.boundaries.length,
                data: dataColumn,
                lookup: lookupColumn,
                options: color,
                filter: this.boundaryFilters,
              })
            this.dataLineColors = array
            this.dataCalculatedValues = calculatedValues
            this.dataCalculatedValueLabel = ''

            this.legendStore.setLegendSection({
              section: 'Line Color',
              column: dataColumn.name,
              values: legend,
            })
          }
        } else {
          // simple color
          this.dataLineColors = color.fixedColors[0]
          this.dataCalculatedValueLabel = ''
          this.legendStore.clear('Line Color')
        }
      } catch (e) {
        globalStore.commit('error', '' + e)
        console.error('' + e)
      }
    },

    handleNewLineWidth(width: LineWidthDefinition) {
      const columnName = width.columnName || ''

      // constant line width?  @0, @1, @2
      if (width.dataset && /^@\d$/.test(width.dataset)) {
        this.dataLineWidths = Number.parseInt(width.dataset.substring(1))
        this.legendStore.clear('Line Width')
        return
      }

      // No scale factor?
      if (width.scaleFactor && isNaN(width.scaleFactor)) {
        this.dataLineWidths = 1
        this.legendStore.clear('Line Width')
        return
      }

      if (width.diffDatasets) {
        const key1 = width.diffDatasets[0] || ''
        const dataset1 = this.datasets[key1]
        const key2 = width.diffDatasets[1] || ''
        const dataset2 = this.datasets[key2]

        // console.log({ key1, key2, dataset1, dataset2 })

        if (dataset1 && dataset2) {
          const lookup1 = dataset1['@']
          const dataCol1 = dataset1[columnName]
          const lookup2 = dataset2['@']
          const dataCol2 = dataset2[columnName]

          if (!dataCol1) throw Error(`Dataset ${key1} does not contain column "${columnName}"`)
          if (!dataCol2) throw Error(`Dataset ${key2} does not contain column "${columnName}"`)

          // Calculate widths for each feature
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getWidthsForDataColumn(
            {
              length: this.boundaries.length,
              data: dataCol1,
              data2: dataCol2,
              lookup: lookup1,
              lookup2: lookup2,
              options: width,
            }
          )

          this.dataLineWidths = array || 0
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = 'Diff: ' + columnName

          this.legendStore.setLegendSection({
            section: 'Line Color',
            column: '' + dataCol1.name,
            values: legend,
          })
        }
      } else if (columnName) {
        // Get the data column
        const datasetKey = width.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          const lookupColumn = selectedDataset['@']

          // Calculate widths for each feature
          const { array, legend, calculatedValues } = ColorWidthSymbologizer.getWidthsForDataColumn(
            {
              length: this.boundaries.length,
              data: dataColumn,
              lookup: lookupColumn,
              options: width,
            }
          )

          this.dataLineWidths = array || 0
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = ''

          if (legend.length) {
            this.legendStore.setLegendSection({
              section: 'Line Width',
              column: dataColumn.name,
              values: legend,
            })
          } else {
            this.legendStore.clear('Line Width')
          }
        }
      } else {
        // simple width

        this.dataLineWidths = 1
        this.dataCalculatedValueLabel = ''
        this.legendStore.clear('Line Width')
      }
      // this.filterListener()
    },

    handleNewFillHeight(height: FillHeightDefinition) {
      const columnName = height.columnName
      if (columnName) {
        // Get the data column
        const datasetKey = height.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          const lookupColumn = selectedDataset['@']

          // Figure out the normal
          let normalColumn
          if (height.normalize) {
            const keys = height.normalize.split(':')
            // console.log({ keys, datasets: this.datasets })
            if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]])
              throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
            normalColumn = this.datasets[keys[0]][keys[1]]
            // console.log({ normalColumn })
            this.dataCalculatedValueLabel = columnName + '/' + keys[1]
          }

          // Calculate widths for each feature
          // console.log('update fill height...')
          const { heights, calculatedValues } =
            ColorWidthSymbologizer.getHeightsBasedOnNumericValues({
              length: this.boundaries.length,
              data: dataColumn,
              lookup: lookupColumn,
              options: height,
              normalize: normalColumn,
            })
          this.dataFillHeights = heights
          this.dataCalculatedValues = calculatedValues
          this.dataCalculatedValueLabel = ''

          if (this.$store.state.viewState.pitch == 0) {
            const angledView = Object.assign({}, this.$store.state.viewState, {
              pitch: 30,
            })
            this.$store.commit('setMapCamera', angledView)
          }
        }
      } else {
        // simple width
        this.dataFillHeights = 0
        this.dataCalculatedValues = null
        this.dataCalculatedValueLabel = ''
      }
      // this.filterListener()
    },

    handleNewRadius(radiusOptions: CircleRadiusDefinition) {
      const columnName = radiusOptions.columnName
      if (columnName) {
        // Get the data column
        const datasetKey = radiusOptions.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          const lookupColumn = selectedDataset['@']
          // Calculate radius for each feature
          const { radius, calculatedValues } = ColorWidthSymbologizer.getRadiusForDataColumn({
            length: this.boundaries.length,
            data: dataColumn,
            lookup: lookupColumn,
            options: radiusOptions,
          })
          this.dataPointRadii = radius
          this.dataCalculatedValues = calculatedValues
        }
      } else {
        // simple width
        this.dataPointRadii = 5
      }

      // this.filterListener()
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

    async processFiltersNow(datasetName?: string) {
      // This callback occurs when there is a newly filtered dataset.
      // - Grouping is required because some datasets will have multiple rows per TAZ/Link/Shape
      //   (for example, one row per transit operator with trip data for a zone)
      // - We need to get the correct join columns so that grouping happens on the right key
      // - Then apply those values (summed if necessary) to the boundaries.

      try {
        console.log('> processFiltersNow', datasetName)

        // get dataset + join for this filename --> reverse lookup by filename
        const datasetKey = Object.entries(this.datasetKeyToFilename).filter(
          d => d[1] == datasetName
        )[0][0]

        let join = this.vizDetails.datasets[datasetKey].join.split(':')
        if (join.length == 1) join.push(join[0])

        let { filteredRows } = await this.myDataManager.getFilteredDataset({
          dataset: datasetName || '',
        })

        if (!filteredRows) return

        // hide shapes that don't match filter.
        const hideFeature = new Uint8Array(this.boundaries.length).fill(1) // hide by default
        filteredRows.forEach(row => {
          const rowNumber = row['@']
          hideFeature[rowNumber] = 0
        })
        const newFilter = new Float32Array(this.boundaries.length)
        for (let i = 0; i < this.boundaries.length; i++) {
          if (this.boundaryFilters[i] == -1 || hideFeature[i]) newFilter[i] = -1
        }

        this.boundaryFilters = newFilter
        return

        // let groupLookup: any // this will be the map of boundary IDs to rows
        // let groupIndex: any = 1 // unfiltered values will always be element 1 of [key, values[]]

        // if (!filteredRows) {
        //   // is filter UN-selected? Rebuild full dataset
        //   // TODO: FIXME this is old ------:
        //   // const joinCol = this.boundaryDataTable[this.datasetJoinColumn].values
        //   // const dataValues = this.boundaryDataTable[this.datasetValuesColumn].values
        //   // groupLookup = group(zip(joinCol, dataValues), d => d[0]) // group by join key
        //   filteredRows = [] // get rid of this
        // } else {
        //   // group filtered values by lookup key
        //   groupLookup = group(filteredRows, d => d[join[0]])
        //   groupIndex = this.datasetValuesColumn // index is values column name
        // }

        // console.log({ groupLookup })

        // // Build the filtered dataset columns
        // const filteredDataset: DataTable = {}
        // const columns = Object.keys(filteredRows[0])
        // for (const column of columns) {
        //   filteredDataset[column] = { name: column, values: [], type: DataType.NUMBER }
        // }
        // for (let i = 0; i < filteredRows.length; i++) {
        //   for (const column of columns) {
        //     filteredDataset[column].values[i] = filteredRows[i][column]
        //   }
        // }

        // console.log({ filteredDataset })
        // // ok we have a filter, let's update the geojson values
        // this.setupJoin(filteredDataset, '_filter', join[0], join[1])

        // // const filteredBoundaries = [] as any[]

        //       this.boundaries.forEach(boundary => {
        //         // id can be in root of feature, or in properties
        //         let lookupKey = boundary.properties[joinShapesBy] || boundary[joinShapesBy]
        //         if (!lookupKey) this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)

        //         // the groupy thing doesn't auto-convert between strings and numbers
        //         let row = groupLookup.get(lookupKey)
        //         if (row == undefined) row = groupLookup.get('' + lookupKey)

        //         // do we have an answer
        //         boundary.properties.value = row ? sum(row.map((v: any) => v[groupIndex])) : 'N/A'
        //         filteredBoundaries.push(boundary)
        //       })

        // // centroids
        // const filteredCentroids = [] as any[]
        // this.centroids.forEach(centroid => {
        //   const centroidId = centroid.properties!.id
        //   if (!centroidId) return

        //   let row = groupLookup.get(centroidId)
        //   if (row == undefined) row = groupLookup.get('' + centroidId)
        //   centroid.properties!.value = row ? sum(row.map((v: any) => v[groupIndex])) : 'N/A'
        //   filteredCentroids.push(centroid)
        // })

        // this.boundaries = filteredBoundaries
        // this.centroids = filteredCentroids
      } catch (e) {
        console.error('' + e)
      }
    },

    async loadBoundaries() {
      let now = Date.now()

      const shapeConfig =
        this.config.boundaries || this.config.shapes || this.config.geojsonv || this.config.network

      if (!shapeConfig) return

      // shapes could be a string or an object: shape.file=blah
      let filename: string = shapeConfig.file || shapeConfig

      let featureProperties = [] as any[]

      let boundaries: any[]
      try {
        this.statusText = 'Loading features...'

        if (filename.startsWith('http')) {
          // geojson from url!
          boundaries = (await fetch(filename).then(async r => await r.json())).features
          // this.boundaries = boundaries.features
        } else if (filename.endsWith('.shp')) {
          // shapefile!
          boundaries = await this.loadShapefileFeatures(filename)
          // this.boundaries = boundaries
        } else {
          // geojson!
          boundaries = (await this.fileApi.getFileJson(`${this.subfolder}/${filename}`)).features
          // this.boundaries = boundaries.features
        }

        // for a big speedup, move properties to its own nabob
        let hasNoLines = true
        let hasNoPolygons = true

        boundaries.forEach(b => {
          // push property object to its own dataset array
          featureProperties.push(b.properties || {})

          // clear out actual feature properties; they will be in the dataset instead
          b.properties = {}

          // check if we have linestrings: network mode!
          if (
            hasNoLines &&
            (b.geometry.type == 'LineString' || b.geometry.type == 'MultiLineString')
          ) {
            hasNoLines = false
          }

          // check if we have polygons: shapefile mode!
          if (
            hasNoPolygons &&
            (b.geometry.type == 'Polygon' || b.geometry.type == 'MultiPolygon')
          ) {
            hasNoPolygons = false
          }
        })

        this.moveLogo()

        // set feature properties as a data source
        await this.setFeaturePropertiesAsDataSource(filename, [...featureProperties], shapeConfig)

        // turn ON line borders if it's a SMALL dataset (user can re-enable)
        if (!hasNoLines || boundaries.length < 5000) {
          this.dataLineColors = '#4e79a7'
        }

        // hide polygon/point buttons and opacity if we have no polygons
        if (hasNoPolygons) this.isAreaMode = false

        // // create binary representation of boundaries
        // // see https://deck.gl/docs/api-reference/layers/solid-polygon-layer
        // const vertices = new Float32Array(boundaries.map(d => d.geometry.coordinates[0]).flat(2))
        // const startIndices = new Uint32Array(
        //   boundaries.reduce(
        //     (acc, d) => {
        //       const lastIndex = acc[acc.length - 1]
        //       acc.push(lastIndex + d.geometry.coordinates[0].length)
        //       return acc
        //     },
        //     [0]
        //   )
        // )

        // console.log('5 vertexicate took', (Date.now() - now) / 1000)
        // now = Date.now()

        // console.log(`6 total vertices: ${vertices.length / 2}`)
        // console.log(`7 total indices: ${startIndices.length}`)
        // console.log(`8 number of shapes: ${boundaries.length}`)

        // this.polygons = { vertices, startIndices, pLength: boundaries.length }

        this.boundaries = boundaries

        // generate centroids if we have polygons
        if (!hasNoPolygons) await this.generateCentroidsAndMapCenter()

        // set features INSIDE react component
        if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
          REACT_VIEW_HANDLES[1000 + this.layerId](this.boundaries)
        }
      } catch (e) {
        console.error(e)
        this.$store.commit('error', '' + e)
        throw Error(`Could not load "${filename}"`)
      }

      if (!this.boundaries) throw Error(`"features" not found in shapes file`)
    },

    async setFeaturePropertiesAsDataSource(
      filename: string,
      featureProperties: any[],
      config: any
    ) {
      const dataTable = await this.myDataManager.setFeatureProperties(
        filename,
        featureProperties,
        config
      )
      this.boundaryDataTable = dataTable

      const datasetId = filename.substring(1 + filename.lastIndexOf('/'))
      this.datasets[datasetId] = dataTable

      this.vizDetails.datasets[datasetId] = {
        file: datasetId,
        join: this.datasetJoinColumn,
      } as any

      this.config.datasets = Object.assign({}, this.vizDetails.datasets)
      // console.log(333, this.vizDetails)

      // this.myDataManager.addFilterListener({ dataset: datasetId }, this.filterListener)
      // this.figureOutRemainingFilteringOptions()
    },

    async generateCentroidsAndMapCenter() {
      this.statusText = 'Calculating centroids...'
      await this.$nextTick()
      const idField = this.config.shapes.join || 'id'

      // Find the map center while we're here
      let centerLong = 0
      let centerLat = 0

      for (const feature of this.boundaries) {
        const centroid = turf.centerOfMass(feature as any)

        if (!centroid.properties) centroid.properties = {}

        if (feature.properties[this.config.boundariesLabel]) {
          centroid.properties.label = feature.properties[this.config.boundariesLabel]
        }

        centroid.properties.id = feature.properties[idField]
        if (centroid.properties.id === undefined) centroid.properties.id = feature[idField]

        this.centroids.push(centroid)

        if (centroid.geometry) {
          centerLong += centroid.geometry.coordinates[0]
          centerLat += centroid.geometry.coordinates[1]
        }
      }

      centerLong /= this.centroids.length
      centerLat /= this.centroids.length

      console.log('CENTER', centerLong, centerLat)
      if (this.needsInitialMapExtent && !this.vizDetails.center) {
        this.$store.commit('setMapCamera', {
          longitude: centerLong,
          latitude: centerLat,
          center: [centerLong, centerLat],
          bearing: 0,
          pitch: 0,
          zoom: 9,
          initial: true,
        })
        this.needsInitialMapExtent = false
      }
    },

    async loadShapefileFeatures(filename: string) {
      this.statusText = 'Loading shapefile...'
      console.log('loading', filename)

      const url = `${this.subfolder}/${filename}`

      // first, get shp/dbf files
      let geojson: any = {}
      try {
        const shpPromise = this.fileApi.getFileBlob(url)
        const dbfPromise = this.fileApi.getFileBlob(url.replace('.shp', '.dbf'))
        await Promise.all([shpPromise, dbfPromise])

        const shpBlob = await (await shpPromise)?.arrayBuffer()
        const dbfBlob = await (await dbfPromise)?.arrayBuffer()
        if (!shpBlob || !dbfBlob) return []

        this.statusText = 'Generating shapes...'

        geojson = await shapefile.read(shpBlob, dbfBlob)
      } catch (e) {
        console.error(e)
        this.$store.commit('error', '' + e)
        return []
      }

      // geojson.features = geojson.features.slice(0, 10000)

      // See if there is a .prj file with projection information
      let projection = DEFAULT_PROJECTION
      const prjFilename = url.replace('.shp', '.prj')
      try {
        projection = await this.fileApi.getFileText(prjFilename)
      } catch (e) {
        // lol we can live without a projection right? ;-O
      }

      const guessCRS = Coords.guessProjection(projection)

      // then, reproject if we have a .prj file
      if (guessCRS) {
        this.statusText = 'Projecting coordinates...'
        await this.$nextTick()
        geojson = reproject.toWgs84(geojson, guessCRS, EPSGdefinitions)
        this.statusText = ''
      }

      function getFirstPoint(thing: any): any[] {
        if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
        else return [thing[0], thing[1]]
      }

      // check if we have lon/lat
      const firstPoint = getFirstPoint(geojson.features[0].geometry.coordinates)
      if (Math.abs(firstPoint[0]) > 180 || Math.abs(firstPoint[1]) > 90) {
        // this ain't lon/lat
        const msg = `Coordinates not lon/lat. Try providing ${prjFilename.substring(
          1 + prjFilename.lastIndexOf('/')
        )}`
        this.$store.commit('error', msg)
        this.statusText = msg
        return []
      }

      // if (this.needsInitialMapExtent && !this.$store.state.viewState.latitude) {
      if (true) {
        // if we don't have a user-specified map center/zoom, focus on the shapefile itself

        const long = []
        const lat = []
        for (let i = 0; i < geojson.features.length; i += 128) {
          const firstPoint = getFirstPoint(geojson.features[i].geometry.coordinates)
          long.push(firstPoint[0])
          lat.push(firstPoint[1])
        }
        const longitude = long.reduce((x, y) => x + y) / long.length
        const latitude = lat.reduce((x, y) => x + y) / lat.length

        this.$store.commit('setMapCamera', {
          longitude,
          latitude,
          bearing: 0,
          pitch: 0,
          zoom: 9,
          center: [longitude, latitude],
          initial: true,
        })
      }

      this.needsInitialMapExtent = false
      return geojson.features as any[]
    },

    async loadDatasets() {
      const keys = Object.keys(this.config.datasets)
      for (const key of keys) {
        await this.loadDataset(key)
      }
    },

    async loadDataset(datasetKey: string) {
      try {
        if (!datasetKey) return

        // dataset could be  { dataset: myfile.csv }
        //               or  { dataset: { file: myfile.csv, join: TAZ }}

        this.datasetFilename =
          'string' === typeof this.config.datasets[datasetKey]
            ? this.config.datasets[datasetKey]
            : this.config.datasets[datasetKey].file

        this.statusText = `Loading dataset ${this.datasetFilename} ...`
        // console.log(11, 'loading ' + this.datasetFilename)

        await this.$nextTick()

        let loaderConfig = { dataset: this.datasetFilename }
        if ('string' !== typeof this.config.datasets[datasetKey]) {
          loaderConfig = Object.assign(loaderConfig, this.config.datasets[datasetKey])
        }

        const dataset = await this.myDataManager.getDataset(loaderConfig)

        // figure out join - use ".join" or first column key
        const joiner =
          'string' === typeof this.config.datasets[datasetKey]
            ? Object.keys(dataset.allRows)[0]
            : this.config.datasets[datasetKey].join

        const joinColumns = joiner.split(':')
        if (joinColumns.length == 1) joinColumns.push(joinColumns[0])

        // save it!
        this.datasets[datasetKey] = dataset.allRows
        this.datasetKeyToFilename[datasetKey] = this.datasetFilename

        // link the joins if we have a join
        this.statusText = `Joining datasets...`
        await this.$nextTick()
        if (joinColumns[0]) {
          this.setupJoin(this.datasets[datasetKey], datasetKey, joinColumns[1], joinColumns[0])
        }

        // Set up filters -- there could be some in YAML already
        this.myDataManager.addFilterListener(
          { dataset: this.datasetFilename },
          this.processFiltersNow
        )
        // console.log(21, this.filterDefinitions)

        this.activateFiltersForDataset({ datasetKey })

        // console.log(22, 'heloo')
        this.figureOutRemainingFilteringOptions()
      } catch (e) {
        const msg = '' + e
        console.error(msg)
        this.$store.commit('error', msg)
      }
      return []
    },

    activateFiltersForDataset(props: { datasetKey: string }) {
      // console.log('> activateFiltersForDataset ', props.datasetKey)
      const filters = this.filterDefinitions.filter(f => f.dataset == props.datasetKey)

      for (const filter of filters) {
        console.log(123, filter)
        this.myDataManager.setFilter(
          Object.assign(filter, { dataset: this.datasetKeyToFilename[props.datasetKey] })
        )
      }
    },

    setupFilters() {
      let filterColumns = this.config.display.fill.filters
      if (!filterColumns) return

      // Get the set of options available for each filter
      filterColumns.forEach((f: string) => {
        let options = [...new Set(this.boundaryDataTable[f].values)]
        this.filters[f] = { column: f, label: f, options, active: [] }
      })

      // perhaps we have some active filters in the URL query
      const columnNames = Object.keys(this.boundaryDataTable)
      const queryFilters = Object.keys(this.$route.query).filter(f => columnNames.indexOf(f) > -1)
      for (const column of queryFilters) {
        const text = '' + this.$route.query[column]
        if (text) this.filters[column].active = text.split(',')
        // TODO FIXME
        // this.myDataManager.setFilter(this.datasetFilename, column, this.filters[column].active)
      }

      this.figureOutRemainingFilteringOptions()
    },

    filterLabel(filter: string) {
      const label = this.filters[filter].active.join(',').substring(0, 20) || 'Select...'
      return label
    },

    async handleUserSelectedNewMetric() {
      // console.log('> handleUserSelectedNewMetric')
      await this.$nextTick()
      console.log('METRIC', this.datasetValuesColumn)

      const query = Object.assign({}, this.$route.query)
      query.display = this.datasetValuesColumn
      this.$router.replace({ query })

      this.maxValue = this.boundaryDataTable[this.datasetValuesColumn].max || 0
      console.log('MAXVALUE', this.maxValue)

      this.vizDetails.display.fill.columnName = this.datasetValuesColumn
      this.vizDetails = Object.assign({}, this.vizDetails)
      this.processFiltersNow()
    },

    handleUserSelectedNewFilters(column: string) {
      const active = this.filters[column].active
      // TODO FIXME
      this.myDataManager.setFilter({
        dataset: this.datasetFilename,
        column,
        invert: false,
        value: '', // <-- what should this be?
      })

      // update URL too
      const queryFilters = Object.assign({}, this.$route.query)
      for (const filter of Object.entries(this.filters)) {
        if (filter[1].active.length) {
          queryFilters[filter[0]] = filter[1].active.join(',')
        } else {
          delete queryFilters[filter[0]]
        }
      }
      this.$router.replace({ query: queryFilters })
    },

    showCircles(show: boolean) {
      this.useCircles = show

      const query = Object.assign({}, this.$route.query)
      if (show) query.show = 'dots'
      else delete query.show
      this.$router.replace({ query })
    },

    async handleUserCreatedNewFilter() {
      await this.$nextTick()
      console.log('ADD NEW FILTER:', this.chosenNewFilterColumn)
      const f = this.chosenNewFilterColumn
      let options = [...new Set(this.boundaryDataTable[f].values)]
      this.chosenNewFilterColumn = ''

      if (options.length > 48) {
        alert('Column ' + f + ' has too many values to be used as a filter.')
        return
      }
      this.filters[f] = { column: f, label: f, options, active: [] }

      this.figureOutRemainingFilteringOptions()
    },

    updateChart() {
      // boundaryDataTable come back as an object of columnName: values[].
      // We need to make a lookup of the values by ID, and then
      // insert those values into the boundaries geojson.

      // console.log(this.config)
      // console.log(this.datasets)
      if (!this.config.display || !this.config.datasets) return

      let joinShapesBy = 'id'

      if (this.config.shapes?.join) joinShapesBy = this.config.shapes.join
      // throw Error('Need "join" property to link shapes to datasets')

      const datasetJoinCol = this.datasetJoinColumn // used to be this.config.display.fill.join
      if (!datasetJoinCol) {
        console.error(`No join column ${datasetJoinCol}`)
        return
      }

      // value columns should be an array but might not be there yet
      let valueColumns = this.config.display.fill.values
      if (!valueColumns) {
        this.statusText = ''
        throw Error(`Need to specify column for data values`)
      }

      // Display values from query param if available, or config, or first option.
      if (this.$route.query.display) this.config.display.fill.columnName = this.$route.query.display
      let datasetValuesCol = this.config.display.fill.columnName || valueColumns[0]

      this.datasetValuesColumn = datasetValuesCol
      this.datasetValuesColumnOptions = valueColumns

      this.setupFilters()

      // 1. build the data lookup for each key in the dataset.
      //    There is often more than one row per key, so we will
      //    create an array for the group now, and (sum) them in step 2 below
      const joinCol = this.boundaryDataTable[datasetJoinCol].values
      const dataValues = this.boundaryDataTable[datasetValuesCol].values
      const groupLookup = group(zip(joinCol, dataValues), d => d[0]) // group by join key

      let max = 0

      // 2. insert values into geojson
      for (let idx = 0; idx < this.boundaries.length; idx++) {
        const boundary = this.boundaries[idx]
        const centroid = this.centroids[idx]

        // id can be in root of feature, or in properties
        let lookupValue = boundary[joinShapesBy]
        if (lookupValue == undefined) lookupValue = boundary.properties[joinShapesBy]

        if (lookupValue === undefined) {
          this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)
        }

        // SUM the values of the second elements of the zips from (1) above
        const row = groupLookup.get(lookupValue)
        if (row) {
          boundary.properties.value = sum(row.map(v => v[1]))
          max = Math.max(max, boundary.properties.value)
        } else {
          boundary.properties.value = 'N/A'
        }

        // update the centroid too
        if (centroid) centroid.properties!.value = boundary.properties.value
      }

      // this.maxValue = max // this.boundaryDataTable[datasetValuesCol].max || 0
      this.maxValue = this.boundaryDataTable[datasetValuesCol].max || 0

      // // 3. insert values into centroids
      // this.centroids.forEach(centroid => {
      //   const centroidId = centroid.properties!.id
      //   if (!centroidId) return

      //   let row = groupLookup.get(centroidId)
      //   if (row === undefined) row = groupLookup.get(parseInt(centroidId))
      //   centroid.properties!.value = row ? sum(row.map(v => v[1])) : 'N/A'
      // })

      // sort them so big bubbles are below small bubbles
      this.centroids = this.centroids.sort((a: any, b: any) =>
        a.properties.value > b.properties.value ? -1 : 1
      )
      this.activeColumn = 'value'
    },

    clearData() {
      // these lines change the properties of these objects
      // WITHOUT reassigning them to new objects; this is
      // essential for the garbage-collection to work properly.
      // Otherwise we get a 500Mb memory leak on every view :-D
      this.boundaries = []
      this.centroids = []
      this.boundaryDataTable = {}
      this.boundaryFilters = new Float32Array(0)
      this.datasets = {}
      this.dataFillColors = '#888'
      this.dataLineColors = ''
      this.dataLineWidths = 1
      this.dataPointRadii = 5
      this.dataFillHeights = 0
      this.dataCalculatedValues = null
      this.dataCalculatedValueLabel = ''
    },
  },

  async mounted() {
    try {
      // EMBED MODE?
      this.setEmbeddedMode()

      this.clearData()
      await this.getVizDetails()
      this.buildThumbnail()

      if (this.thumbnail) return

      this.filterDefinitions = this.parseFilterDefinitions(this.vizDetails.filters)
      this.setupLogoMover()

      if (this.needsInitialMapExtent && this.vizDetails.center) {
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

      this.expColors = this.config.display?.fill?.exponentColors
      this.dataFillColors = globalStore.state.isDarkMode ? '#44445580' : '#dddddd80'

      // convert values to arrays as needed
      if (!this.config.display.fill) this.config.display.fill = { filters: [] }
      this.config.display.fill.filters = this.convertCommasToArray(this.config.display.fill.filters)

      if (this.config.display?.fill?.values) {
        this.config.display.fill.values = this.convertCommasToArray(this.config.display.fill.values)
      }

      // load the boundaries first, then the dataset.
      // Need boundaries first so we can build the lookups.
      // await Promise.all([this.loadBoundaries(), this.loadDataset()])
      await this.loadBoundaries()
      this.filterShapesNow()

      this.isLoaded = true
      this.$emit('isLoaded')

      await this.loadDatasets()

      // Check URL query parameters
      this.honorQueryParameters()

      this.datasets = Object.assign({}, this.datasets)
      this.config.datasets = Object.assign({}, this.datasets)
      this.vizDetails = Object.assign({}, this.vizDetails)

      this.statusText = ''
    } catch (e) {
      this.$store.commit('error', 'Mapview ' + e)
    }
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.layerId]

    if (REACT_VIEW_HANDLES[1000 + this.layerId]) {
      REACT_VIEW_HANDLES[1000 + this.layerId]([])
      delete REACT_VIEW_HANDLES[1000 + this.layerId]
    }

    this.clearData()
    this.legendStore.clear()
    this.resizer?.disconnect()

    this.myDataManager.removeFilterListener(this.config, this.processFiltersNow)
    // this.myDataManager.clearCache()
    this.$store.commit('setFullScreen', false)
  },
})

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'area-map',
  prettyName: 'Shapefile Viewer',
  description: 'Shapefile, Geojson, Network Viewer',
  filePatterns: [
    // viz-map plugin
    '**/viz-map*.y?(a)ml',
    // raw geojson files
    '**/*.geojson?(.gz)',
    // shapefiles too
    '**/*.shp',
  ],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.map-layout {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  min-height: $thumbnailHeight;
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  z-index: -1;
}

.map-layout.hide-thumbnail {
  background: unset;
  z-index: 0;
}

.area-map {
  position: relative;
  flex: 1;
}

.config-bar {
  display: flex;
  flex-direction: row;
  padding-top: 0.25rem;
  background-color: var(--bgDashboard);
  z-index: 20;
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

.config-bar.is-standalone {
  padding: 0.5rem 0.5rem;
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

@media only screen and (max-width: 640px) {
}
</style>
