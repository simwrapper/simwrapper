<template lang="pug">
.link-volume-plot(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}'
        oncontextmenu="return false")

  .plot-container(v-if="!thumbnail")
    link-gl-layer.map-area(
        :viewId="linkLayerId"
        :links="geojsonData"
        :colorRampType="colorRampType"
        :build="csvData"
        :base="csvBase"
        :widths="csvWidth"
        :widthsBase="csvWidthBase"
        :dark="isDarkMode"
        :newColors="colorArray"
        :newWidths="widthArray"
        :scaleWidth="scaleWidth"
        :projection="vizDetails.projection"
        :mapIsIndependent="vizDetails.mapIsIndependent"
        :bgLayers="backgroundLayers"
    )

    zoom-buttons(v-if="!thumbnail")
    //- drawing-tool(v-if="!thumbnail")

    //- color/width/etc panel
    viz-configurator(v-if="!thumbnail && isDataLoaded"
      :vizDetails="vizDetails"
      :datasets="datasets"
      :fileSystem="fileSystem"
      :subfolder="myState.subfolder"
      :yamlConfig="config"
      :legendStore="legendStore"
      :filterDefinitions="currentUIFilterDefinitions"
      @update="changeConfiguration")

    //- .top-panel(v-if="vizDetails.title")
    //-   .panel-item
    //-     h3 {{ vizDetails.title }}
    //-     p {{ vizDetails.description }}

    .bottom-panel(v-if="!thumbnail")
      .panel-items(v-show="csvWidth.activeColumn")

        //- slider/dropdown for selecting column
        .panel-item.config-section
          selector-panel(
            :vizDetails="vizDetails"
            :csvData="csvWidth"
            :scaleWidth="scaleWidth"
            :showDiffs="vizDetails.showDifferences"
            @column="handleNewDataColumn"
            @slider="handleNewDataColumn"
          )

        //- DIFF checkbox
        .panel-item.diff-section(v-if="vizDetails.datasets.csvBase")
          toggle-button.toggle(:width="40" :value="vizDetails.showDifferences" :sync="true" :labels="false"
            :color="{checked: '#4b7cc4', unchecked: '#222'}"
            @change="toggleShowDiffs")
          p: b {{ $t('showDiffs') }}

        //- FilterPanel.filter-panel(v-if="vizDetails.useSlider"
        //-   :props="csvWidth"
        //-   @activeColumns="handleNewFilter"
        //- )
      .status-message(v-if="myState.statusMessage")
        p {{ myState.statusMessage }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      all: 'All',
      colors: 'Colors',
      loading: 'Loading',
      selectColumn: 'Select data column',
      timeOfDay: 'Time of day',
      bandwidths: 'Widths: 1 pixel =',
      showDiffs: 'Show Differences',
    },
    de: {
      all: 'Alle',
      colors: 'Farben',
      loading: 'Wird geladen',
      selectColumn: 'Datenspalte wählen',
      timeOfDay: 'Uhrzeit',
      bandwidths: 'Linienbreiten: 1 pixel =',
      showDiffs: 'Differenzen',
    },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { ToggleButton } from 'vue-js-toggle-button'
import { rgb } from 'd3-color'
import { scaleThreshold, scaleOrdinal } from 'd3-scale'
import { shallowEqualObjects } from 'shallow-equal'
import readBlob from 'read-blob'
import YAML from 'yaml'

import globalStore from '@/store'
import { MAP_STYLES_OFFLINE, DataTableColumn, DataTable, DataType, LookupDataset } from '@/Globals'
// import FilterPanel from './BadFilterPanel.vue'
import SelectorPanel from './SelectorPanel.vue'
import LinkGlLayer from './DeckMapComponent.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import LegendStore from '@/js/LegendStore'
import Coords from '@/js/Coords'
import { arrayBufferToBase64 } from '@/js/util'

import { ColorScheme, FileSystem, FileSystemConfig, VisualizationPlugin, Status } from '@/Globals'

import { LineColorDefinition } from '@/components/viz-configurator/LineColors.vue'
import { LineWidthDefinition } from '@/components/viz-configurator/LineWidths.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import BackgroundLayers from '@/js/BackgroundLayers'

const LOOKUP_COLUMN = '_LINK_OFFSET_'

const MyComponent = defineComponent({
  name: 'NetworkLinksPlugin',
  i18n,
  components: {
    SelectorPanel,
    DrawingTool,
    LinkGlLayer,
    ToggleButton,
    VizConfigurator,
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
  data() {
    return {
      standaloneYAMLconfig: {
        title: '',
        description: '',
        csvFile: '',
        csvBase: '',
        datasets: {} as { [id: string]: string },
        useSlider: false,
        showDifferences: false,
        shpFile: '',
        dbfFile: '',
        network: '',
        geojsonFile: '',
        projection: '',
        center: null as any,
        zoom: 0,
        widthFactor: null as any,
        thumbnail: '',
        sum: false,
        nodes: '', // SFCTA nodes shapefile
        links: [] as string[], // SFCTA links DBF files
        mapIsIndependent: false,
        display: {
          color: {} as any,
          width: {} as any,
        },
      },

      backgroundLayers: null as null | BackgroundLayers,

      YAMLrequirementsLinks: {
        // csvFile: '',
        // network: '',
        // projection: '',
      },

      // this contains the display settings for this view; it is the View Model.
      // use changeConfiguration to modify this for now (todo: move to state model)
      vizDetails: {
        title: '',
        description: '',
        csvFile: '',
        csvBase: '',
        datasets: {} as { [id: string]: string },
        useSlider: false,
        showDifferences: false,
        shpFile: '',
        dbfFile: '',
        network: '',
        geojsonFile: '',
        projection: '',
        center: null as any,
        zoom: 0,
        widthFactor: null as any,
        thumbnail: '',
        sum: false,
        nodes: '', // SFCTA nodes shapefile
        links: [] as string[], // SFCTA links DBF files
        mapIsIndependent: false,
        display: {
          color: {} as any,
          width: {} as any,
        },
      },

      currentUIFilterDefinitions: {} as any,
      datasets: {} as { [id: string]: DataTable },
      isButtonActiveColumn: false,
      linkLayerId: Math.floor(1e12 * Math.random()),
      scaleWidth: 0,
      numLinks: 0,
      showTimeRange: false,
      legendStore: new LegendStore(),
      geojsonData: {
        source: new Float32Array(),
        dest: new Float32Array(),
        linkId: [] as any[],
        projection: '',
      },
      fixedColors: ['#4e79a7'],
      myState: {
        statusMessage: '',
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      },

      csvData: {
        datasetKey: '',
        activeColumn: '',
        dataTable: {},
        csvRowFromLinkRow: [],
      } as LookupDataset,

      csvBase: {
        datasetKey: '',
        activeColumn: '',
        dataTable: {},
        csvRowFromLinkRow: [],
      } as LookupDataset,

      csvWidth: {
        datasetKey: '',
        activeColumn: '',
        dataTable: {},
        csvRowFromLinkRow: [],
      } as LookupDataset,

      csvWidthBase: {
        datasetKey: '',
        activeColumn: '',
        dataTable: {},
        csvRowFromLinkRow: [],
      } as LookupDataset,

      // private linkOffsetLookup: { [id: string]: number } = {}
      isDarkMode: this.$store.state.colorScheme === ColorScheme.DarkMode,
      isDataLoaded: false,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

      currentWidthDefinition: { columnName: '' } as LineWidthDefinition,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      resizer: undefined as ResizeObserver | undefined,
      dataLoaderWorkers: [] as Worker[],
      csvRowLookupFromLinkRow: {} as { [datasetId: string]: number[] },

      colorArray: new Uint8Array(),
      widthArray: new Float32Array(),
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

    urlThumbnail(): string {
      return this.thumbnailUrl
    },

    colorRampType(): any {
      const rampType = this.vizDetails.display.color?.colorRamp?.style
      if (rampType === undefined) return -1
      return rampType
    },

    buttonTitle(): string {
      return this.csvData.activeColumn || 'Loading...'
    },
  },
  watch: {
    '$store.state.viewState'() {
      if (this.vizDetails.mapIsIndependent) return
    },

    '$store.state.colorScheme'() {
      setTimeout(
        () => (this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode),
        100
      )
    },

    'vizDetails.showDifferences'() {
      this.generateWidthArray()
      this.generateColorArray()
    },
  },
  methods: {
    setDataIsLoaded() {
      this.isDataLoaded = true
    },
    async getVizDetails() {
      const filename = this.myState.yamlConfig

      const emptyState = {
        showDifferences: false,
        datasets: {} as any,
        display: { color: {} as any, width: {} as any },
      }

      // are we in a dashboard?
      if (this.config) {
        this.validateYAML()
        this.vizDetails = Object.assign({}, emptyState, this.config)
        return
      }

      // was a YAML file was passed in?
      if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
        await this.loadStandaloneYamlConfig()
      }

      // is this a bare network file? - build vizDetails manually
      if (/(shp|xml|geojson|geo\.json)(|\.gz)$/.test(filename)) {
        const title = 'Network: ' + this.myState.yamlConfig // .substring(0, 7 + this.myState.yamlConfig.indexOf('network'))

        this.vizDetails = Object.assign({}, this.vizDetails, {
          network: this.myState.yamlConfig,
          title,
          description: this.myState.subfolder,
        })
      }

      const t = this.vizDetails.title ? this.vizDetails.title : filename || 'Network Links'
      this.$emit('title', t)
    },

    async loadStandaloneYamlConfig() {
      try {
        const filename =
          this.myState.yamlConfig.indexOf('/') > -1
            ? this.myState.yamlConfig
            : this.myState.subfolder + '/' + this.myState.yamlConfig

        const text = await this.fileApi.getFileText(filename)
        this.standaloneYAMLconfig = Object.assign({}, YAML.parse(text))
        this.validateYAML()
        this.setVizDetails()
      } catch (err) {
        console.error('failed')
        const e = err as any
        // maybe it failed because password?
        if (this.fileSystem.needPassword && e.status === 401) {
          this.$store.commit('requestLogin', this.fileSystem.slug)
        } else {
          this.$emit('error', '' + e)
        }
      }
    },

    async validateYAML() {
      const hasYaml = new RegExp('.*(yml|yaml)$').test(this.myState.yamlConfig)

      let configuration: any

      if (hasYaml) {
        console.log('--has viz-*.yaml')
        configuration = this.standaloneYAMLconfig
      } else {
        console.log('--no yaml, config came from dashboard')
        configuration = this.config
      }

      for (const key in this.YAMLrequirementsLinks) {
        if (key in configuration === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `YAML file missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsLinks for required keys',
          })
        }
      }

      // if (configuration.zoom < 5 || configuration.zoom > 20) {
      //   this.$emit('error', {
      //     type: Status.WARNING,
      //     msg: `Zoom is out of the recommended range `,
      //     desc: 'Zoom levels should be between 5 and 20. ',
      //   })
      // }

      const isMissingNetwork = !configuration.network && !configuration.geojsonFile
      if (isMissingNetwork) {
        this.$emit('error', 'Network file not specified')
      }

      // if (!configuration.display) {
      //   this.$emit('error', {
      //     type: Status.WARNING,
      //     msg: `Display properties not set`,
      //     desc: 'Standard values are used',
      //   })
      // }
    },

    setVizDetails() {
      this.vizDetails = Object.assign({}, this.vizDetails, this.standaloneYAMLconfig)
    },

    async buildThumbnail() {
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.myState.subfolder + '/' + this.vizDetails.thumbnail
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

    toggleShowDiffs() {
      this.vizDetails.showDifferences = !this.vizDetails.showDifferences
    },

    /**
     * changeConfiguration: is the main entry point for changing the viz model.
     * anything that wants to change colors, widths, data, anthing like that
     * should all pass through this function so the underlying data model
     * is modified properly.
     */
    changeConfiguration(props: {
      color?: LineColorDefinition
      width?: LineWidthDefinition
      dataset?: DatasetDefinition
    }) {
      // console.log(props)

      if (props['color']) {
        // if (JSON.stringify(props.color) === JSON.stringify(this.vizDetails.display.color)) return
        this.vizDetails = Object.assign({}, this.vizDetails)
        this.vizDetails.display.color = props.color
        this.handleNewColor(props.color)
      }
      if (props['width']) {
        // if (JSON.stringify(props.width) === JSON.stringify(this.vizDetails.display.width)) return
        this.vizDetails = Object.assign({}, this.vizDetails)
        this.vizDetails.display.width = props.width
        this.handleNewWidth(props.width)
      }
      if (props['dataset']) {
        // vizdetails just had the string name, whereas props.dataset contains
        // a fully-build DatasetDefinition, so let's just handle that
        this.handleNewDataset(props.dataset)
      }
    },

    handleNewFilter(columns: number[]) {
      this.csvData = Object.assign({}, this.csvData, { activeColumn: columns[0] })
      this.csvWidth = Object.assign({}, this.csvWidth, { activeColumn: columns[0] })

      // // this.timeFilterColumns = columns
      // // give animation 150ms to run
      // setTimeout(() => {
      //   if (columns.length) {
      //     this.csvData = Object.assign({}, this.csvData, { activeColumn: columns[0] })
      //     this.csvWidth = Object.assign({}, this.csvWidth, { activeColumn: columns[0] })
      //   }
      // }, 150)
    },

    handleNewWidth(width: LineWidthDefinition) {
      // if definition hasn't changed, do nothing
      if (shallowEqualObjects(width, this.currentWidthDefinition)) {
        return
      }

      const { columnName, dataset, scaleFactor } = width

      // if dataset is set to None, just set scale to 0 and we're done
      if (!dataset) {
        this.scaleWidth = 0
        return
      }

      // change scaling factor without recalculating anything:
      if (scaleFactor !== undefined) this.scaleWidth = scaleFactor

      // if everything else is the same, don't recalculate anything
      let recalculate = true

      if (!columnName) recalculate = false

      if (
        width.columnName === this.currentWidthDefinition.columnName &&
        width.dataset === this.currentWidthDefinition.dataset
      ) {
        recalculate = false
      }

      // save settings
      this.currentWidthDefinition = width

      // this part takes longer to calculate. only do it if we have to
      if (!recalculate) return

      const selectedDataset = dataset ? this.datasets[dataset] : this.csvWidth.dataTable
      if (!selectedDataset) return

      if (this.csvWidth.dataTable !== selectedDataset) {
        this.csvWidth.dataTable = selectedDataset
        this.csvWidth.activeColumn = columnName || ''
        // this.csvWidthBase.dataTable = selectedDataset
        this.csvWidthBase.activeColumn = columnName || ''
      }

      const dataColumn = selectedDataset[columnName || '']
      if (!dataColumn) {
        const msg = `Width: column "${columnName}" not found in dataset "${this.csvData.datasetKey}"`
        console.error(msg)
        this.$emit('error', {
          type: Status.ERROR,
          msg,
        })
        return
      }

      // Tell Vue we have new data
      this.csvWidth = {
        datasetKey: dataset || this.csvWidth.datasetKey,
        dataTable: selectedDataset,
        activeColumn: columnName || '',
        csvRowFromLinkRow: dataset ? this.csvRowLookupFromLinkRow[dataset] : [],
      }
      this.generateWidthArray()
    },

    handleNewColor(color: LineColorDefinition) {
      this.fixedColors = color.fixedColors

      const columnName = color.columnName
      if (!columnName) {
        this.generateColorArray()
        return
      }

      const datasetKey = color.dataset
      const selectedDataset = this.datasets[datasetKey]
      if (!selectedDataset) return

      if (this.csvData.dataTable !== selectedDataset) {
        this.csvData = {
          datasetKey,
          dataTable: selectedDataset,
          activeColumn: '',
          csvRowFromLinkRow: this.csvRowLookupFromLinkRow[datasetKey],
        }
      }

      const column = this.csvData.dataTable[columnName]
      if (!column) {
        const msg = `Color: Column "${columnName}" not found in dataset "${this.csvData.datasetKey}"`
        console.error(msg)
        this.$emit('error', {
          type: Status.ERROR,
          msg,
        })
        return
      }

      this.csvData.activeColumn = column.name
      this.csvBase.activeColumn = column.name

      this.isButtonActiveColumn = false
      this.generateColorArray()
    },

    setMapCenterFromVizDetails() {
      if (typeof this.vizDetails.center == 'string') {
        this.vizDetails.center = this.vizDetails.center.split(',').map(Number)
      }

      if (!this.vizDetails.zoom) {
        this.vizDetails.zoom = 9
      }

      this.$store.commit('setMapCamera', {
        longitude: this.vizDetails.center[0],
        latitude: this.vizDetails.center[1],
        bearing: 0,
        pitch: 0,
        zoom: this.vizDetails.zoom,
        jump: false,
      })

      const view = {
        longitude: this.vizDetails.center[0],
        latitude: this.vizDetails.center[1],
        bearing: 0,
        pitch: 0,
        zoom: this.vizDetails.zoom || 10, // use 10 default if we don't have a zoom
        jump: false, // move the map no matter what
      }

      // bounce our map
      // if (REACT_VIEW_HANDLES[this.linkLayerId]) {
      //   REACT_VIEW_HANDLES[this.linkLayerId](view)
      // }
    },

    async setMapCenter() {
      if (this.vizDetails.center) return this.setMapCenterFromVizDetails()

      const data = this.geojsonData

      if (!data.source.length) return

      let samples = 0
      let longitude = 0
      let latitude = 0

      // figure out the center
      if (this.geojsonData.projection !== 'Atlantis') {
        const numLinks = data.source.length / 2
        const gap = numLinks < 4096 ? 2 : 1024
        for (let i = 0; i < numLinks; i += gap) {
          longitude += data.source[i * 2]
          latitude += data.source[i * 2 + 1]
          samples++
        }
        longitude = longitude / samples
        latitude = latitude / samples
      }
      console.log('center', longitude, latitude)

      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        bearing: 0,
        pitch: 0,
        zoom: 8,
        jump: false,
      })
    },

    async updateStatus(message: string) {
      this.myState.statusMessage = message
    },

    async loadNetwork(): Promise<any> {
      if (!this.myDataManager) throw Error('links: no datamanager')

      this.myState.statusMessage = 'Loading network...'

      const filename = this.vizDetails.network || this.vizDetails.geojsonFile
      if (!filename) {
        this.myState.statusMessage = ''
        this.$emit('isLoaded')
        return
      }

      try {
        const network = await this.myDataManager.getRoadNetwork(
          filename,
          this.myState.subfolder,
          this.vizDetails,
          this.updateStatus
        )

        this.numLinks = network.linkId.length
        this.geojsonData = network as any

        // Handle Atlantis: no long/lat coordinates
        if (network.projection) {
          this.vizDetails.projection = '' + network.projection
          // this.$store.commit('setMapStyles', MAP_STYLES_OFFLINE)
        }

        this.setMapCenter() // this could be off main thread

        this.myState.statusMessage = ''

        this.$emit('isLoaded', true)

        // then load CSVs in background
        this.loadCSVFiles()
      } catch (e) {
        this.myState.statusMessage = ''
        this.$emit('error', `` + e)
        this.$emit('isLoaded')
      }
    },

    generateUniqueDatasetKeyFromFilename(name: string) {
      if (!(name in this.datasets)) return name
      console.log(name, 'not unique')
      for (let i = 2; i < 100; i++) {
        let newName = `${name}_${i}`
        if (!(newName in this.datasets)) return newName
      }
      return `${name}__${Math.floor(100 + 1e5 * Math.random())}`
    },

    handleNewDataset(props: DatasetDefinition) {
      // console.log('NEW dataset', props)
      const { key, dataTable, filename } = props
      const uniqueKey = this.generateUniqueDatasetKeyFromFilename(key)
      // console.log('UNIQUE', key, uniqueKey)

      // We need a lookup so we can find the CSV row that matches each link row.
      // A normal hashmap lookup is too slow, so we'll create an array containing
      // the lookup on load (now); then it should be O(1) fast from that point forward.

      // For now we assume the 1st CSV column always has the link ID
      const columnNames = Object.keys(dataTable)
      const assumedLinkIdIsFirstColumn = columnNames[0]
      const linkIdColumn = dataTable[assumedLinkIdIsFirstColumn]

      let tempMapLinkIdToCsvRow = {} as any
      for (let csvRow = 0; csvRow < linkIdColumn.values.length; csvRow++) {
        tempMapLinkIdToCsvRow[linkIdColumn.values[csvRow]] = csvRow
      }

      // Create a LOOKUP array which links this CSV data to the network links
      // loop through all network links, we need the CSV row for each link.
      const getCsvRowNumberFromLinkRowNumber: number[] = []
      for (let linkRow = 0; linkRow < this.geojsonData.linkId.length; linkRow++) {
        const linkId = this.geojsonData.linkId[linkRow]
        const csvRow = tempMapLinkIdToCsvRow[linkId]
        if (csvRow !== undefined) getCsvRowNumberFromLinkRowNumber[linkRow] = csvRow
      }

      // Save the lookup with the dataset.
      this.csvRowLookupFromLinkRow[uniqueKey] = getCsvRowNumberFromLinkRowNumber
      tempMapLinkIdToCsvRow = {} // probably unnecessary but we def want this to be GC'ed

      // all done!
      if (filename) this.vizDetails.datasets[uniqueKey] = filename
      this.datasets = Object.assign({ ...this.datasets }, { [uniqueKey]: dataTable })
      this.handleDatasetisLoaded(uniqueKey)
    },

    generateWidthArray() {
      const numLinks = this.geojsonData.linkId.length
      const widths = new Float32Array(numLinks)

      const widthValues = this.csvWidth?.dataTable[this.csvWidth.activeColumn]?.values
      const baseValues = this.csvBase?.dataTable[this.csvBase.activeColumn]?.values

      const width = (i: number) => {
        const csvRow = this.csvWidth.csvRowFromLinkRow[i]
        const value = widthValues[csvRow]

        if (this.vizDetails.showDifferences) {
          const baseRow = this.csvBase.csvRowFromLinkRow[i]
          const baseValue = baseValues[baseRow]
          const diff = Math.abs(value - baseValue)
          return diff
        } else {
          return value
        }
      }

      for (let i = 0; i < numLinks; i++) {
        widths[i] = width(i)
      }
      this.widthArray = widths
    },

    generateColorArray() {
      // deck.gl colors must be in rgb[] or rgba[] format
      const colorsAsRGB: any = this.fixedColors.map(hexcolor => {
        const c = rgb(hexcolor)
        return [c.r, c.g, c.b, 255]
      })

      // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
      // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
      // An exponent reduces visual dominance of very large values at the high end of the scale
      const exponent = 4.0
      const domain = new Array(this.fixedColors.length - 1)
        .fill(0)
        .map((v, i) => Math.pow((1 / this.fixedColors.length) * (i + 1), exponent))

      // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
      // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
      // *range* is the list of colors;
      // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
      // *colorRampType* is 0 if a categorical color ramp is chosen
      const buildData = this.csvData.dataTable
      const baseData = this.csvBase.dataTable
      const activeColumn = this.csvData.activeColumn

      const buildColumn: DataTableColumn = buildData[activeColumn] || { values: [] }
      const baseColumn: DataTableColumn = baseData[activeColumn] || { values: [] }

      const isCategorical = this.colorRampType === 0 || buildColumn.type == DataType.STRING
      const setColorBasedOnValue: any = isCategorical
        ? scaleOrdinal().range(colorsAsRGB)
        : scaleThreshold().range(colorsAsRGB).domain(domain)

      const numLinks = this.geojsonData.linkId.length
      const colors = new Uint8Array(4 * numLinks)

      const colorPaleGrey = globalStore.state.isDarkMode ? [80, 80, 80, 96] : [212, 212, 212, 40]
      const colorInvisible = [0, 0, 0, 0]

      const color = (i: number) => {
        // if (!buildData[this.csvData.activeColumn]) return colorPaleGrey

        const csvRow = this.csvData.csvRowFromLinkRow[i]
        let value = buildData[this.csvData.activeColumn]?.values[csvRow]

        if (this.fixedColors.length === 1) return colorsAsRGB[0]
        if (!value && !this.vizDetails.showDifferences) return colorInvisible
        if (isCategorical) return setColorBasedOnValue(value)

        if (this.vizDetails.showDifferences) {
          const baseRow = this.csvBase.csvRowFromLinkRow[i]
          const baseValue = baseData[activeColumn].values[baseRow]
          const diff = value - baseValue

          if (diff === 0) return colorPaleGrey // setColorBasedOnValue(0.5)

          // red vs. blue
          if (this.isDarkMode) {
            return diff > 0 ? [255, 64, 64, 255] : [64, 96, 255, 255] // red vs. blue
          } else {
            return diff > 0 ? [255, 0, 0, 255] : [32, 64, 255, 255] // red vs. blue
          }
        } else {
          // don't use log scale if numbers are below 1.0
          let ratio = value / (buildColumn.max || 1.0)
          // if (ratio < 0.0001) return colorPaleGrey
          return setColorBasedOnValue(ratio)
        }
      }

      for (let i = 0; i < numLinks; i++) {
        colors.set(color(i), i * 4)
      }

      this.colorArray = colors
    },

    loadCSVFiles() {
      this.myState.statusMessage = 'Loading datasets...'

      // Old yaml format listed csvFile and csvBase explicitly.
      // Merge those into vizDetails.datasets if they exist.
      if (!this.vizDetails.datasets) this.vizDetails.datasets = {}
      if (this.vizDetails.csvFile) this.vizDetails.datasets.csvFile = this.vizDetails.csvFile
      if (this.vizDetails.csvBase) this.vizDetails.datasets.csvBase = this.vizDetails.csvBase

      // Load files on workers, in parallel and off the main thread
      // this will call finishedLoadingCSV() for each when it's done loading & parsing
      const datasetsToLoad = Object.entries(this.vizDetails.datasets)

      if (datasetsToLoad.length) {
        for (const [key, filename] of datasetsToLoad) {
          this.loadOneCSVFile(key, filename)
        }
      } else {
        this.showSimpleNetworkWithNoDatasets()
      }
    },

    showSimpleNetworkWithNoDatasets() {
      // no datasets; we are just showing the bare network
      this.csvData = {
        datasetKey: '',
        dataTable: {
          [LOOKUP_COLUMN]: {
            name: LOOKUP_COLUMN,
            type: DataType.LOOKUP,
            values: [],
          },
        },
        activeColumn: LOOKUP_COLUMN,
        csvRowFromLinkRow: [],
      }

      // there is no range(maxValue) in Javascript! :-(
      const length = this.geojsonData.source.length / 2 // half because this contains x/y coordinates
      const lookup = [...Array(length).keys()]
      this.csvData.dataTable[LOOKUP_COLUMN].values = lookup

      this.myState.statusMessage = ''
      this.setDataIsLoaded()

      const color: LineColorDefinition = {
        fixedColors: this.fixedColors,
        dataset: '',
        columnName: '',
        normalize: '',
      }
      this.changeConfiguration({ color })
    },

    handleDatasetisLoaded(datasetId: string) {
      const datasetKeys = Object.keys(this.datasets)

      if (datasetId === 'csvBase' || datasetId === 'base') {
        // is base dataset:
        this.csvBase = {
          datasetKey: datasetId,
          dataTable: this.datasets[datasetId],
          csvRowFromLinkRow: this.csvRowLookupFromLinkRow[datasetId],
          activeColumn: '',
        }
        this.csvWidthBase = {
          datasetKey: datasetId,
          dataTable: this.datasets[datasetId],
          csvRowFromLinkRow: this.csvRowLookupFromLinkRow[datasetId],
          activeColumn: '',
        }
      } else if (this.csvData.activeColumn === '') {
        // is first non-base dataset:
        // set a default view, if user didn't pass anything in
        if (!this.vizDetails.display.color && !this.vizDetails.display.width) {
          const firstColumnName = Object.values(this.datasets[datasetId])[0].name
          this.csvData = {
            datasetKey: datasetId,
            dataTable: this.datasets[datasetId],
            csvRowFromLinkRow: this.csvRowLookupFromLinkRow[datasetId],
            activeColumn: firstColumnName,
          }
        }
      }

      // last dataset
      if (datasetKeys.length === Object.keys(this.vizDetails.datasets).length) {
        this.setDataIsLoaded()
        this.myState.statusMessage = ''
        // console.log('DATASETS:', Object.keys(this.datasets))
      }
    },

    async loadOneCSVFile(key: string, filename: string) {
      try {
        const dataset = await this.myDataManager.getDataset(
          { dataset: filename },
          { subfolder: this.subfolder }
        )
        const dataTable = dataset.allRows

        console.log('loaded', key)
        this.myState.statusMessage = 'Analyzing...'

        // remove columns without names; we can't use them
        const cleanTable: DataTable = {}
        for (const key of Object.keys(dataTable)) {
          if (key) cleanTable[key] = dataTable[key]
        }

        this.handleNewDataset({ key, dataTable: cleanTable })
      } catch (e) {
        this.$emit('error', 'Could not load ' + filename)
        this.$emit('isLoaded')
      }
    },

    handleNewDataColumn(value: { dataset: LookupDataset; column: string }) {
      const { dataset, column } = value

      // selector is attached to a dataset. Both color and width could be
      // impacted, if they are attached to that dataset.

      const config: any = {}

      // WIDTHS
      if (dataset.datasetKey === this.csvWidth.datasetKey) {
        const width: LineWidthDefinition = { ...this.vizDetails.display.width }
        width.columnName = column
        config.width = width
      }

      // COLORS
      if (dataset.datasetKey === this.csvData.datasetKey) {
        const color: LineColorDefinition = { ...this.vizDetails.display.color }
        color.columnName = column
        config.color = color
      }

      this.changeConfiguration(config)
    },
  },
  async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig ?? ''
    this.myState.subfolder = this.subfolder

    await this.getVizDetails()

    // default width is 250, why not
    this.scaleWidth = this.vizDetails.display?.width?.widthFactor || 250

    if (this.thumbnail) {
      this.buildThumbnail()
      return
    }

    // load network; when it is done it will call the loadCSVs afterwards.
    this.loadNetwork()

    // background layers
    try {
      this.backgroundLayers = new BackgroundLayers({
        vizDetails: this.vizDetails,
        fileApi: this.fileApi,
        subfolder: this.subfolder,
      })
      await this.backgroundLayers.initialLoad()
    } catch (e) {
      this.$emit('error', 'Error loading background layers')
    }
  },

  beforeDestroy() {
    this.resizer?.disconnect()
    // MUST delete the React view handle to prevent gigantic memory leak!

    try {
      for (const worker of this.dataLoaderWorkers) worker.terminate()
    } catch (e) {}

    this.$store.commit('setFullScreen', false)
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.link-volume-plot {
  background: url('assets/thumbnail.jpg') no-repeat;
  background-size: cover;
  min-height: $thumbnailHeight;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.link-volume-plot.hide-thumbnail {
  background: var(--bgMapPanel);
}

.plot-container {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto auto;
  pointer-events: none;
  flex: 1;
  position: relative;
}

.map-area {
  pointer-events: auto;
}

.top-panel {
  pointer-events: auto;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  background-color: var(--bgPanel);
  margin: 0 auto auto 0;
  padding: 0.5rem 1.5rem 1rem 1.5rem;
  z-index: 5;
  box-shadow: 0px 2px 10px #22222244;
}

.bottom-panel {
  grid-column: 1 / 3;
  grid-row: 2 / 3;
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: none;
  margin: auto 0.5rem 2px 7px;
  filter: drop-shadow(0px 2px 4px #22222233);
  z-index: 5;
}

.status-message {
  margin: 0 0 0.5rem 0;
  padding: 0.5rem 0.5rem;
  color: var(--textFancy);
  background-color: var(--bgPanel);
  font-size: 1.2rem;
  line-height: 1.5rem;
  z-index: 10;
}

.right-side {
  z-index: 1;
  display: flex;
  flex-direction: row;
  margin: 0 0 auto 0;
}

.panel-items {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.5rem;
  margin-bottom: 5px;
  width: 16rem;
  background-color: var(--bgPanel);
  border-radius: 3px;
  overflow: visible;
  pointer-events: auto;
}

.panel-item {
  h3 {
    line-height: 1.7rem;
  }

  p {
    font-size: 0.9rem;
  }
}

input {
  border: none;
  background-color: var(--bgCream2);
  color: var(--bgDark);
}

.toggle {
  margin: 0.25rem 0.5rem 0.25rem 0;
}

#dropdown-menu-color-selector {
  background-color: var(--bgBold);

  p {
    color: #888;
  }
}

.panel-item {
  margin-top: 0rem;
}

.config-section {
  flex: 1;
}

.diff-section {
  display: flex;
  flex-direction: row;
  margin-top: 0.7rem;

  p {
    margin: auto 0;
  }
}

.filter-panel {
  height: 6rem;
  background-color: var(--bgPanel);
  margin: 0rem auto 5px 0px;
  border-radius: 3px;
  // width: 100%;
}

@media only screen and (max-width: 640px) {
  .message-pane {
    padding: 0.5rem 0.5rem;
  }
}
</style>
