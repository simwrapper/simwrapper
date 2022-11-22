<template lang="pug">
.map-layout
  flow-map-layer.map-layer(v-if="centroids.length"
    :viewId="viewId"
    :props="mapProps"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import * as turf from '@turf/turf'

import { FileSystemConfig, REACT_VIEW_HANDLES } from '@/Globals'
import FlowMapLayer from '@/layers/FlowMapLayer'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
// import globalStore from '@/store'

export default defineComponent({
  name: 'FlowmapLayerPanel',
  components: { FlowMapLayer },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
  },
  data: () => {
    return {
      fileApi: null as HTTPFileSystem | null,
      boundaries: [] as any[],
      centroids: [] as { id: any; name?: any; lat: number; lon: number }[],
      flows: [] as any[],
      viewId: ('id-' + Math.random()) as any,
      startTime: Date.now(),
      elapsed: 0,
      animator: null as any,
    }
  },
  async mounted() {
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)

    // load the boundaries and the dataset, use promises so we can clear
    // the spinner when things are finished.  MUST be in this order
    // or the flowmap gets sad if dataset loads faster than boundaries do.
    await this.loadBoundaries()
    await this.loadDataset()

    this.updateChart()

    this.$emit('isLoaded')

    this.animate()
  },

  beforeDestroy() {
    if (this.animator) window.cancelAnimationFrame(this.animator)

    // MUST delete the React view handle to prevent gigantic memory leak!
    delete REACT_VIEW_HANDLES[this.viewId]
  },
  watch: {
    '$store.state.viewState'() {
      this.viewMoved()
    },
  },

  methods: {
    get mapProps(): any {
      return {
        locations: this.centroids,
        flows: this.flows,
        dark: this.$store.state.isDarkMode,
        elapsed: this.elapsed,
      }
    },

    viewMoved() {
      if (!REACT_VIEW_HANDLES[this.viewId]) return
      REACT_VIEW_HANDLES[this.viewId]()
    },

    animate() {
      setTimeout(() => {
        this.elapsed = (Date.now() - this.startTime) * 0.05
        this.animator = window.requestAnimationFrame(this.animate)
      }, 33)
    },

    async loadBoundaries() {
      if (!this.config.boundaries) return

      try {
        if (this.config.boundaries.startsWith('http')) {
          const boundaries = await fetch(this.config.boundaries).then(async r => await r.json())
          this.boundaries = boundaries.features
        } else {
          const boundaries = await this.fileApi?.getFileJson(
            `${this.subfolder}/${this.config.boundaries}`
          )
          this.boundaries = boundaries?.features || []
        }
      } catch (e) {
        console.error(e)
        return
      }
      this.calculateCentroids()
    },

    calculateCentroids() {
      for (const feature of this.boundaries) {
        const centroid: any = turf.centerOfMass(feature as any)
        if (feature.properties[this.config.boundariesLabel]) {
          centroid.properties.label = feature.properties[this.config.boundariesLabel]
        }
        centroid.properties.id = feature.properties[this.config.boundariesJoinCol]

        this.centroids.push({
          id: `${centroid.properties.id}`,
          lon: centroid.geometry.coordinates[0],
          lat: centroid.geometry.coordinates[1],
        })
      }
      console.log({ centroids: this.centroids })
      // for (const c of this.centroids) console.log(`${c.id},${c.lon},${c.lat}`)
    },

    async loadDataset() {
      try {
        const dataset = await this.datamanager.getDataset(this.config)
        // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

        const data = dataset.allRows || ({} as any)

        // assumes flow data has "origin,destination,count" columns
        const origin = data.origin.values
        const destination = data.destination.values
        const count = data.count.values

        const flows = [] as any[]
        for (let i = 0; i < origin.length; i++) {
          flows.push({
            o: `${origin[i]}`,
            d: `${destination[i]}`,
            v: count[i],
          })
        }
        this.flows = flows
      } catch (e) {
        const message = '' + e
        console.log(message)
        this.flows = []
      }
      console.log({ flows: this.flows })
    },

    updateChart() {
      // nothing, for now
    },
  },
})
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

.map-layer {
  flex: 1;
}

@media only screen and (max-width: 640px) {
}
</style>
