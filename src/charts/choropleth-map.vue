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

@Component({ components: { PolygonAndCircleMap } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private fileApi!: HTTPFileSystem
  private thread!: any
  private boundaries: any[] = []
  private centroids: any[] = []

  private dataRows: any[] = []
  private activeColumn = ''
  private useCircles = false
  private sliderOpacity = 80

  private get mapProps() {
    return {
      useCircles: this.useCircles,
      data: this.useCircles ? this.centroids : this.boundaries,
      dark: this.$store.state.isDarkMode,
      colors: 'viridis',
      activeColumn: this.activeColumn,
      maxValue: 1000,
      opacity: this.sliderOpacity,
    }
  }

  private async mounted() {
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)
    // bulmaSlider.attach()
    // load the boundaries and the dataset, use promises so we can clear
    // the spinner when things are finished
    await Promise.all([this.loadBoundaries(), this.loadDataset()])

    this.$emit('isLoaded')
  }

  private async loadBoundaries() {
    if (!this.config.boundaries) return

    try {
      if (this.config.boundaries.startsWith('http')) {
        const boundaries = await fetch(this.config.boundaries).then(async r => await r.json())
        this.boundaries = boundaries.features
      } else {
        const boundaries = await this.fileApi.getFileJson(this.config.boundaries)
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
    if (!this.thread) {
      this.thread = await spawn(new Worker('../workers/DataFetcher.thread'))
    }

    try {
      const data = await this.thread.fetchData({
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
        config: this.config,
      })

      this.dataRows = data
      this.updateChart()
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
    this.boundaries.forEach(boundary => {
      const lookupValue = boundary.properties[idColumn]
      const answer = lookup[lookupValue]
      if (answer) boundary.properties.value = answer[this.config.datasetValue]
      else boundary.properties.value = 'N/A'
    })

    // 3. insert values into centroids
    this.centroids.forEach(centroid => {
      const lookupValue = centroid.properties!.id
      if (!lookupValue) return

      const answer = lookup[lookupValue]
      if (answer) centroid.properties!.value = answer[this.config.datasetValue]
      else centroid.properties!.value = 'N/A'
    })
    // sort them so big bubbles are below small bubbles
    this.centroids.sort((a: any, b: any) => (a.properties.value > b.properties.value ? -1 : 1))
    this.activeColumn = 'value'
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';
@import '../../node_modules/vue-slider-component/theme/default.css';

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
