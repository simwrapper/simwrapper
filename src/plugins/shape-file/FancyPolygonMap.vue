<template lang="pug">
.map-layout(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  .title-panel(v-if="vizDetails.title && !thumbnail")
     h3 {{ vizDetails.title }}
     p {{ vizDetails.description }}

  .status-bar(v-if="statusText") {{ statusText }}

  polygon-and-circle-map.choro-map(v-if="!thumbnail"
    :props="mapProps"
    :screenshot="screenshotNotifier"
  )

  zoom-buttons(v-if="isLoaded && !thumbnail")

  modal-join-column-picker(v-if="datasetJoinSelector"
    :data1="datasetJoinSelector.data1"
    :data2="datasetJoinSelector.data2"
    @join="datasetJoined"
  )

  viz-configurator(v-if="isLoaded && !thumbnail"
    :sections="['fill']"
    :fileSystem="fileSystemConfig"
    :subfolder="subfolder"
    :yamlConfig="generatedExportFilename"
    :vizDetails="vizDetails"
    :datasets="datasets"
    @update="changeConfiguration"
    @screenshot="takeScreenshot")

  .config-bar(v-if="isLoaded && !thumbnail" :class="{'is-standalone': !configFromDashboard}")
    //- Column picker
    .filter(v-if="datasetValuesColumnOptions.length")
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

    input.slider.is-small.is-fullwidth.is-primary(
      id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="5" type="range")

    .map-type-buttons
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
import { DataTable, DataTableColumn, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import PolygonAndCircleMap from '@/plugins/shape-file/PolygonAndCircleMap.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ModalJoinColumnPicker from './ModalJoinColumnPicker.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import { arrayBufferToBase64 } from '@/js/util'
import { ColorDefinition } from '@/components/viz-configurator/Colors.vue'
import { FillDefinition } from '@/components/viz-configurator/Fill.vue'
import { WidthDefinition } from '@/components/viz-configurator/Widths.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import Coords from '@/js/Coords'

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
}

@Component({
  components: { ModalJoinColumnPicker, PolygonAndCircleMap, VizConfigurator, ZoomButtons },
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

  private chosenNewFilterColumn = ''
  private availableFilterColumns: string[] = []

  private dataRows: DataTable = {}

  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private maxValue = 1000
  private expColors = false
  private isLoaded = false
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
    display: {
      fill: {} as any,
      color: {} as any,
      width: {} as any,
    },
  }

  private datasets: { [id: string]: DataTable } = {}

  private screenshotNotifier = ''
  private takeScreenshot() {
    this.screenshotNotifier += '1'
  }

  private get mapProps() {
    return {
      useCircles: this.useCircles,
      data: this.useCircles ? this.centroids : this.boundaries,
      dark: this.$store.state.isDarkMode,
      colors: this.generatedColors,
      activeColumn: this.activeColumn,
      maxValue: this.maxValue,
      opacity: this.sliderOpacity,
      expColors: this.expColors,
      screenshotCallback: this.screenshotNotifier,
    }
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

      this.expColors = this.config.display?.fill?.exponentColors

      // convert values to arrays as needed
      this.config.display.fill.filters = this.convertCommasToArray(this.config.display.fill.filters)

      if (this.config.display.fill.values) {
        this.config.display.fill.values = this.convertCommasToArray(this.config.display.fill.values)
      }

      // load the boundaries and the dataset, use promises so we can clear
      // the spinner when things are finished
      await Promise.all([this.loadBoundaries(), this.loadDataset()])

      // Check URL query parameters
      this.honorQueryParameters()

      // Finally, update the view
      this.updateChart()
      this.statusText = ''
    } catch (e) {
      this.$store.commit('error', 'Mapview ' + e)
    }

    this.isLoaded = true
    this.$emit('isLoaded')
  }

  private beforeDestroy() {
    this.myDataManager.removeFilterListener(this.config, this.filterListener)
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
      return
    }

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

    try {
      const filename =
        this.yamlConfig.indexOf('/') > -1 ? this.yamlConfig : this.subfolder + '/' + this.yamlConfig

      const text = await this.fileApi.getFileText(filename)
      return YAML.parse(text)
    } catch (err) {
      console.error('failed')
      const e = err as any
    }
  }

  /**
   * changeConfiguration: is the main entry point for changing the viz model.
   * anything that wants to change colors, widths, data, anthing like that
   * should all pass through this function so the underlying data model
   * is modified properly.
   */
  private changeConfiguration(props: {
    fill?: FillDefinition
    width?: WidthDefinition
    dataset?: DatasetDefinition
  }) {
    console.log(props)

    if (props['fill']) {
      this.vizDetails = Object.assign({}, this.vizDetails)
      this.vizDetails.display.fill = props.fill
      this.handleNewFill(props.fill)
    }
    if (props['dataset']) {
      // vizdetails just had the string name, whereas props.dataset contains
      // a fully-build DatasetDefinition, so let's just handle that
      this.handleNewDataset(props.dataset)
    }
  }

  private async handleNewDataset(props: DatasetDefinition) {
    const { key, dataTable, filename } = props

    const datasetId = key
    this.datasetFilename = filename || datasetId

    // ask user for the join columns
    const join: any[] = await new Promise((resolve, reject) => {
      const boundaryProperties = new Set()
      if (this.boundaries[0].id) boundaryProperties.add('id')
      Object.keys(this.boundaries[0].properties).forEach(key => boundaryProperties.add(key))

      this.datasetJoinSelector = {
        data1: { title: key, columns: Object.keys(dataTable) },
        data2: { title: 'Boundaries', columns: Array.from(boundaryProperties) as string[] },
      }
      this.datasetJoined = (join: string[]) => {
        this.datasetJoinSelector = null
        resolve(join)
      }
    })

    if (!join.length) return

    this.datasetJoinColumn = join[0] || Object.keys(dataTable)[0] || 'id'

    // hard-code copy of id column into shapefile feature IDs, for later lookup
    for (const [i, taz] of this.boundaries.entries()) {
      if (join[1] in taz.properties) {
        taz.id = taz.properties[join[1]]
        this.centroids[i].properties.id = taz.id
      }
    }

    //TODO  add this dataset to the datamanager
    this.myDataManager.setPreloadedDataset({ key, dataTable, filename: this.datasetFilename })
    this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

    this.vizDetails.datasets[datasetId] = {
      file: this.datasetFilename,
      join: this.datasetJoinColumn,
    } as any

    // update shapefile join column
    if (typeof this.vizDetails.shapes === 'string') {
      this.vizDetails.shapes = { file: this.vizDetails.shapes, join: join[1] }
    } else {
      this.vizDetails.shapes.join = join[1]
    }

    this.vizDetails = Object.assign({}, this.vizDetails)

    this.dataRows = dataTable
    this.datasets[datasetId] = dataTable
    this.datasets = Object.assign({}, this.datasets)

    this.figureOutRemainingFilteringOptions()
  }

  private datasetJoined: any

  private figureOutRemainingFilteringOptions() {
    this.datasetValuesColumnOptions = Object.keys(this.dataRows)
    const existingFilterColumnNames = Object.keys(this.filters)
    const columns = Array.from(this.datasetValuesColumnOptions).filter(
      f => f !== this.datasetJoinColumn && existingFilterColumnNames.indexOf(f) === -1
    )
    this.availableFilterColumns = columns
  }

  private handleNewFill(fill: FillDefinition) {
    this.generatedColors = fill.generatedColors

    const columnName = fill.columnName

    if (columnName) {
      const datasetKey = fill.dataset
      const selectedDataset = this.datasets[datasetKey]
      if (selectedDataset) {
        this.activeColumn = 'value'
        this.datasetValuesColumn = columnName
      }
    }

    this.filterListener()
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
      let { filteredRows } = await this.myDataManager.getFilteredDataset({
        dataset: this.datasetFilename,
      })

      let groupLookup: any // this will be the map of boundary IDs to rows
      let groupIndex: any = 1 // unfiltered values will always be element 1 of [key, values[]]

      if (!filteredRows) {
        // is filter UN-selected? Rebuild full dataset
        // console.log('11', this.datasetJoinColumn, this.dataRows)
        const joinCol = this.dataRows[this.datasetJoinColumn].values
        // console.log('12')
        const dataValues = this.dataRows[this.datasetValuesColumn].values
        // console.log('13')
        groupLookup = group(zip(joinCol, dataValues), d => d[0]) // group by join key
        // console.log(14, groupLookup)
      } else {
        // console.log('bb')
        // group filtered values by lookup key
        groupLookup = group(filteredRows, d => d[this.datasetJoinColumn])
        // console.log('cc')
        groupIndex = this.datasetValuesColumn // index is values column name
        // console.log('dd', groupIndex)
      }

      // ok we have a filter, let's update the geojson values
      let joinShapesBy = 'id'
      if (this.config.shapes?.join) joinShapesBy = this.config.shapes.join

      // console.log('a', joinShapesBy)
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
      // console.log('b')

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
      // console.log('c')

      this.boundaries = filteredBoundaries
      this.centroids = filteredCentroids
      // console.log(123, this.boundaries)
    } catch (e) {
      console.error('' + e)
    }
  }

  private async loadBoundaries() {
    const shapeConfig = this.config.boundaries || this.config.shapes || this.config.geojson
    if (!shapeConfig) return

    // shapes could be a string or an object: shape.file=blah
    let shapes: string = shapeConfig.file || shapeConfig

    try {
      this.statusText = 'Loading shapes...'

      if (shapes.startsWith('http')) {
        const boundaries = await fetch(shapes).then(async r => await r.json())
        this.boundaries = boundaries.features
      } else if (shapes.endsWith('.shp')) {
        // shapefile!
        const boundaries = await this.loadShapefileFeatures(shapes)
        this.boundaries = boundaries
      } else {
        const boundaries = await this.fileApi.getFileJson(`${this.subfolder}/${shapes}`)
        this.boundaries = boundaries.features
      }
    } catch (e) {
      console.warn(e)
      throw Error(`Could not load "${shapes}"`)
    }
    if (!this.boundaries) throw Error(`"features" not found in shapes file`)
    this.generateCentroidsAndMapCenter()
  }

  private generateCentroidsAndMapCenter() {
    this.statusText = 'Calculating centroids...'
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

    this.$store.commit('setMapCamera', {
      longitude: centerLong,
      latitude: centerLat,
      bearing: 0,
      pitch: 0,
      zoom: 8,
      initial: true,
    })
  }

  private async loadShapefileFeatures(filename: string) {
    if (!this.fileApi) return []

    this.statusText = 'Loading shapefile...'
    console.log('loading shapefile', filename)

    const url = `${this.subfolder}/${filename}`

    console.log(url)
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

    // next, see if there is a .prj file with projection information
    let projection = ''
    try {
      projection = await this.fileApi.getFileText(url.replace('.shp', '.prj'))
    } catch (e) {
      // lol we can live without a projection
    }

    const guessCRS = Coords.guessProjection(projection)

    // then, reproject if we have a .prj file
    if (guessCRS) {
      this.statusText = 'Projecting coordinates...'
      await this.$nextTick()
      geojson = reproject.toWgs84(geojson, guessCRS, EPSGdefinitions)
    }

    return geojson.features as any[]

    // const bbox: any = geojson.bbox

    // const header = Object.keys(geojson.features[0].properties)
    // const shapefile = { data: geojson.features, prj: projection, header, bbox }

    // this.$store.commit('setMapCamera', {
    //   longitude: 0.5 * (bbox[2] + bbox[0]),
    //   latitude: 0.5 * (bbox[3] + bbox[1]),
    //   bearing: 0,
    //   pitch: 0,
    //   zoom: 8,
    //   jump: true,
    // })
    // done! show the first column
    // this.handleNewDataColumn(this.shapefile.header[0])
  }

  private datasetJoinColumn = ''
  private datasetFilename = ''

  private async loadDataset() {
    try {
      // for now just load first dataset
      const datasetId = Object.keys(this.config.datasets)[0]
      // dataset could be  { dataset: myfile.csv }
      //               or  { dataset: { file: myfile.csv, join: TAZ }}
      this.datasetFilename =
        'string' === typeof this.config.datasets[datasetId]
          ? this.config.datasets[datasetId]
          : this.config.datasets[datasetId].file

      this.statusText = `Loading dataset ${this.datasetFilename} ...`

      const dataset = await this.myDataManager.getDataset({ dataset: this.datasetFilename })

      // figure out join - use ".join" or first column key
      this.datasetJoinColumn =
        'string' === typeof this.config.datasets[datasetId]
          ? Object.keys(dataset.allRows)[0]
          : this.config.datasets[datasetId].join

      this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

      this.dataRows = dataset.allRows
      this.datasets[datasetId] = dataset.allRows

      this.figureOutRemainingFilteringOptions()
    } catch (e) {
      const message = '' + e
      console.error(message)
    }
    return []
  }

  private setupFilters() {
    let filterColumns = this.config.display.fill.filters
    if (!filterColumns) return

    // Get the set of options available for each filter
    filterColumns.forEach((f: string) => {
      let options = [...new Set(this.dataRows[f].values)]
      this.filters[f] = { column: f, label: f, options, active: [] }
    })

    // perhaps we have some active filters in the URL query
    const columnNames = Object.keys(this.dataRows)
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

    this.maxValue = this.dataRows[this.datasetValuesColumn].max || 0
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
    let options = [...new Set(this.dataRows[f].values)]
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
    // dataRows come back as an object of columnName: values[].
    // We need to make a lookup of the values by ID, and then
    // insert those values into the boundaries geojson.

    if (!this.config.display || !this.config.datasets || !this.config.display.fill) return

    this.statusText = 'Calculating...'

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
    const joinCol = this.dataRows[datasetJoinCol].values
    const dataValues = this.dataRows[datasetValuesCol].values
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

    // this.maxValue = max // this.dataRows[datasetValuesCol].max || 0
    this.maxValue = this.dataRows[datasetValuesCol].max || 0

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
  filePatterns: ['**/viz-map*.y?(a)ml', '**/*.geojson?(.gz)', '**/*.shp'],
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
  // position: relative;
  z-index: -1;
  flex: 1;
}

.config-bar {
  display: flex;
  flex-direction: row;
  padding-top: 0.25rem;

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
  padding: 0.75rem 1rem;
  font-size: 1.1rem;
  border: 1px solid var(--);
}

@media only screen and (max-width: 640px) {
}
</style>
