<template lang="pug">
.map-layout(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .title-panel(v-if="vizDetails.title && !thumbnail && !configFromDashboard")
     h3 {{ vizDetails.title }}
     p {{ vizDetails.description }}

  .status-bar(v-show="statusText") {{ statusText }}

  geojson-layer.choro-map(v-if="!thumbnail"
    :viewId="layerId"
    :features="useCircles ? centroids : boundaries"
    :lineColors="dataLineColors"
    :lineWidths="dataLineWidths"
    :fillColors="dataFillColors"
    :opacity="sliderOpacity"
    :pointRadii="dataPointRadii"
    :screenshot="triggerScreenshot"
    :featureDataTable="boundaryDataTable"
    :tooltip="vizDetails.tooltip"
  )

  zoom-buttons(v-if="isLoaded && !thumbnail")

  modal-join-column-picker(v-if="datasetJoinSelector"
    :data1="datasetJoinSelector.data1"
    :data2="datasetJoinSelector.data2"
    @join="cbDatasetJoined"
  )

  viz-configurator(v-if="isLoaded && !thumbnail"
    :sections="['fill-color',  'line-color','line-width', 'circle-radius']"
    :fileSystem="fileSystemConfig"
    :subfolder="subfolder"
    :yamlConfig="generatedExportFilename"
    :vizDetails="vizDetails"
    :datasets="datasets"
    @update="changeConfiguration"
    @screenshot="takeScreenshot")

  .config-bar(v-if="!thumbnail"
    :class="{'is-standalone': !configFromDashboard, 'is-disabled': !isLoaded}")

    //- Column picker
    .filter(:disabled="!datasetValuesColumnOptions.length")
      p Display
      b-dropdown(v-model="datasetValuesColumn"
        aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
        :scrollable="datasetValuesColumnOptions.length > 10"
        max-height="250"
        @change="handleUserSelectedNewMetric"
      )
        template(#trigger="{ active }")
          b-button.is-warning(:label="datasetValuesColumn" :icon-right="active ? 'menu-up' : 'menu-down'")

        b-dropdown-item(v-for="option in datasetValuesColumnOptions"
          :key="option" :value="option" aria-role="listitem") {{ option }}

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

    //- Filter ADDers
    .filter(v-if="availableFilterColumns.length")
      p {{ Object.keys(filters).length ? "&nbsp;" : "Filter" }}
      b-dropdown(v-model="chosenNewFilterColumn"
        @change="handleUserCreatedNewFilter"
        :scrollable="availableFilterColumns.length > 10"
        max-height="250"
        aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
      )
        template(#trigger="{ active }")
          b-button.is-primary.is-outlined(
            label="+"
          )

        b-dropdown-item(v-for="option in availableFilterColumns"
          :key="option" :value="option" aria-role="listitem"
        ) {{ option }}

    .filter.right
      p Transparency
      input.slider.is-small.is-fullwidth.is-primary(
        id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="2.5" type="range")

    .map-type-buttons(v-if="isAreaMode")
      img.img-button(@click="showCircles(false)" src="../../assets/btn-polygons.jpg" title="Shapes")
      img.img-button(@click="showCircles(true)" src="../../assets/btn-circles.jpg" title="Circles")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
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

import ColorWidthSymbologizer from '@/js/ColorWidthSymbologizer'
import GeojsonLayer from './GeojsonLayer'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ModalJoinColumnPicker from './ModalJoinColumnPicker.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import { arrayBufferToBase64 } from '@/js/util'
import { CircleRadiusDefinition } from '@/components/viz-configurator/CircleRadius.vue'
import { FillColorDefinition } from '@/components/viz-configurator/FillColors.vue'
import { LineColorDefinition } from '@/components/viz-configurator/LineColors.vue'
import { LineWidthDefinition } from '@/components/viz-configurator/LineWidths.vue'
// import { FillDefinition } from '@/components/viz-configurator/FillColors.vue'
// import { WidthDefinition } from '@/components/viz-configurator/Widths.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import Coords from '@/js/Coords'

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
}

@Component({
  components: { ModalJoinColumnPicker, GeojsonLayer, VizConfigurator, ZoomButtons } as any,
})
export default class VueComponent extends Vue {
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: false }) configFromDashboard!: any
  @Prop({ required: false }) datamanager!: DashboardDataManager
  @Prop({ required: false }) yamlConfig!: string
  @Prop({ required: false }) thumbnail!: boolean
  @Prop({ required: true }) root!: string
  @Prop({ required: false }) fsConfig!: FileSystemConfig

  private fileApi!: HTTPFileSystem
  private fileSystemConfig!: FileSystemConfig

  private boundaries: any[] = []
  private centroids: any[] = []
  private cbDatasetJoined: any

  private chosenNewFilterColumn = ''
  private availableFilterColumns: string[] = []

  private boundaryDataTable: DataTable = {}

  private dataFillColors: string | Uint8Array = '#59a14f'
  private dataLineColors: string | Uint8Array = ''
  private dataLineWidths: number | Float32Array = 2
  private dataPointRadii: number | Float32Array = 5

  private layerId = Math.random()

  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private maxValue = 1000
  private expColors = false
  private isLoaded = false
  private isAreaMode = true
  private statusText = 'Loading...'

  // private active = false

  // Filters. Key is column id; value array is empty for "all" or a list of "or" values
  private filters: { [column: string]: FilterDetails } = {}

  private generatedColors: string[] = ['#4e79a7']

  private datasetJoinSelector: { [id: string]: { title: string; columns: string[] } } | null = null

  private vizDetails = {
    title: '',
    description: '',
    datasets: {} as { [id: string]: string },
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
    shapes: '' as string | { file: string; join: string },
    zoom: null as number | null,
    center: null as any[] | null,
    display: {
      fill: {} as any,
      color: {} as any,
      width: {} as any,
      lineColor: {} as any,
      lineWidth: {} as any,
      radius: {} as any,
    },
    tooltip: [] as string[],
  }

  private datasets: { [id: string]: DataTable } = {}

  // incrementing screenshot count triggers the screenshot.
  private triggerScreenshot = 0
  private takeScreenshot() {
    this.triggerScreenshot++
  }

  private get generatedExportFilename() {
    let filename = Sanitize(this.yamlConfig + '-1')
    filename = filename.replaceAll(' ', ' ')

    return `viz-map-${filename}.yaml`
  }

  private myDataManager!: DashboardDataManager

  private config: any = {}

  private async mounted() {
    try {
      this.buildFileApi()

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      this.myDataManager = this.datamanager || new DashboardDataManager(this.root, this.subfolder)

      await this.getVizDetails()
      this.buildThumbnail()
      if (this.thumbnail) return

      if (this.needsInitialMapExtent && (this.vizDetails.center || this.vizDetails.zoom)) {
        this.$store.commit('setMapCamera', {
          center: this.vizDetails.center,
          zoom: this.vizDetails.zoom || 9,
          bearing: 0,
          pitch: 0,
          longitude: this.vizDetails.center ? this.vizDetails.center[0] : 0,
          latitude: this.vizDetails.center ? this.vizDetails.center[1] : 0,
        })
        this.needsInitialMapExtent = false
      }

      this.expColors = this.config.display?.fill?.exponentColors

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

      this.isLoaded = true
      this.$emit('isLoaded')

      // this.datasets = Object.assign({}, this.datasets)
      await this.loadDataset()

      // Check URL query parameters
      this.honorQueryParameters()

      // Finally, update the view
      // this.updateChart()

      this.datasets = Object.assign({}, this.datasets)
      this.config.datasets = Object.assign({}, this.datasets)
      // this.vizDetails.datasets = this.datasets
      this.vizDetails = Object.assign({}, this.vizDetails)

      this.statusText = ''
    } catch (e) {
      this.$store.commit('error', 'Mapview ' + e)
    }
  }

  private beforeDestroy() {
    this.myDataManager.removeFilterListener(this.config, this.filterListener)

    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.layerId]
    this.$store.commit('setFullScreen', false)
  }

  @Watch('$store.state.viewState') viewMoved() {
    if (!REACT_VIEW_HANDLES[this.layerId]) return
    REACT_VIEW_HANDLES[this.layerId]()
  }

  private honorQueryParameters() {
    const query = this.$route.query
    if (query.show == 'dots') this.useCircles = true
  }

  private convertCommasToArray(thing: any): any[] {
    if (thing === undefined) return []
    if (Array.isArray(thing)) return thing

    if (thing.indexOf(',') > -1) {
      thing = thing.split(',').map((f: any) => f.trim())
    } else {
      thing = [thing.trim()]
    }
    return thing
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
  }

  private async getVizDetails() {
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
      const filename = this.yamlConfig

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
  }

  private async buildThumbnail() {
    if (!this.fileApi) return

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

  public buildFileApi() {
    const filesystem = this.fsConfig || this.getFileSystem(this.root)
    this.fileApi = new HTTPFileSystem(filesystem)
    this.fileSystemConfig = filesystem
  }

  private async loadYamlConfig() {
    if (!this.fileApi) return {}

    const filename =
      this.yamlConfig.indexOf('/') > -1 ? this.yamlConfig : this.subfolder + '/' + this.yamlConfig

    // 1. First try loading the file directly
    try {
      const text = await this.fileApi.getFileText(filename)
      return YAML.parse(text)
    } catch (err) {
      console.log(`${filename} not found, trying config folders`)
    }

    // 2. Try loading from a config folder instead
    const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
    if (vizes[this.yamlConfig]) {
      try {
        const text = await this.fileApi.getFileText(vizes[this.yamlConfig])
        return YAML.parse(text)
      } catch (err) {
        console.error(`Also failed to load ${vizes[this.yamlConfig]}`)
      }
    }
    this.$store.commit('error', 'Could not load YAML: ' + filename)
  }

  /**
   * changeConfiguration: is the main entry point for changing the viz model.
   * anything that wants to change colors, widths, data, anthing like that
   * should all pass through this function so the underlying data model
   * is modified properly.
   */
  private changeConfiguration(props: {
    fill?: FillColorDefinition
    dataset?: DatasetDefinition
    lineColor?: LineColorDefinition
    lineWidth?: LineWidthDefinition
    radius?: CircleRadiusDefinition
  }) {
    console.log('props', props)

    try {
      if (props['fill']) {
        this.vizDetails.display.fill = props.fill
        this.handleNewFillColor(props.fill)
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
      console.log('DONE updating')
    } catch (e) {
      this.$store.commit('error', '' + e)
    }
  }

  private async handleNewDataset(props: DatasetDefinition) {
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
      this.cbDatasetJoined = (join: string[]) => {
        this.datasetJoinSelector = null
        resolve(join)
      }
    })

    if (!join.length) return

    const [dataJoinColumn, featureJoinColumn] = join
    this.setupJoin(dataTable, datasetId, dataJoinColumn, featureJoinColumn)

    this.figureOutRemainingFilteringOptions()
  }

  private setupJoin(
    dataTable: DataTable,
    datasetId: string,
    dataJoinColumn: string,
    featureJoinColumn: string
  ) {
    console.log('setup join')
    // make sure columns exist!
    if (!this.boundaryDataTable[featureJoinColumn])
      throw Error(`Geodata does not have property ${featureJoinColumn}`)
    if (!dataTable[dataJoinColumn])
      throw Error(`Dataset ${datasetId} does not have column ${dataJoinColumn}`)

    // create lookup column and write lookup offsets
    const lookupColumn: DataTableColumn = { type: DataType.LOOKUP, values: [], name: '@' }

    const dataValues = dataTable[dataJoinColumn].values
    const boundaryOffsets = this.getBoundaryOffsetLookup(featureJoinColumn)

    console.log('retrieving lookup values:', featureJoinColumn, dataJoinColumn)

    // if user wants specific tooltips based on this dataset, save the values
    const tips = this.vizDetails.tooltip || []
    const relevantTips = tips
      .filter(tip => tip.substring(0, tip.indexOf(':')).startsWith(datasetId))
      .map(tip => {
        return [tip, tip.substring(1 + tip.indexOf(':'))]
      })
    console.log({ relevantTips })

    for (let i = 0; i < dataValues.length; i++) {
      const featureOffset = boundaryOffsets[dataValues[i]]
      lookupColumn.values[i] = featureOffset
      for (const tip of relevantTips) {
        const feature = this.boundaries[featureOffset]
        const value = dataTable[tip[1]]
        if (feature && value) feature.properties[tip[0]] = value
      }
    }

    console.log({ boundaries: this.boundaries })
    // add this dataset to the datamanager
    dataTable['@'] = lookupColumn
    this.myDataManager.setPreloadedDataset({
      key: datasetId,
      dataTable,
      filename: this.datasetFilename,
    })
    this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

    this.vizDetails.datasets[datasetId] = {
      file: this.datasetFilename,
      // if join columns are not named identically, use "this:that" format
      join:
        featureJoinColumn === dataJoinColumn
          ? featureJoinColumn
          : `${featureJoinColumn}:${dataJoinColumn}`,
    } as any

    console.log('triggering updates')

    this.vizDetails = Object.assign({}, this.vizDetails)

    this.datasets[datasetId] = dataTable
    this.datasets = Object.assign({}, this.datasets)
  }

  private boundaryJoinLookups: { [column: string]: { [lookup: string | number]: number } } = {}

  private getBoundaryOffsetLookup(joinColumn: string) {
    // return it if we already built it
    if (this.boundaryJoinLookups[joinColumn]) return this.boundaryJoinLookups[joinColumn]

    // build it
    this.statusText = 'Joining datasets...'
    console.log('building lookup for', joinColumn)

    this.boundaryJoinLookups[joinColumn] = {}
    const lookupValues = this.boundaryJoinLookups[joinColumn]

    const boundaryLookupColumnValues = this.boundaryDataTable[joinColumn].values

    for (let i = 0; i < this.boundaries.length; i++) {
      lookupValues[boundaryLookupColumnValues[i]] = i
    }
    return lookupValues
  }

  private figureOutRemainingFilteringOptions() {
    this.datasetValuesColumnOptions = Object.keys(this.boundaryDataTable)
    const existingFilterColumnNames = Object.keys(this.filters)
    const columns = Array.from(this.datasetValuesColumnOptions).filter(
      f => f !== this.datasetJoinColumn && existingFilterColumnNames.indexOf(f) === -1
    )
    this.availableFilterColumns = columns
  }

  // private handleNewFill(fill: FillDefinition) {
  //   this.generatedColors = fill.generatedColors

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

  private handleNewFillColor(fill: FillColorDefinition) {
    const color = fill
    this.generatedColors = color.generatedColors

    const columnName = color.columnName
    if (columnName) {
      // Get the data column
      const datasetKey = color.dataset || ''
      const selectedDataset = this.datasets[datasetKey]

      if (selectedDataset) {
        const dataColumn = selectedDataset[columnName]
        if (!dataColumn)
          throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
        const lookupColumn = selectedDataset['@']

        // Figure out the normal
        let normalColumn
        if (color.normalize) {
          const keys = color.normalize.split(':')
          console.log({ keys, datasets: this.datasets })
          if (!this.datasets[keys[0]] || !this.datasets[keys[0]][keys[1]])
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          normalColumn = this.datasets[keys[0]][keys[1]]
          console.log({ normalColumn })
        }

        // Calculate colors for each feature
        console.log('Updating fills...')
        const calculatedColors = ColorWidthSymbologizer.getColorsForDataColumn({
          length: this.boundaries.length,
          data: dataColumn,
          normalize: normalColumn,
          lookup: lookupColumn,
          options: color,
        })
        this.dataFillColors = calculatedColors
      }
    } else {
      // simple color
      console.log('WHHOPS')
      this.dataFillColors = color.generatedColors[0]
    }
  }

  private handleNewLineColor(color: LineColorDefinition) {
    try {
      this.generatedColors = color.generatedColors

      const columnName = color.columnName
      if (columnName) {
        const datasetKey = color.dataset || ''
        const selectedDataset = this.datasets[datasetKey]
        if (selectedDataset) {
          const lookupColumn = selectedDataset['@']
          const dataColumn = selectedDataset[columnName]
          if (!dataColumn)
            throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
          // Calculate colors for each feature
          console.log('update lines...')
          const calculatedColors = ColorWidthSymbologizer.getColorsForDataColumn({
            length: this.boundaries.length,
            data: dataColumn,
            lookup: lookupColumn,
            options: color,
          })
          this.dataLineColors = calculatedColors
        }
      } else {
        // simple color
        this.dataLineColors = color.generatedColors[0]
      }
    } catch (e) {
      console.error('' + e)
    }
  }

  private handleNewLineWidth(width: LineWidthDefinition) {
    const columnName = width.columnName
    if (columnName) {
      // Get the data column
      const datasetKey = width.dataset || ''
      const selectedDataset = this.datasets[datasetKey]
      if (selectedDataset) {
        const dataColumn = selectedDataset[columnName]
        if (!dataColumn)
          throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
        const lookupColumn = selectedDataset['@']
        // Calculate widths for each feature
        console.log('update line widths...')
        const calculatedWidths = ColorWidthSymbologizer.getWidthsForDataColumn({
          length: this.boundaries.length,
          data: dataColumn,
          lookup: lookupColumn,
          options: width,
        })
        this.dataLineWidths = calculatedWidths
      }
    } else {
      // simple width
      this.dataLineWidths = 1
    }
    // this.filterListener()
  }

  private handleNewRadius(radius: CircleRadiusDefinition) {
    const columnName = radius.columnName
    if (columnName) {
      // Get the data column
      const datasetKey = radius.dataset || ''
      const selectedDataset = this.datasets[datasetKey]
      if (selectedDataset) {
        const dataColumn = selectedDataset[columnName]
        if (!dataColumn)
          throw Error(`Dataset ${datasetKey} does not contain column "${columnName}"`)
        const lookupColumn = selectedDataset['@']
        // Calculate radius for each feature
        const calculatedRadius = ColorWidthSymbologizer.getRadiusForDataColumn({
          length: this.boundaries.length,
          data: dataColumn,
          lookup: lookupColumn,
          options: radius,
        })
        this.dataPointRadii = calculatedRadius
      }
    } else {
      // simple width
      this.dataPointRadii = 5
    }

    // this.filterListener()
  }

  private async handleMapClick(click: any) {
    try {
      const { x, y, data } = click.points[0]

      const filter = this.config.groupBy
      const value = x

      // this.datamanager.setFilter(this.config.dataset, filter, value)
    } catch (e) {
      console.error(e)
    }
  }

  private async filterListener() {
    try {
      console.log(11, this.datasetFilename)
      let { filteredRows } = await this.myDataManager.getFilteredDataset({
        dataset: this.datasetFilename,
      })
      // console.log(12, filteredRows)

      let groupLookup: any // this will be the map of boundary IDs to rows
      let groupIndex: any = 1 // unfiltered values will always be element 1 of [key, values[]]

      if (!filteredRows) {
        // is filter UN-selected? Rebuild full dataset
        const joinCol = this.boundaryDataTable[this.datasetJoinColumn].values
        const dataValues = this.boundaryDataTable[this.datasetValuesColumn].values
        groupLookup = group(zip(joinCol, dataValues), d => d[0]) // group by join key
      } else {
        // group filtered values by lookup key
        groupLookup = group(filteredRows, d => d[this.datasetJoinColumn])
        groupIndex = this.datasetValuesColumn // index is values column name
      }

      // ok we have a filter, let's update the geojson values
      let joinShapesBy = 'id'
      if (this.config.shapes?.join) joinShapesBy = this.config.shapes.join

      const filteredBoundaries = [] as any[]

      this.boundaries.forEach(boundary => {
        // id can be in root of feature, or in properties
        let lookupKey = boundary.properties[joinShapesBy] || boundary[joinShapesBy]
        if (!lookupKey) this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)

        // the groupy thing doesn't auto-convert between strings and numbers
        let row = groupLookup.get(lookupKey)
        if (row == undefined) row = groupLookup.get('' + lookupKey)

        // do we have an answer
        boundary.properties.value = row ? sum(row.map((v: any) => v[groupIndex])) : 'N/A'
        filteredBoundaries.push(boundary)
      })

      // centroids
      const filteredCentroids = [] as any[]
      this.centroids.forEach(centroid => {
        const centroidId = centroid.properties!.id
        if (!centroidId) return

        let row = groupLookup.get(centroidId)
        if (row == undefined) row = groupLookup.get('' + centroidId)
        centroid.properties!.value = row ? sum(row.map((v: any) => v[groupIndex])) : 'N/A'
        filteredCentroids.push(centroid)
      })

      this.boundaries = filteredBoundaries
      this.centroids = filteredCentroids
    } catch (e) {
      console.error('' + e)
    }
  }

  private async loadBoundaries() {
    const shapeConfig = this.config.boundaries || this.config.shapes || this.config.geojson
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
        featureProperties.push(b.properties || {})
        b.properties = {}

        // check if we have linestrings: network mode!
        if (
          hasNoLines &&
          (b.geometry.type == 'LineString' || b.geometry.type == 'MultiLineString')
        ) {
          hasNoLines = false
        }

        // check if we have polygons: shapefile mode!
        if (hasNoPolygons && (b.geometry.type == 'Polygon' || b.geometry.type == 'MultiPolygon')) {
          hasNoPolygons = false
        }
      })

      // set feature properties as a data source
      await this.setFeaturePropertiesAsDataSource(filename, featureProperties)

      // turn ON line borders if it's NOT a big dataset (user can re-enable)
      if (!hasNoLines || boundaries.length < 5000) {
        this.dataLineColors = '#4e79a7'
      }

      // hide polygon/point buttons and opacity if we have no polygons
      if (hasNoPolygons) this.isAreaMode = false

      // generate centroids if we have polygons
      if (!hasNoPolygons) this.generateCentroidsAndMapCenter()

      this.boundaries = boundaries
    } catch (e) {
      console.error(e)
      this.$store.commit('error', '' + e)
      throw Error(`Could not load "${filename}"`)
    }

    if (!this.boundaries) throw Error(`"features" not found in shapes file`)
  }

  private async setFeaturePropertiesAsDataSource(filename: string, featureProperties: any[]) {
    const dataTable = await this.myDataManager.setFeatureProperties(filename, featureProperties)
    this.boundaryDataTable = dataTable

    const datasetId = filename.substring(1 + filename.lastIndexOf('/'))
    this.datasets[datasetId] = dataTable

    this.vizDetails.datasets[datasetId] = {
      file: datasetId,
      join: this.datasetJoinColumn,
    } as any

    this.config.datasets = Object.assign({}, this.vizDetails.datasets)
    console.log(333, this.vizDetails)

    // this.datasetFilename = datasetId

    // this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

    // this.vizDetails = Object.assign({}, this.vizDetails)

    // this.datasets = Object.assign({}, this.datasets)

    // this.figureOutRemainingFilteringOptions()
  }

  private async generateCentroidsAndMapCenter() {
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
  }

  private async loadShapefileFeatures(filename: string) {
    if (!this.fileApi) return []

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

    // next, see if there is a .prj file with projection information
    let projection = DEFAULT_PROJECTION
    try {
      projection = await this.fileApi.getFileText(url.replace('.shp', '.prj'))
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

    if (this.needsInitialMapExtent && !this.$store.state.viewState.latitude) {
      // if we don't have a user-specified map center/zoom, focus on the shapefile itself
      function getFirstPoint(thing: any): any[] {
        if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
        else return [thing[0], thing[1]]
      }
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
        jump: true,
      })
      this.needsInitialMapExtent = false
    }

    return geojson.features as any[]
  }

  private needsInitialMapExtent = true

  private datasetJoinColumn = ''
  private datasetFilename = ''

  private async loadDataset() {
    try {
      // for now just load first dataset
      const datasetId = Object.keys(this.config.datasets)[0]
      console.log({ datasetId })
      if (!datasetId) return

      // dataset could be  { dataset: myfile.csv }
      //               or  { dataset: { file: myfile.csv, join: TAZ }}

      this.datasetFilename =
        'string' === typeof this.config.datasets[datasetId]
          ? this.config.datasets[datasetId]
          : this.config.datasets[datasetId].file

      this.statusText = `Loading dataset ${this.datasetFilename} ...`
      await this.$nextTick()

      console.log(11, 'loading ' + this.datasetFilename)
      const dataset = await this.myDataManager.getDataset({ dataset: this.datasetFilename })
      console.log(12, 'got it', dataset)

      // figure out join - use ".join" or first column key
      const joiner =
        'string' === typeof this.config.datasets[datasetId]
          ? Object.keys(dataset.allRows)[0]
          : this.config.datasets[datasetId].join

      const joinColumns = joiner.split(':')
      if (joinColumns.length == 1) joinColumns.push(joinColumns[0])

      this.datasets[datasetId] = dataset.allRows

      // link the joins if we have a join
      this.statusText = `Joining datasets...`
      await this.$nextTick()

      if (joinColumns[0]) {
        this.setupJoin(this.datasets[datasetId], datasetId, joinColumns[1], joinColumns[0])
      }

      this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

      this.figureOutRemainingFilteringOptions()
    } catch (e) {
      const msg = '' + e
      console.error(msg)
      this.$store.commit('error', msg)
    }
    return []
  }

  private setupFilters() {
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
      this.myDataManager.setFilter(this.datasetFilename, column, this.filters[column].active)
    }

    this.figureOutRemainingFilteringOptions()
  }

  private filterLabel(filter: string) {
    const label = this.filters[filter].active.join(',').substring(0, 20) || 'Select...'
    return label
  }

  private async handleUserSelectedNewMetric() {
    await this.$nextTick()
    console.log('METRIC', this.datasetValuesColumn)

    const query = Object.assign({}, this.$route.query)
    query.display = this.datasetValuesColumn
    this.$router.replace({ query })

    this.maxValue = this.boundaryDataTable[this.datasetValuesColumn].max || 0
    console.log('MAXVALUE', this.maxValue)

    this.vizDetails.display.fill.columnName = this.datasetValuesColumn
    this.vizDetails = Object.assign({}, this.vizDetails)
    this.filterListener()
  }

  private handleUserSelectedNewFilters(column: string) {
    const active = this.filters[column].active
    this.myDataManager.setFilter(this.datasetFilename, column, active)

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
  }

  private showCircles(show: boolean) {
    this.useCircles = show

    const query = Object.assign({}, this.$route.query)
    if (show) query.show = 'dots'
    else delete query.show
    this.$router.replace({ query })
  }

  private async handleUserCreatedNewFilter() {
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
  }

  private datasetValuesColumn = ''
  private datasetValuesColumnOptions = [] as string[]

  private updateChart() {
    // boundaryDataTable come back as an object of columnName: values[].
    // We need to make a lookup of the values by ID, and then
    // insert those values into the boundaries geojson.

    console.log('HERE I AM')
    console.log(this.config)
    console.log(this.datasets)
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
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'area-map',
  prettyName: 'Area Map',
  description: 'Area Map',
  filePatterns: [
    // viz-map plugin
    '**/viz-map*.y?(a)ml',
    // raw geojson files
    '**/*.geojson?(.gz)',
    // shapefiles too
    '**/*.shp',
  ],
  component: VueComponent,
} as VisualizationPlugin)
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

.choro-map {
  position: relative;
  z-index: -1;
  flex: 1;
}

.config-bar {
  display: flex;
  flex-direction: row;
  padding-top: 0.25rem;
  background-color: var(--bgBold);
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
