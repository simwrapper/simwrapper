<template lang="pug">
.map-layout
  polygon-and-circle-map.choro-map(:props="mapProps")

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
import { Worker, spawn, Thread } from 'threads'
import bulmaSlider from 'bulma-slider'
import * as turf from '@turf/turf'

import { FileSystemConfig } from '@/Globals'
import PolygonAndCircleMap from '@/components/PolygonAndCircleMap.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { PolygonAndCircleMap } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop({ required: true }) datamanager!: DashboardDataManager

  private fileApi!: HTTPFileSystem
  private thread!: any
  private boundaries: any[] = []
  private centroids: any[] = []

  private dataRows: any[] = []
  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private globalState = this.$store.state

  private maxValue = 1000
  private expColors = this.config.exponentColors

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

    // const { allRows } = await this.datamanager.getDataset(this.config)
    // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

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
      const centroid: any = turf.centerOfMass(feature as any)
      if (feature.properties[this.config.boundariesLabel]) {
        centroid.properties.label = feature.properties[this.config.boundariesLabel]
      }
      centroid.properties.id = feature.properties[this.config.boundariesJoinCol]

      this.centroids.push(centroid)
    }
  }

  private async loadDataset() {
    // cancel any loose threads first
    if (this.thread) Thread.terminate(this.thread)
    this.thread = await spawn(new Worker('../workers/DataFetcher.thread'))

    try {
      const data = await this.thread.fetchData({
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
        config: this.config,
      })

      this.dataRows = data
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataRows = []
    } finally {
      Thread.terminate(this.thread)
    }
  }

  private updateChart() {
    // Data comes back as an array of objects with elements.
    // We need to make a lookup of the values by ID and then
    // insert those values into the boundaries geojson.

    if (!this.config.datasetJoinCol || !this.config.boundariesJoinCol) {
      console.error('Cannot make map without datasetJoinCol and boundariesJoinCol')
      return
    }

    // 1. make the lookup
    const lookup: any = {}
    const id = this.config.datasetJoinCol
    this.dataRows.forEach(row => {
      if (row[id]) lookup[`${row[id]}`] = row // lookup in geojson is always string
    })

    // 2. insert values into geojson
    const idColumn = this.config.boundariesJoinCol
    let vMax = -1
    this.boundaries.forEach(boundary => {
      const lookupValue = boundary.properties[idColumn]
      const row = lookup[lookupValue]
      boundary.properties.value = row ? row[this.config.datasetValue] : 'N/A'
      if (row) vMax = Math.max(vMax, row[this.config.datasetValue])
    })

    if (vMax) this.maxValue = vMax

    // 3. insert values into centroids
    this.centroids.forEach(centroid => {
      const lookupValue = centroid.properties!.id
      if (!lookupValue) return

      const answer = lookup[lookupValue]
      if (answer) centroid.properties!.value = answer[this.config.datasetValue]
      else centroid.properties!.value = 'N/A'
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
