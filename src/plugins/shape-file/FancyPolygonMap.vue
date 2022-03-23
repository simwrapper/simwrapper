<template lang="pug">
.map-layout(:class="{'hide-thumbnail': !thumbnail}"
        :style='{"background": urlThumbnail}' oncontextmenu="return false")

  polygon-and-circle-map.choro-map(v-if="!thumbnail" :props="mapProps")
  zoom-buttons(v-if="isLoaded && !thumbnail")

  viz-configurator(v-if="isLoaded && !thumbnail"
    :sections="['fill']"
    :fileSystem="fileSystemConfig"
    :subfolder="subfolder"
    :yamlConfig="'dashboard-map.yaml'"
    :vizDetails="vizDetails"
    :datasets="datasets"
    @update="changeConfiguration")

  .config-bar(v-if="isLoaded && !thumbnail" :class="{'is-standalone': !configFromDashboard}")
    //- Column picker
    .filter(v-if="datasetValuesColumnOptions.length")
      p Display
      b-dropdown(v-model="datasetValuesColumn"
        aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
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
        multiple
        v-model="filters[filter].active"
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

    input.slider.is-small.is-fullwidth.is-primary(
      id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="5" type="range")

    .map-type-buttons
      img.img-button(@click="useCircles=false" src="../../assets/btn-polygons.jpg" title="Shapes")
      img.img-button(@click="useCircles=true" src="../../assets/btn-circles.jpg" title="Circles")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { group, zip, sum } from 'd3-array'
import * as turf from '@turf/turf'
import YAML from 'yaml'

import globalStore from '@/store'
import { DataTable, DataTableColumn, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import PolygonAndCircleMap from '@/plugins/shape-file/PolygonAndCircleMap.vue'
import VizConfigurator from '@/components/viz-configurator/VizConfigurator.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import { ColorDefinition } from '@/components/viz-configurator/Colors.vue'
import { FillDefinition } from '@/components/viz-configurator/Fill.vue'
import { WidthDefinition } from '@/components/viz-configurator/Widths.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'

interface FilterDetails {
  column: string
  label?: string
  options: any[]
  active: any[]
}

@Component({ components: { PolygonAndCircleMap, VizConfigurator, ZoomButtons } })
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

  private dataRows: DataTable = {}

  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private maxValue = 1000
  private expColors = false
  private isLoaded = false

  // private active = false

  // Filters. Key is column id; value array is empty for "all" or a list of "or" values
  private filters: { [column: string]: FilterDetails } = {}

  private generatedColors: string[] = ['#4e79a7']

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
    display: {
      fill: {} as any,
      color: {} as any,
      width: {} as any,
    },
  }

  private datasets: { [id: string]: DataTable } = {}

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
    }
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

      this.expColors = this.config.display?.fill?.exponentColors
      // convert values to arrays as needed
      this.config.display.fill.filters = this.convertCommasToArray(this.config.display.fill.filters)

      if (this.config.display.fill.values) {
        this.config.display.fill.values = this.convertCommasToArray(this.config.display.fill.values)
      }

      // load the boundaries and the dataset, use promises so we can clear
      // the spinner when things are finished
      await Promise.all([this.loadBoundaries(), this.loadDataset()])

      this.updateChart()
    } catch (e) {
      this.$store.commit('error', 'Mapview ' + e)
    }

    this.isLoaded = true
    this.$emit('isLoaded')
  }

  private beforeDestroy() {
    this.myDataManager.removeFilterListener(this.config, this.filterListener)
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

    // is this a bare geojson file? - build vizDetails manually
    if (/(\.geojson)(|\.gz)$/.test(filename)) {
      const title = 'GeoJSON: ' + filename

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

  private handleNewDataset(props: DatasetDefinition) {
    console.log('NEW dataset', props)
    const { key, dataTable, filename } = props

    const datasetId = key
    this.datasetFilename = filename || datasetId

    // figure out join - use ".join" or first column key
    this.datasetJoinColumn = Object.keys(dataTable)[0] || 'id'

    //TODO  add this dataset to the datamanager
    this.myDataManager.setPreloadedDataset({ key, dataTable, filename: this.datasetFilename })
    this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

    this.vizDetails.datasets[datasetId] = {
      file: this.datasetFilename,
      join: this.datasetJoinColumn,
    } as any
    this.vizDetails = Object.assign({}, this.vizDetails)

    this.dataRows = dataTable
    this.datasets[datasetId] = dataTable
    this.datasets = Object.assign({}, this.datasets)

    this.datasetValuesColumnOptions = Object.keys(dataTable)
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
        const joinCol = this.dataRows[this.datasetJoinColumn].values
        const dataValues = this.dataRows[this.datasetValuesColumn].values
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
        let lookupKey = boundary[joinShapesBy] || boundary.properties[joinShapesBy]
        if (!lookupKey) this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)

        const row = groupLookup.get(lookupKey)
        boundary.properties.value = row ? sum(row.map((v: any) => v[groupIndex])) : 'N/A'
        filteredBoundaries.push(boundary)
      })

      // centroids
      const filteredCentroids = [] as any[]
      this.centroids.forEach(centroid => {
        const centroidId = centroid.properties!.id
        if (!centroidId) return

        const row = groupLookup.get(centroidId)
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

    // shapes could be a string or a shape.file=blah
    let shapes: string = shapeConfig.file || shapeConfig

    try {
      if (shapes.startsWith('http')) {
        const boundaries = await fetch(shapes).then(async r => await r.json())
        this.boundaries = boundaries.features
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

  private datasetJoinColumn = ''
  private datasetFilename = ''

  private async loadDataset() {
    try {
      // for now just load first dataset
      const datasetId = Object.keys(this.config.datasets)[0]
      this.datasetFilename = this.config.datasets[datasetId].file
      const dataset = await this.myDataManager.getDataset({ dataset: this.datasetFilename })

      // figure out join - use ".join" or first column key
      this.datasetJoinColumn =
        this.config.datasets[datasetId].join || Object.keys(this.config.datasets[datasetId])[0]

      this.myDataManager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

      this.dataRows = dataset.allRows
      this.datasets[datasetId] = dataset.allRows
    } catch (e) {
      const message = '' + e
      console.log(message)
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
  }

  private filterLabel(filter: string) {
    const label = this.filters[filter].active.join(',').substring(0, 20) || 'Select...'
    return label
  }

  private async handleUserSelectedNewMetric() {
    await this.$nextTick()
    console.log('METRIC', this.datasetValuesColumn)

    this.maxValue = this.dataRows[this.datasetValuesColumn].max || 0
    console.log('MAXVALUE', this.maxValue)

    this.vizDetails.display.fill.columnName = this.datasetValuesColumn
    this.vizDetails = Object.assign({}, this.vizDetails)
    this.filterListener()
  }

  private handleUserSelectedNewFilters(column: string) {
    const active = this.filters[column].active
    this.myDataManager.setFilter(this.datasetFilename, column, active)
  }

  private datasetValuesColumn = ''
  private datasetValuesColumnOptions = [] as string[]

  private updateChart() {
    // dataRows come back as an object of columnName: values[].
    // We need to make a lookup of the values by ID, and then
    // insert those values into the boundaries geojson.

    if (!this.config.display || !this.config.datasets || !this.config.display.fill) return

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
    if (!valueColumns) throw Error(`Need to specify column for data values`)

    let datasetValuesCol = valueColumns[0] // TODO for now use first

    this.datasetValuesColumn = datasetValuesCol
    this.datasetValuesColumnOptions = valueColumns

    this.setupFilters()

    // 1. build the data lookup for each key in the dataset.
    //    There is often more than one row per key, so we will
    //    create an array for the group now, and (sum) them in step 2 below
    const joinCol = this.dataRows[datasetJoinCol].values
    const dataValues = this.dataRows[datasetValuesCol].values
    const groupLookup = group(zip(joinCol, dataValues), d => d[0]) // group by join key

    // 2. insert values into geojson
    this.boundaries.forEach(boundary => {
      // id can be in root of feature, or in properties
      let lookupValue = boundary[joinShapesBy]
      if (lookupValue == undefined) lookupValue = boundary.properties[joinShapesBy]

      if (lookupValue === undefined) {
        this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)
      }

      // SUM the values of the second elements of the zips from (1) above
      const row = groupLookup.get(lookupValue)
      boundary.properties.value = row ? sum(row.map(v => v[1])) : 'N/A'
    })

    this.maxValue = this.dataRows[datasetValuesCol].max || 0

    // 3. insert values into centroids
    this.centroids.forEach(centroid => {
      const centroidId = centroid.properties!.id
      if (!centroidId) return

      const row = groupLookup.get(centroidId)
      centroid.properties!.value = row ? sum(row.map(v => v[1])) : 'N/A'
    })

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
  filePatterns: ['**/viz-map*.y?(a)ml', '**/*.geojson?(.gz)'],
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

@media only screen and (max-width: 640px) {
}
</style>
