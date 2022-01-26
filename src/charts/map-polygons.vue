<template lang="pug">
.map-layout
  polygon-and-circle-map.choro-map(:props="mapProps")
  zoom-buttons

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

import { DataTableColumn, FileSystemConfig } from '@/Globals'
import PolygonAndCircleMap from '@/components/PolygonAndCircleMap.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { PolygonAndCircleMap, ZoomButtons } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop({ required: true }) datamanager!: DashboardDataManager

  private fileApi!: HTTPFileSystem
  private boundaries: any[] = []
  private centroids: any[] = []

  private dataRows: { [column: string]: DataTableColumn } = {}

  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private maxValue = 1000
  private expColors = false

  private get mapProps() {
    return {
      useCircles: this.useCircles,
      data: this.useCircles ? this.centroids : this.boundaries,
      dark: this.$store.state.isDarkMode,
      colors: 'viridis',
      activeColumn: this.activeColumn,
      maxValue: this.maxValue,
      opacity: this.sliderOpacity,
      expColors: this.expColors,
    }
  }

  private async mounted() {
    this.expColors = this.config.exponentColors

    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
    // bulmaSlider.attach()

    // load the boundaries and the dataset, use promises so we can clear
    // the spinner when things are finished
    await Promise.all([this.loadBoundaries(), this.loadDataset()])
    this.updateChart()

    this.$emit('isLoaded')
  }

  private beforeDestroy() {
    this.datamanager.removeFilterListener(this.config, this.handleFilterChanged)
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
    if (!this.config.boundaries) return

    try {
      if (this.config.boundaries.startsWith('http')) {
        const boundaries = await fetch(this.config.boundaries).then(async r => await r.json())
        this.boundaries = boundaries.features
      } else {
        const boundaries = await this.fileApi.getFileJson(
          `${this.subfolder}/${this.config.boundaries}`
        )
        this.boundaries = boundaries.features
      }
    } catch (e) {
      console.error(e)
      return
    }
    this.calculateCentroids()
  }

  private calculateCentroids() {
    for (const feature of this.boundaries) {
      const centroid = turf.centerOfMass(feature as any)
      if (!centroid.properties) centroid.properties = {}

      if (feature.properties[this.config.boundariesLabel]) {
        centroid.properties.label = feature.properties[this.config.boundariesLabel]
      }
      centroid.properties.id = feature.properties[this.config.boundariesJoinCol]

      this.centroids.push(centroid)
    }
  }

  private async loadDataset() {
    try {
      const dataset = await this.datamanager.getDataset(this.config)
      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
      this.dataRows = dataset.allRows
    } catch (e) {
      const message = '' + e
      console.log(message)
    }
    return []
  }

  private updateChart() {
    // Data comes back as an object of columnName: values[].
    // We need to make a lookup of the values by ID and then
    // insert those values into the boundaries geojson.

    if (!this.config.datasetJoinCol || !this.config.boundariesJoinCol) {
      throw Error('Config requires datasetJoinCol and boundariesJoinCol')
    }

    if (!this.dataRows[this.config.datasetJoinCol])
      throw Error('Cannot find column ' + this.config.datasetJoinCol)
    // if (!this.dataRows[this.config.boundariesJoinCol])
    //   throw Error('Cannot find column ' + this.config.boundariesJoinCol)

    // 1. build the offset lookup
    const lookup: any = {}
    const joinCol = this.dataRows[this.config.datasetJoinCol].values
    for (let i = 0; i < joinCol.length; i++) {
      lookup[joinCol[i]] = i // lookup in geojson will be the offset
    }

    // 2. insert values into geojson
    const idColumn = this.config.boundariesJoinCol
    let vMax = -1
    this.boundaries.forEach(boundary => {
      const lookupValue = boundary.properties[idColumn]
      const row = lookup[lookupValue]
      if (row === undefined) {
        boundary.properties.value = 'N/A'
      } else {
        boundary.properties.value = this.dataRows[this.config.datasetValue].values[row]
        if (row) vMax = Math.max(vMax, row[this.config.datasetValue])
      }
    })

    this.maxValue = this.dataRows[this.config.datasetValue].max || 0

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
        centroid.properties!.value = this.dataRows[this.config.datasetValue].values[offset]
      } else centroid.properties!.value = 'N/A'
    })

    centerLong /= this.centroids.length
    centerLat /= this.centroids.length

    this.$store.commit('setMapCamera', {
      longitude: centerLong,
      latitude: centerLat,
      bearing: 0,
      pitch: 0,
      zoom: 7,
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
