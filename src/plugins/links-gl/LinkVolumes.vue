<template lang="pug">
.link-volume-plot(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}'
        oncontextmenu="return false")

  .plot-container(v-if="!thumbnail")
    link-gl-layer.map-area(
        :links="geojsonData"
        :build="csvData"
        :base="csvBase"
        :colors="generatedColors"
        :widths="csvWidth"
        :dark="isDarkMode"
        :scaleWidth="scaleWidth"
        :showDiffs="showDiffs"
        :viewId="linkLayerId"
    )

    zoom-buttons(v-if="!thumbnail")
    drawing-tool(v-if="!thumbnail")

    viz-configurator(v-if="!thumbnail && isDataLoaded"
      :config="vizDetails"
      :datasets="datasets"
      :fileSystem="myState.fileSystem"
      :subfolder="myState.subfolder"
      @update="handleVizConfigurationChanged")

    .top-panel(v-if="vizDetails.title")
      .panel-item
        h3 {{ vizDetails.title }}
        p {{ vizDetails.description }}

    .bottom-panel(v-if="!thumbnail")
      .status-message(v-if="myState.statusMessage")
        p {{ myState.statusMessage }}

      .panel-items(v-show="csvWidth.activeColumn")

        //- button/dropdown for selecting column
        .panel-item.config-section
          selector-panel(
            :csvData="csvWidth"
            :activeColumn="csvWidth.activeColumn"
            :scaleWidth="scaleWidth"
            :useSlider="vizDetails.useSlider"
            :showDiffs="showDiffs"
            @colors="clickedColorRamp"
            @column="handleNewDataColumn"
            @slider="handleNewDataColumn"
            @scale="handleScaleWidthChanged"
          )

        //- DIFF checkbox
        .panel-item.diff-section(v-if="csvBase.dataTable._LINK_OFFSET_")
          toggle-button.toggle(:width="40" :value="showDiffs" :labels="false"
            :color="{checked: '#4b7cc4', unchecked: '#222'}"
            @change="showDiffs = !showDiffs")
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
import Papaparse from 'papaparse'
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

import DataFetcher from '@/workers/DataFetcher.worker.ts?worker'
import RoadNetworkLoader from '@/workers/RoadNetworkLoader.worker.ts?worker'

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

  private vizDetails = {
    title: '',
    description: '',
    csvFile: '',
    csvBase: '',
    datasets: {} as { [id: string]: string },
    useSlider: false,
    shpFile: '',
    dbfFile: '',
    network: '',
    geojsonFile: '',
    projection: '',
    widthFactor: null as any,
    thumbnail: '',
    sum: false,
  }

  private datasets: { [id: string]: DataTable } = {}

  private isButtonActiveColumn = false

  private linkLayerId = Math.random()

  private scaleWidth = 0
  private showDiffs = false
  private showTimeRange = false

  private geojsonData = { source: new Float32Array(), dest: new Float32Array() }

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

  private csvData: LookupDataset = { activeColumn: '', joinColumn: '', dataTable: {} }
  private csvBase: LookupDataset = { activeColumn: '', joinColumn: '', dataTable: {} }
  private csvWidth: LookupDataset = { activeColumn: '', joinColumn: '', dataTable: {} }

  private linkOffsetLookup: { [id: string]: number } = {}
  private numLinks = 0

  private isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
  private isDataLoaded = false

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

  private async getVizDetails() {
    const filename = this.myState.yamlConfig

    // are we in a dashboard?
    if (this.config) {
      this.vizDetails = Object.assign({}, this.config)
      return
    }

    // was a YAML file was passed in?
    if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
      this.vizDetails = await this.loadYamlConfig()
    }

    // is this a bare network file? - build vizDetails manually
    if (/(xml|geojson|geo\.json)(|\.gz)$/.test(filename)) {
      const title = 'Network: ' + this.myState.yamlConfig // .substring(0, 7 + this.myState.yamlConfig.indexOf('network'))

      this.vizDetails = Object.assign(this.vizDetails, {
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
    this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
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

  private clickedColorRamp(color: string) {
    // this.selectedColorRamp = color
  }

  private totalVizConfiguration: any = {}

  private handleVizConfigurationChanged(props: {
    color?: ColorDefinition
    width?: WidthDefinition
    dataset?: DatasetDefinition
  }) {
    console.log({ props })

    this.totalVizConfiguration = Object.assign(this.totalVizConfiguration, props)
    console.log({ totalVizConf: this.totalVizConfiguration })

    if (props['color']) this.handleNewColor(props.color)
    if (props['width']) this.handleNewWidth(props.width)
    if (props['dataset']) this.handleNewDataset(props.dataset)
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

  private handleScaleWidthChanged(value: number) {
    // TODO
    // this.scaleWidth = value
  }

  private handleNewWidth(width: WidthDefinition) {
    const { columnName, dataset, scaleFactor } = width
    if (!columnName) return

    if (scaleFactor !== undefined) this.scaleWidth = scaleFactor

    const selectedDataset = dataset ? this.datasets[dataset] : null // : this.csvWidth
    if (!selectedDataset) return

    // if (this.csvWidth !== selectedDataset) {
    //   this.csvWidth = selectedDataset
    //   this.csvWidth.activeColumn = -1
    // }

    const dataColumn = selectedDataset[columnName]
    if (!dataColumn) return

    // Tell Vue we have new data
    this.csvWidth = {
      dataTable: selectedDataset,
      activeColumn: columnName,
      joinColumn: LOOKUP_COLUMN,
    }
  }

  private handleNewColor(color: ColorDefinition) {
    this.generatedColors = color.generatedColors

    const columnName = color.columnName
    if (!columnName) {
      // this.csvData.activeColumn = ''
      return
    }

    const datasetKey = color.dataset
    const selectedDataset = this.datasets[datasetKey]
    if (!selectedDataset) return

    console.log(datasetKey, columnName)

    if (this.csvData.dataTable !== selectedDataset) {
      this.csvData = {
        dataTable: selectedDataset,
        activeColumn: '',
        joinColumn: LOOKUP_COLUMN,
      }
    }

    const column = this.csvData.dataTable[columnName]
    if (!column) return
    // if (column === this.csvData.activeColumn) return

    this.csvData.activeColumn = column.name
    this.csvBase.activeColumn = column.name

    this.isButtonActiveColumn = false
  }

  private async setMapCenter() {
    const data = this.geojsonData

    if (!data.source.length) return

    let samples = 0
    let longitude = 0
    let latitude = 0

    const numLinks = data.source.length / 2

    const gap = 2048
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
        zoom: 7,
        jump: false,
      })
    }
  }

  private async mounted() {
    this.$store.commit('setFullScreen', !this.thumbnail)

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.yamlConfig
    this.myState.subfolder = this.subfolder

    this.buildFileApi()

    await this.getVizDetails()

    // default width is 250, why not
    this.scaleWidth = this.vizDetails.widthFactor === undefined ? 250 : this.vizDetails.widthFactor

    if (this.thumbnail) {
      this.buildThumbnail()
      return
    }

    this.loadEverything()
  }

  private async loadEverything() {
    this.loadNetwork()
  }

  private networkWorker?: Worker

  private async loadNetwork(): Promise<any> {
    this.myState.statusMessage = 'Loading network...'
    this.linkOffsetLookup = {}
    this.numLinks = 0

    const filename = this.vizDetails.network || this.vizDetails.geojsonFile
    const networkPath = `/${this.myState.subfolder}/${filename}`

    this.networkWorker = new RoadNetworkLoader() as Worker

    this.networkWorker.onmessage = (buffer: MessageEvent) => {
      if (this.networkWorker) this.networkWorker.terminate()
      if (buffer.data.error) {
        this.myState.statusMessage = buffer.data.error
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `Error loading: ${networkPath}`,
        })
      } else {
        this.linkOffsetLookup = buffer.data.linkOffsetLookup
        this.geojsonData = buffer.data.links
        this.numLinks = this.geojsonData.source.length / 2

        console.log('links', this.geojsonData)

        // runs in background
        this.setMapCenter()

        this.myState.statusMessage = ''

        // then load CSVs in background
        this.loadCSVFiles()
      }
    }

    this.networkWorker.postMessage({ filePath: networkPath, fileSystem: this.myState.fileSystem })
  }

  private beforeDestroy() {
    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.linkLayerId]

    if (this.networkWorker) this.networkWorker.terminate()

    this.$store.commit('setFullScreen', false)
  }

  private handleNewDataset(props: DatasetDefinition) {
    console.log('NEW dataset', props)
    const { key, dataTable } = props

    // Create a LOOKUP column which links this CSV data to the network links
    const joinColumn: DataTableColumn = {
      name: LOOKUP_COLUMN,
      type: DataType.LOOKUP,
      values: [],
    }

    // For now we assume the 1st column always has the link ID
    const columnNames = Object.keys(dataTable)
    const assumedLinkIdIsFirstColumn = columnNames[0]
    const linkIdColumn = dataTable[assumedLinkIdIsFirstColumn]

    // do the lookup
    for (let i = 0; i < linkIdColumn.values.length; i++) {
      joinColumn.values[i] = this.linkOffsetLookup[linkIdColumn.values[i]]
    }

    // add the join column to the CSV dataset
    dataTable[LOOKUP_COLUMN] = joinColumn
    this.datasets = Object.assign({ ...this.datasets }, { [key]: dataTable })
    this.handleDatasetisLoaded(key)

    console.log({ datasets: this.datasets })
  }

  private loadCSVFiles() {
    this.myState.statusMessage = 'Loading datasets...'

    // Old yaml format listed csvFile and csvBase explicitly.
    // Merge those into vizDetails.datasets if they exist.
    if (!this.vizDetails.datasets) this.vizDetails.datasets = {}
    if (this.vizDetails.csvFile) this.vizDetails.datasets.csvFile = this.vizDetails.csvFile
    if (this.vizDetails.csvBase) this.vizDetails.datasets.csvBase = this.vizDetails.csvBase

    // Load files on workers, in parallel and off the main thread
    // Papaparse will call finishedLoadingCSV() for each when it's done loading & parsing
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
      dataTable: {
        [LOOKUP_COLUMN]: {
          name: LOOKUP_COLUMN,
          type: DataType.LOOKUP,
          values: [],
        },
      },
      activeColumn: LOOKUP_COLUMN,
      joinColumn: LOOKUP_COLUMN,
    }

    // there is no range(maxValue) in Javascript! :-(
    const length = Object.keys(this.linkOffsetLookup).length
    const lookup = [...Array(length).keys()]
    this.csvData.dataTable[LOOKUP_COLUMN].values = lookup

    this.myState.statusMessage = ''
    this.isDataLoaded = true
  }

  private async finishedLoadingCSV(key: string, dataTable: DataTable) {
    console.log('loaded', key)
    this.myState.statusMessage = 'Analyzing...'

    // const rowZero = parsed.data[0] as string[]
    // const header = rowZero.slice(1) // skip first column with link id's
    // if (this.vizDetails.useSlider) header.unshift(`${this.$t('all')}`)

    // const details: DataTable = {
    //   allLinks
    //   headerMax: this.vizDetails.useSlider ? new Array(header.length).fill(globalMax) : [],
    //   rows: allLinks,
    //   activeColumn: -1,
    // }

    this.datasets = Object.assign({ ...this.datasets }, { [key]: dataTable })
    this.handleNewDataset({ key, dataTable })
  }

  private handleDatasetisLoaded(datasetId: string) {
    const datasetKeys = Object.keys(this.datasets)

    //TODO: WHAT SHOULD ACTIVECOLUMN BE

    // first dataset
    if (datasetKeys.length === 1) {
      const firstColumnName = Object.values(this.datasets[datasetId])[0].name
      this.csvData = {
        dataTable: this.datasets[datasetId],
        activeColumn: firstColumnName,
        joinColumn: LOOKUP_COLUMN,
      }
    }

    // base dataset
    if (datasetId === 'csvBase' || datasetId === 'base') {
      this.csvBase = {
        dataTable: this.datasets[datasetId],
        activeColumn: '',
        joinColumn: LOOKUP_COLUMN,
      }
      this.showDiffs = true
    }

    // last dataset
    if (datasetKeys.length === Object.keys(this.vizDetails.datasets).length) {
      this.isDataLoaded = true
      this.myState.statusMessage = ''
      console.log({ DATASETS: this.datasets })
    }
  }

  private async loadOneCSVFile(key: string, filename: string) {
    if (!this.myState.fileApi) return

    const { files } = await this.myState.fileApi.getDirectory(this.myState.subfolder)

    const thread = new Promise<DataTable>((resolve, reject) => {
      const worker = new DataFetcher() as Worker
      try {
        worker.onmessage = e => {
          worker.terminate()
          resolve(e.data)
        }
        worker.postMessage({
          fileSystemConfig: this.myState.fileSystem,
          subfolder: this.myState.subfolder,
          files: files,
          config: { dataset: filename },
        })
      } catch (err) {
        worker.terminate()
        reject(err)
      }
    })

    const dataTable = await thread
    this.finishedLoadingCSV(key, dataTable)
  }

  private changedTimeSlider(value: any) {
    if (value.length && value.length === 1) value = value[0]

    // this.handleNewDataColumn(value)
  }

  private handleNewDataColumn(columnName: any) {
    console.log(columnName)

    const def: WidthDefinition = { columnName }
    this.handleNewWidth(def)
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
