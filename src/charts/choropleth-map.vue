<template lang="pug">
polygon-and-circle-map.choro-map(:props="mapProps")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'

import { FileSystemConfig } from '@/Globals'
import PolygonAndCircleMap from '@/components/PolygonAndCircleMap.vue'

@Component({ components: { PolygonAndCircleMap } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private thread!: any
  private boundaries: any[] = []
  private dataRows: any[] = []
  private activeColumn = ''

  @Watch('$store.state.isDarkMode') handleThemeChanged() {
    this.activeColumn = 'x' + this.activeColumn
  }

  private get mapProps() {
    return {
      shapefile: { data: this.boundaries, prj: 'EPSG:4326' },
      dark: this.$store.state.isDarkMode,
      colors: 'viridis',
      activeColumn: this.activeColumn,
      maxValue: 1000,
      opacity: 100,
    }
  }

  private async mounted() {
    // load the boundaries and the dataset, use promises so we can clear
    // the spinner when things are finished
    await Promise.all([this.loadBoundaries(), this.loadDataset()])

    this.$emit('isLoaded')
  }

  private async loadBoundaries() {
    if (!this.config.boundariesUrl) return

    try {
      const boundaries = await fetch(this.config.boundariesUrl).then(async r => await r.json())
      this.boundaries = boundaries.features
    } catch (e) {
      console.error(e)
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

    this.activeColumn = 'value'
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.choro-map {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}
@media only screen and (max-width: 640px) {
}
</style>
