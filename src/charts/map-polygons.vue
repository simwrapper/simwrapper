<template lang="pug">
.map-layout
  polygon-and-circle-map.choro-map(:props="mapProps")
  zoom-buttons

  viz-configurator(v-if="isLoaded"
    :sections="['fill']"
    :fileSystem="fileSystemConfig"
    :subfolder="subfolder"
    :yamlConfig="'dashboard-map.yaml'"
    :vizDetails="vizDetails"
    :datasets="datasets"
    @update="changeConfiguration")

  .config-bar
    img.img-button(@click="useCircles=false" src="../assets/btn-polygons.jpg" title="Shapes")
    img.img-button(@click="useCircles=true" src="../assets/btn-circles.jpg" title="Circles")

    .filter(v-for="filter in Object.keys(filters)")
      p: b {{ filter }}
      b-dropdown(
        multiple
        v-model="filters[filter].active"
        @change="handleUserSelectedNewFilters(filter)"
        aria-role="list" position="is-top-right" :mobile-modal="false" :close-on-click="true"
      )
        template(#trigger="{ active }")
          b-button.is-primary.is-outlined(
            :label="filterLabel(filter)"
            :icon-right="active ? 'menu-up' : 'menu-down'"
          )

        b-dropdown-item(v-for="option in filters[filter].options" :value="option" aria-role="listitem") {{ option }}

    input.slider.is-small.is-fullwidth.is-danger(
      id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="5" type="range")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { group, zip, sum } from 'd3-array'
import * as turf from '@turf/turf'

import { DataTable, DataTableColumn, FileSystemConfig } from '@/Globals'
import PolygonAndCircleMap from '@/components/PolygonAndCircleMap.vue'
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
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop({ required: true }) datamanager!: DashboardDataManager

  private fileApi!: HTTPFileSystem
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

  private async mounted() {
    try {
      this.expColors = this.config.display?.fill?.exponentColors

      this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
      // bulmaSlider.attach()

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
    this.datamanager.removeFilterListener(this.config, this.filterListener)
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

  private handleNewDataset(dataset: DatasetDefinition) {}

  private handleNewFill(fill: FillDefinition) {
    this.generatedColors = fill.generatedColors

    const columnName = fill.columnName
    if (!columnName) {
      // this.csvData.activeColumn = ''
      return
    }

    const datasetKey = fill.dataset
    const selectedDataset = this.datasets[datasetKey]
    if (!selectedDataset) return

    // if (this.csvData.dataTable !== selectedDataset) {
    //   this.csvData = {
    //     dataTable: selectedDataset,
    //     activeColumn: '',
    //     csvRowFromLinkRow: this.csvRowLookupFromLinkRow[datasetKey],
    //   }
    // }

    // const column = this.csvData.dataTable[columnName]
    // if (!column) return
    // // if (column === this.csvData.activeColumn) return

    // this.csvData.activeColumn = column.name
    // this.csvBase.activeColumn = column.name

    // this.isButtonActiveColumn = false
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
      const { filteredRows } = await this.datamanager.getFilteredDataset({
        dataset: this.datasetFilename,
      })

      // is filter UN-selected?
      if (!filteredRows) return

      // group values by lookup key
      const groupLookup = group(filteredRows, d => d[this.datasetJoinColumn])

      // ok we have a filter, let's update the geojson values
      let joinShapesBy = 'id'
      if (this.config.shapes?.join) joinShapesBy = this.config.shapes.join

      const filteredBoundaries = [] as any[]
      this.boundaries.forEach(boundary => {
        // id can be in root of feature, or in properties
        let lookupKey = boundary[joinShapesBy] || boundary.properties[joinShapesBy]
        if (!lookupKey) this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)

        const row = groupLookup.get(lookupKey)
        boundary.properties.value = row ? sum(row.map(v => v[this.datasetValuesColumn])) : 'N/A'
        filteredBoundaries.push(boundary)
      })

      // centroids
      const filteredCentroids = [] as any[]
      this.centroids.forEach(centroid => {
        const centroidId = centroid.properties!.id
        if (!centroidId) return

        const row = groupLookup.get(centroidId)
        centroid.properties!.value = row ? sum(row.map(v => v[this.datasetValuesColumn])) : 'N/A'
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
    this.generateCentroids()
  }

  private generateCentroids() {
    const idField = this.config.shapes.join || 'id'

    for (const feature of this.boundaries) {
      const centroid = turf.centerOfMass(feature as any)
      if (!centroid.properties) centroid.properties = {}

      if (feature.properties[this.config.boundariesLabel]) {
        centroid.properties.label = feature.properties[this.config.boundariesLabel]
      }

      centroid.properties.id = feature.properties[idField]
      if (centroid.properties.id === undefined) centroid.properties.id = feature[idField]

      this.centroids.push(centroid)
    }
  }

  private datasetJoinColumn = ''
  private datasetFilename = ''

  private async loadDataset() {
    try {
      // for now just load first dataset
      const datasetId = Object.keys(this.config.datasets)[0]
      this.datasetFilename = this.config.datasets[datasetId].file
      const dataset = await this.datamanager.getDataset({ dataset: this.datasetFilename })

      // figure out join - use ".join" or first column key
      this.datasetJoinColumn =
        this.config.datasets[datasetId].join || Object.keys(this.config.datasets[datasetId])[0]

      this.datamanager.addFilterListener({ dataset: this.datasetFilename }, this.filterListener)

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

    // Get the set of filters from array / string / list
    if (!Array.isArray(filterColumns)) {
      if (filterColumns.indexOf(',') > -1) {
        filterColumns = filterColumns.split(',').map((f: any) => f.trim())
      } else {
        filterColumns = [filterColumns.trim()]
      }
    }

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

  private handleUserSelectedNewFilters(column: string) {
    const active = this.filters[column].active

    this.$forceUpdate()
    this.datamanager.setFilter(this.datasetFilename, column, active[0])
  }

  private datasetValuesColumn = ''

  private updateChart() {
    // dataRows come back as an object of columnName: values[].
    // We need to make a lookup of the values by ID, and then
    // insert those values into the boundaries geojson.

    if (!this.config.display || !this.config.datasets || !this.config.display.fill) return

    let joinShapesBy = 'id'

    if (this.config.shapes?.join) joinShapesBy = this.config.shapes.join
    // throw Error('Need "join" property to link shapes to datasets')

    const datasetJoinCol = this.datasetJoinColumn // used to be this.config.display.fill.join
    if (!datasetJoinCol) throw Error(`Cannot find column ${datasetJoinCol}`)

    // value columns can be a string; a string,with,commas; or an array
    let valueColumns = this.config.display.fill.values
    let datasetValuesCol = valueColumns

    // figure out first (only?) data column to be displayed
    if (Array.isArray(valueColumns)) {
      datasetValuesCol = valueColumns[0] // TODO for now
    } else if (valueColumns.indexOf(',') > -1) {
      valueColumns = valueColumns.split(',').map((f: any) => f.trim())
      datasetValuesCol = valueColumns[0] // TODO for now
    }

    if (!datasetValuesCol) throw Error(`Need to specify column for data values`)
    this.datasetValuesColumn = datasetValuesCol

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

      // sum the values of the second elements of the zips from (1) above
      const row = groupLookup.get(lookupValue)
      boundary.properties.value = row ? sum(row.map(v => v[1])) : 'N/A'
    })

    this.maxValue = this.dataRows[datasetValuesCol].max || 0

    let centerLong = 0
    let centerLat = 0

    // 3. insert values into centroids
    this.centroids.forEach(centroid => {
      centerLong += centroid.geometry.coordinates[0]
      centerLat += centroid.geometry.coordinates[1]

      const centroidId = centroid.properties!.id
      if (!centroidId) return

      const row = groupLookup.get(centroidId)
      centroid.properties!.value = row ? sum(row.map(v => v[1])) : 'N/A'
    })

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

    // sort them so big bubbles are below small bubbles
    this.centroids = this.centroids.sort((a: any, b: any) =>
      a.properties.value > b.properties.value ? -1 : 1
    )
    this.activeColumn = 'value'
  }
}
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
}

.choro-map {
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

  .img-button {
    margin-top: auto;
    margin-right: 0.15rem;
    height: 2.3rem;
    width: 2.3rem;
    border: var(--borderThin);
    border-radius: 4px;
  }
  .img-button:hover {
    border: 2px solid var(--linkHover);
  }
}

.filter {
  margin-left: 0.5rem;
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.filter p {
  margin: -0.25rem 0 0 0;
}

@media only screen and (max-width: 640px) {
}
</style>
