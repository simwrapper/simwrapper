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
    img.img-button(@click="useCircles=false"
                   src="../assets/btn-polygons.jpg"
                   title="Shapes")

    img.img-button(@click="useCircles=true"
                   src="../assets/btn-circles.jpg"
                   title="Circles")

    input.slider.is-small.is-fullwidth.is-danger(
      id="sliderOpacity" min="0" max="100" v-model="sliderOpacity" step="5" type="range")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import bulmaSlider from 'bulma-slider'
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
    this.datamanager.removeFilterListener(this.config, this.handleFilterChanged)
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

      this.datamanager.setFilter(this.config.dataset, filter, value)
    } catch (e) {
      console.error(e)
    }
  }

  private async handleFilterChanged() {
    console.log('CHANGED FILTER')
    // try {
    //   const { filteredRows } = await this.datamanager.getFilteredDataset(this.config)

    //   // is filter UN-selected?
    //   if (!filteredRows) {
    //     this.data = [this.data[0]]
    //     this.data[0].opacity = 1.0
    //     return
    //   }

    //   const fullDataCopy = Object.assign({}, this.data[0])

    //   fullDataCopy.x = filteredRows.x
    //   fullDataCopy.y = filteredRows.y
    //   fullDataCopy.opacity = 1.0
    //   fullDataCopy.name = 'Filtered'
    //   //@ts-ignore - let plotly manage bar colors EXCEPT the filter
    //   fullDataCopy.marker = { color: '#ffaf00' } // 3c6' }

    //   this.data = [this.data[0], fullDataCopy]
    //   this.data[0].opacity = 0.3
    //   this.data[0].name = 'All'
    // } catch (e) {
    //   const message = '' + e
    //   console.log(message)
    //   this.dataRows = {}
    // }
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

  private async loadDataset() {
    try {
      // for now just load first dataset
      const datasetId = Object.keys(this.config.datasets)[0]
      const datasetFilename = this.config.datasets[datasetId].file
      const dataset = await this.datamanager.getDataset({ dataset: datasetFilename })

      // figure out join - use ".join" or first column key
      this.datasetJoinColumn =
        this.config.datasets[datasetId].join || Object.keys(this.config.datasets[datasetId])[0]

      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

      this.dataRows = dataset.allRows
      this.datasets[datasetId] = dataset.allRows
    } catch (e) {
      const message = '' + e
      console.log(message)
    }
    return []
  }

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

    // 1. build the offset lookup
    const lookup: any = {}
    const joinCol = this.dataRows[datasetJoinCol].values
    for (let i = 0; i < joinCol.length; i++) {
      lookup[joinCol[i]] = i // lookup in geojson will be the offset
    }

    // 2. insert values into geojson
    this.boundaries.forEach(boundary => {
      // id can be in root of feature, or in properties
      let lookupValue = boundary[joinShapesBy]
      if (lookupValue == undefined) lookupValue = boundary.properties[joinShapesBy]

      if (lookupValue === undefined) {
        this.$store.commit('error', `Shape is missing property "${joinShapesBy}"`)
      }

      const row = lookup[lookupValue]
      if (row === undefined) {
        boundary.properties.value = 'N/A'
      } else {
        boundary.properties.value = this.dataRows[datasetValuesCol].values[row]
      }
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

      const offset = lookup[centroidId]
      if (offset !== undefined) {
        centroid.properties!.value = this.dataRows[datasetValuesCol].values[offset]
      } else centroid.properties!.value = 'N/A'
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
    margin-left: auto;
    width: 8rem;
  }

  .img-button {
    margin-right: 0.15rem;
    height: 2.5rem;
    width: 2.5rem;
    border: var(--borderThin);
    border-radius: 4px;
  }
  .img-button:hover {
    border: 2px solid var(--linkHover);
  }
}

@media only screen and (max-width: 640px) {
}
</style>
