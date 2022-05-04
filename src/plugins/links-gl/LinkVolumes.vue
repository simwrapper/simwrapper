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
    )

    zoom-buttons(v-if="!thumbnail")
    drawing-tool(v-if="!thumbnail")

    //- color/width/etc panel
    viz-configurator(v-if="!thumbnail && isDataLoaded"
      :vizDetails="vizDetails"
      :datasets="datasets"
      :fileSystem="myState.fileSystem"
      :subfolder="myState.subfolder"
      :yamlConfig="yamlConfig"
      @update="changeConfiguration")

    .top-panel(v-if="vizDetails.title")
      .panel-item
        h3 {{ vizDetails.title }}
        p {{ vizDetails.description }}

    .bottom-panel(v-if="!thumbnail")
      .status-message(v-if="myState.statusMessage")
        p {{ myState.statusMessage }}

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
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { ToggleButton } from 'vue-js-toggle-button'
import { rgb } from 'd3-color'
import { scaleThreshold, scaleOrdinal } from 'd3-scale'
import { shallowEqualObjects } from 'shallow-equal'

import readBlob from 'read-blob'
import YAML from 'yaml'

import globalStore from '@/store'
import { DataTableColumn, DataTable, DataType, LookupDataset } from '@/Globals'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import TimeSlider from './TimeSlider.vue'
// import FilterPanel from './BadFilterPanel.vue'
import SelectorPanel from './SelectorPanel.vue'
import LinkGlLayer from './LinkLayer'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

// import AttributeCalculator from './attributeCalculator.worker.ts?worker'

import {
  ColorScheme,
  FileSystem,
  FileSystemConfig,
  VisualizationPlugin,
  Status,
  REACT_VIEW_HANDLES,
} from '@/Globals'

import { ColorDefinition } from '@/components/viz-configurator/Colors.vue'
import { WidthDefinition } from '@/components/viz-configurator/Widths.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import DashboardDataManager from '@/js/DashboardDataManager'

const LOOKUP_COLUMN = '_LINK_OFFSET_'

@Component({
  i18n,
  components: {
    CollapsiblePanel,
    SelectorPanel,
    DrawingTool,
    // FilterPanel,
    LinkGlLayer,
    TimeSlider,
    ToggleButton,
    VizConfigurator,
    ZoomButtons,
  } as any,
})
class MyPlugin extends Vue {
  @Prop({ required: true }) root!: string
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: false }) yamlConfig!: string
  @Prop({ required: false }) config!: any
  @Prop({ required: false }) thumbnail!: boolean
  @Prop({ required: false }) datamanager!: DashboardDataManager

  // this contains the display settings for this view; it is the View Model.
  // use changeConfiguration to modify this for now (todo: move to state model)
  private vizDetails = {
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
    display: {
      color: {} as any,
      width: {} as any,
    },
  }

  private datasets: { [id: string]: DataTable } = {}

  private isButtonActiveColumn = false

  private linkLayerId = Math.random()

  private scaleWidth = 0
  private showTimeRange = false

  private geojsonData = {
    source: new Float32Array(),
    dest: new Float32Array(),
    linkIds: [] as any[],
  }

  private generatedColors: string[] = ['#4e79a7']

  // private timeFilterColumns: number[] = []

  public myState = {
    statusMessage: '',
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private csvData: LookupDataset = {
    datasetKey: '',
    activeColumn: '',
    dataTable: {},
    csvRowFromLinkRow: [],
  }
  private csvBase: LookupDataset = {
    datasetKey: '',
    activeColumn: '',
    dataTable: {},
    csvRowFromLinkRow: [],
  }
  private csvWidth: LookupDataset = {
    datasetKey: '',
    activeColumn: '',
    dataTable: {},
    csvRowFromLinkRow: [],
  }
  private csvWidthBase: LookupDataset = {
    datasetKey: '',
    activeColumn: '',
    dataTable: {},
    csvRowFromLinkRow: [],
  }

  // private linkOffsetLookup: { [id: string]: number } = {}
  private numLinks = 0

  private isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
  private isDataLoaded = false

  private setDataIsLoaded() {
    this.isDataLoaded = true
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

  private get colorRampType() {
    const rampType = this.vizDetails.display.color?.colorRamp?.style
    if (rampType === undefined) return -1
    return rampType
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

  private async getVizDetails() {
    const filename = this.myState.yamlConfig

    const emptyState = {
      showDifferences: false,
      datasets: {} as any,
      display: { color: {} as any, width: {} as any },
    }

    // are we in a dashboard?
    if (this.config) {
      this.vizDetails = Object.assign({}, emptyState, this.config)
      return
    }

    // was a YAML file was passed in?
    if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
      this.vizDetails = Object.assign({}, emptyState, await this.loadYamlConfig())
    }

    // is this a bare network file? - build vizDetails manually
    if (/(xml|geojson|geo\.json)(|\.gz)$/.test(filename)) {
      const title = 'Network: ' + this.myState.yamlConfig // .substring(0, 7 + this.myState.yamlConfig.indexOf('network'))

      this.vizDetails = Object.assign({}, this.vizDetails, {
        network: this.myState.yamlConfig,
        title,
        description: this.myState.subfolder,
      })
    }

    const t = this.vizDetails.title ? this.vizDetails.title : 'Network Links'
    this.$emit('title', t)
  }

  private async loadYamlConfig() {
    if (!this.myState.fileApi) return {}

    try {
      const filename =
        this.myState.yamlConfig.indexOf('/') > -1
          ? this.myState.yamlConfig
          : this.myState.subfolder + '/' + this.myState.yamlConfig

      const text = await this.myState.fileApi.getFileText(filename)
      return YAML.parse(text)
    } catch (err) {
      console.error('failed')
      const e = err as any
      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.needPassword && e.status === 401) {
        this.$store.commit('requestLogin', this.myState.fileSystem.slug)
      }
    }
  }

  private async buildThumbnail() {
    if (!this.myState.fileApi) return

    if (this.thumbnail && this.vizDetails.thumbnail) {
      try {
        const blob = await this.myState.fileApi.getFileBlob(
          this.myState.subfolder + '/' + this.vizDetails.thumbnail
        )
        const buffer = await readBlob.arraybuffer(blob)
        const base64 = this.arrayBufferToBase64(buffer)
        if (base64)
          this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
      } catch (e) {
        console.error(e)
      }
    }
  }

  @Watch('$store.state.viewState') viewMoved() {
    if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
    REACT_VIEW_HANDLES[this.linkLayerId]()
  }

  @Watch('$store.state.colorScheme') private swapTheme() {
    setTimeout(
      () => (this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode),
      100
    )
  }

  private arrayBufferToBase64(buffer: any) {
    var binary = ''
    var bytes = new Uint8Array(buffer)
    var len = bytes.byteLength
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  private get buttonTitle() {
    return this.csvData.activeColumn || 'Loading...'
  }

  private toggleShowDiffs() {
    this.vizDetails.showDifferences = !this.vizDetails.showDifferences
  }

  /**
   * changeConfiguration: is the main entry point for changing the viz model.
   * anything that wants to change colors, widths, data, anthing like that
   * should all pass through this function so the underlying data model
   * is modified properly.
   */
  private changeConfiguration(props: {
    color?: ColorDefinition
    width?: WidthDefinition
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
  }

  private handleNewFilter(columns: number[]) {
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
  }

  private currentWidthDefinition: WidthDefinition = { columnName: '' }

  private handleNewWidth(width: WidthDefinition) {
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
      this.csvWidth.activeColumn = columnName
      // this.csvWidthBase.dataTable = selectedDataset
      this.csvWidthBase.activeColumn = columnName
    }

    const dataColumn = selectedDataset[columnName]
    if (!dataColumn) return

    // Tell Vue we have new data
    this.csvWidth = {
      datasetKey: dataset || this.csvWidth.datasetKey,
      dataTable: selectedDataset,
      activeColumn: columnName,
      csvRowFromLinkRow: dataset ? this.csvRowLookupFromLinkRow[dataset] : [],
    }
    this.generateWidthArray()
  }

  private handleNewColor(color: ColorDefinition) {
    this.generatedColors = color.generatedColors

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
    if (!column) return
    // if (column === this.csvData.activeColumn) return

    this.csvData.activeColumn = column.name
    this.csvBase.activeColumn = column.name

    this.isButtonActiveColumn = false
    this.generateColorArray()
  }

  private async setMapCenter() {
    const data = this.geojsonData
    if (this.vizDetails.center) {
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
      return
    }

    if (!data.source.length) return

    let samples = 0
    let longitude = 0
    let latitude = 0

    const numLinks = data.source.length / 2

    const gap = 4096
    for (let i = 0; i < numLinks; i += gap) {
      longitude += data.source[i * 2]
      latitude += data.source[i * 2 + 1]
      samples++
    }

    longitude = longitude / samples
    latitude = latitude / samples

    console.log('center', longitude, latitude)

    if (longitude && latitude) {
      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        bearing: 0,
        pitch: 0,
        zoom: 9,
        jump: false,
      })
    }
  }

  private myDataManager!: DashboardDataManager

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()

    // DataManager might be passed in from the dashboard; or we might be
    // in single-view mode, in which case we need to create one for ourselves
    this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)

    await this.getVizDetails()

    // default width is 250, why not
    this.scaleWidth = this.vizDetails.display?.width?.widthFactor || 250

    if (this.thumbnail) {
      this.buildThumbnail()
      return
    }

    // load network; when it is done it will call the loadCSVs afterwards.
    this.loadNetwork()
  }

  private networkWorker?: Worker

  private async loadNetwork(): Promise<any> {
    this.myState.statusMessage = 'Loading network...'

    const filename = this.vizDetails.network || this.vizDetails.geojsonFile || this.vizDetails.nodes
    const networkPath = `/${this.myState.subfolder}/${filename}`

    try {
      const network = await this.myDataManager.getRoadNetwork(
        filename,
        this.myState.subfolder,
        this.vizDetails
      )

      this.numLinks = network.linkIds.length
      this.geojsonData = network

      this.setMapCenter() // this could be off main thread

      this.myState.statusMessage = ''

      this.$emit('isLoaded', true)
      // this.setDataIsLoaded()

      // then load CSVs in background
      this.loadCSVFiles()
    } catch (e) {
      this.$store.commit('error', `Could not load ${networkPath}`)
      this.$emit('isLoaded')
    }
  }

  private dataLoaderWorkers: Worker[] = []

  private beforeDestroy() {
    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.linkLayerId]

    if (this.networkWorker) this.networkWorker.terminate()
    for (const worker of this.dataLoaderWorkers) worker.terminate()

    this.$store.commit('setFullScreen', false)
  }

  private csvRowLookupFromLinkRow: { [datasetId: string]: number[] } = {}

  private handleNewDataset(props: DatasetDefinition) {
    console.log('NEW dataset', props)
    const { key, dataTable, filename } = props

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
    for (let linkRow = 0; linkRow < this.geojsonData.linkIds.length; linkRow++) {
      const linkId = this.geojsonData.linkIds[linkRow]
      const csvRow = tempMapLinkIdToCsvRow[linkId]
      if (csvRow !== undefined) getCsvRowNumberFromLinkRowNumber[linkRow] = csvRow
    }

    // Save the lookup with the dataset.
    this.csvRowLookupFromLinkRow[key] = getCsvRowNumberFromLinkRowNumber
    tempMapLinkIdToCsvRow = {} // probably unnecessary but we def want this to be GC'ed

    // all done!
    if (filename) this.vizDetails.datasets[key] = filename
    this.datasets = Object.assign({ ...this.datasets }, { [key]: dataTable })
    this.handleDatasetisLoaded(key)
  }

  @Watch('vizDetails.showDifferences')
  private generateWidthArray() {
    const numLinks = this.geojsonData.linkIds.length
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
  }

  @Watch('vizDetails.showDifferences')
  private generateColorArray() {
    // deck.gl colors must be in rgb[] or rgba[] format
    const colorsAsRGB: any = this.generatedColors.map(hexcolor => {
      const c = rgb(hexcolor)
      return [c.r, c.g, c.b, 255]
    })

    // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
    // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
    // An exponent reduces visual dominance of very large values at the high end of the scale
    const exponent = 4.0
    const domain = new Array(this.generatedColors.length - 1)
      .fill(0)
      .map((v, i) => Math.pow((1 / this.generatedColors.length) * (i + 1), exponent))

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

    const numLinks = this.geojsonData.linkIds.length
    const colors = new Uint8Array(4 * numLinks)

    const colorPaleGrey = globalStore.state.isDarkMode ? [80, 80, 80, 96] : [212, 212, 212, 40]
    const colorInvisible = [0, 0, 0, 0]

    const color = (i: number) => {
      // if (!buildData[this.csvData.activeColumn]) return colorPaleGrey

      const csvRow = this.csvData.csvRowFromLinkRow[i]
      let value = buildData[this.csvData.activeColumn]?.values[csvRow]

      if (this.generatedColors.length === 1) return colorsAsRGB[0]
      if (!value) return colorInvisible
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
  }

  private loadCSVFiles() {
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
  }

  private showSimpleNetworkWithNoDatasets() {
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

    const color: ColorDefinition = {
      generatedColors: this.generatedColors,
      dataset: '',
      columnName: '',
    }
    this.changeConfiguration({ color })
  }

  private handleDatasetisLoaded(datasetId: string) {
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
      console.log({ DATASETS: this.datasets })
    }
  }

  private colorArray: Uint8Array = new Uint8Array()
  private widthArray: Float32Array = new Float32Array()

  private async loadOneCSVFile(key: string, filename: string) {
    if (!this.myState.fileApi) return

    try {
      const dataset = await this.myDataManager.getDataset({ dataset: filename })
      const dataTable = dataset.allRows

      console.log('loaded', key)
      this.myState.statusMessage = 'Analyzing...'

      // remove columns without names; we can't use them
      const cleanTable: DataTable = {}
      for (const key of Object.keys(dataTable)) {
        if (key) cleanTable[key] = dataTable[key]
      }

      this.datasets = Object.assign({ ...this.datasets }, { [key]: cleanTable })
      this.handleNewDataset({ key, dataTable: cleanTable })
    } catch (e) {
      this.$store.commit('error', 'Could not load ' + filename)
      this.$emit('isLoaded')
    }
  }

  private handleNewDataColumn(value: { dataset: LookupDataset; column: string }) {
    const { dataset, column } = value

    // selector is attached to a dataset. Both color and width could be
    // impacted, if they are attached to that dataset.

    const config: any = {}

    // WIDTHS
    if (dataset.datasetKey === this.csvWidth.datasetKey) {
      const width: WidthDefinition = { ...this.vizDetails.display.width }
      width.columnName = column
      config.width = width
    }

    // COLORS
    if (dataset.datasetKey === this.csvData.datasetKey) {
      const color: ColorDefinition = { ...this.vizDetails.display.color }
      color.columnName = column
      config.color = color
    }

    this.changeConfiguration(config)
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'links-gl',
  prettyName: 'Links',
  description: 'Network link attributes',
  filePatterns: [
    '**/*output_network.xml?(.gz)',
    '**/*network.geo?(.)json?(.gz)',
    '**/viz-gl-link*.y?(a)ml',
    '**/viz-link*.y?(a)ml',
  ],
  component: MyPlugin,
} as VisualizationPlugin)

export default MyPlugin
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
  pointer-events: auto;
  margin: auto 0.5rem 0rem 5px;
  filter: drop-shadow(0px 2px 4px #22222233);
}

.status-message {
  margin: 0 auto 0.5rem 0;
  padding: 0.5rem 0.5rem;
  color: var(--textFancy);
  background-color: var(--bgPanel);
  font-size: 1.5rem;
  line-height: 1.8rem;
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
  // overflow-x: hidden;
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
